#!/usr/bin/env node
// gate source-doc: code as documentation, minimum contract, on what is about to be committed.
//
// Reads the STAGED files (the commit index, not the tree) and fails with `file:line` when:
//   - a Python module has no module docstring;
//   - a public top-level Python `def`/`class` (name without a leading `_`) has no docstring;
//   - a public Python function has a name shorter than 3 characters (`a()`, `f()`): the name must tell the story;
//   - a TOML file does not open with a `#` comment saying what it controls;
//   - a shell script has no `#` header block after the shebang.
//
// Origin (ported, not reinvented): farmega.v2 `.ai/scripts/check_source_documentation.py` (module docstring, TOML
// and shell headers), farmega `docs/governance/python-standards.md` (Google docstrings on public API), fabber
// `FOUNDATION.md` §1 and kerr-crawler `code-as-doc` (descriptive names). The detection is a line heuristic so the
// gate needs only `node`; ruff `D`/`ANN` stays the full check where the consumer has Python.
//
// Parameters (optional, `[gates.params.source-doc]` in the consumer `.ai/tars.toml`):
//   allow = list of path fragments exempt from the gate (e.g. ["migrations/versions/"])
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aplicarBase } from '../lib-baseline.mjs'
import { isTracked, stagedPaths, trackedPaths } from '../lib-staged.mjs'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')
const allowedPathFragments = Array.isArray(params.allow) ? params.allow : []

const PYTHON_FILE = /\.py$/i
const TOML_FILE = /\.toml$/i
const SHELL_FILE = /\.(sh|bash)$/i
const HEADER_WINDOW_LINES = 12
const MIN_PUBLIC_NAME_LENGTH = 3
const PUBLIC_TOP_LEVEL_DEF = /^(?:async\s+)?(def|class)\s+([A-Za-z][A-Za-z0-9_]*)\b/
const DOCSTRING_START = /^\s*[rRbBuU]{0,2}("""|''')/

/** Python module docstring: the first statement (after comments, blank lines and `from __future__`) is a string. */
function pythonModuleDocstringFindings(path, lines) {
  for (const [index, line] of lines.entries()) {
    const code = line.trim()
    if (!code || code.startsWith('#')) continue
    if (DOCSTRING_START.test(code)) return []
    return [`${path}:${index + 1}: missing module docstring`]
  }
  return [`${path}:1: missing module docstring`]
}

/** Public top-level `def`/`class` must carry a docstring and a name that tells the story. */
function pythonPublicApiFindings(path, lines) {
  const findings = []
  for (const [index, line] of lines.entries()) {
    const match = PUBLIC_TOP_LEVEL_DEF.exec(line)
    if (!match || match[2].startsWith('_')) continue
    const [, kind, name] = match
    if (kind === 'def' && name.length < MIN_PUBLIC_NAME_LENGTH && !name.startsWith('test')) {
      findings.push(`${path}:${index + 1}: public function \`${name}\` needs a descriptive name`)
    }
    if (name.startsWith('test')) continue // test names are the documentation of the test
    let bodyStart = index
    while (bodyStart < lines.length && !/:\s*(#.*)?$/.test(lines[bodyStart])) bodyStart += 1
    const firstBodyLine = lines.slice(bodyStart + 1).find((candidate) => candidate.trim() && !candidate.trim().startsWith('#'))
    if (!firstBodyLine || !DOCSTRING_START.test(firstBodyLine)) {
      findings.push(`${path}:${index + 1}: public ${kind} \`${name}\` has no docstring`)
    }
  }
  return findings
}

/** TOML and shell: a `#` comment in the first lines says what the file controls (shebang does not count). */
function headerCommentFindings(path, lines, what) {
  const window = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith('#!')).slice(0, HEADER_WINDOW_LINES)
  return window.some((line) => line.startsWith('#')) ? [] : [`${path}:1: missing ${what} header comment`]
}

const staged = stagedPaths(project)
if (staged === null) { console.error('gate source-doc: no git; cannot list the staged files.'); process.exit(0) }
const tracked = trackedPaths(project)
// Nothing staged = PROOF MODE (`tars doctor` runs the doctrine proof on a clean tree): judge the tracked tree so
// the proof stays falsifiable. No staged files does NOT mean approved, and the gate says so.
const proofMode = staged.length === 0 || process.argv.includes('--findings')
if (proofMode) console.error('gate source-doc: nothing staged; judging the TRACKED TREE (proof mode); no staged files does NOT mean approved.')
const candidates = proofMode ? [...(tracked ?? [])] : staged.filter((file) => isTracked(tracked, file))
const judgedFiles = candidates.filter((file) => (PYTHON_FILE.test(file) || TOML_FILE.test(file) || SHELL_FILE.test(file))
  && !file.includes('/vendor/') && !file.startsWith('vendor/') && !allowedPathFragments.some((fragment) => file.includes(fragment)))

/** Shared with `tars gates baseline`: the `file:line: reason` findings, without deciding the exit code. */
export function collectFindings({ cwd = project } = {}) {
  const findings = []
  for (const file of judgedFiles) {
    let text
    try { text = readFileSync(join(cwd, file), 'utf8') } catch { continue } // removed from disk: nothing to judge
    const lines = text.split(/\r?\n/)
    if (PYTHON_FILE.test(file)) {
      if (!text.trim()) continue // empty `__init__.py` is a package marker, not a module
      findings.push(...pythonModuleDocstringFindings(file, lines), ...pythonPublicApiFindings(file, lines))
    } else if (TOML_FILE.test(file)) {
      findings.push(...headerCommentFindings(file, lines, 'TOML purpose'))
    } else {
      findings.push(...headerCommentFindings(file, lines, 'shell'))
    }
  }
  return findings
}

if (process.argv.includes('--findings')) {
  const findings = collectFindings()
  process.stdout.write(findings.length ? findings.join('\n') + '\n' : '')
  process.exit(0)
}

const findingKey = (finding) => finding.replace(/: .*$/, '')
const findingsByKey = new Map()
for (const finding of collectFindings()) {
  const key = findingKey(finding)
  // One line can break two rules (no docstring AND a short name): keep both reasons under the same baseline key.
  findingsByKey.set(key, findingsByKey.has(key) ? `${findingsByKey.get(key)}; ${finding.slice(key.length + 2)}` : finding)
}
// BASELINE: debt the project already adopted stays exempt; only NEW findings decide the exit code.
const { novos: newKeys, isentos: exemptKeys } = aplicarBase([...findingsByKey.keys()], {
  project,
  gate: process.env.TARS_GATE ?? 'source-doc',
  trechoDe: (key) => {
    const match = /^(.*?):(\d+)$/.exec(key)
    if (!match) return ''
    try { return readFileSync(join(project, match[1]), 'utf8').split(/\r?\n/)[Number(match[2]) - 1] ?? '' } catch { return '' }
  },
})

if (newKeys.length) {
  console.error('\ngate source-doc: code is not documenting itself in what is about to be committed:')
  for (const key of newKeys) console.error(`  ${findingsByKey.get(key)}`)
  if (exemptKeys.length) console.error(`\n  (+${exemptKeys.length} in the baseline: adopted debt, does not fail)`)
  console.error('\n  Module docstring in every .py, docstring on every public def/class, descriptive names, and a `#` header')
  console.error('  in every .toml and .sh (doctrine `code/code-as-doc`, .ai/governance/engineering-standards.md).')
  process.exit(1)
}
process.exit(0)
