#!/usr/bin/env node
// Catalogo de skills de terceiros (ADR-019 rev. 2, camada 4 / SEG-846).
//
// Por que um fetcher proprio e nao o `rulesync install` (que declaramos em `rulesync.jsonc`
// como a FONTE da verdade do catalogo): o decode de conteudo do rulesync 25.0.0 passa tudo
// por UTF-8 e destroi binarios — cada byte >= 0x80 vira U+FFFD, entao o PNG `89 50 4e 47`
// chega como `EF BF BD 50 4E 47` em TODO transporte (github e git). O `--mode gh` ainda
// injeta frontmatter de proveniencia e resolve a ref so' para a release mais recente. A API
// do GitHub, em contrapartida, devolve o conteudo em base64 fiel (`.content`), que e' o que
// este script usa. Ver a issue SEG-846.
//
// O que ele faz:
//   * le `rulesync.jsonc > sources` como a LISTA do catalogo (fonte unica);
//   * resolve `owner/repo` -> commit de `ref` (default: branch default) e trava repo/caminho/
//     commit/hash em `.ai/skills.lock.json`;
//   * baixa cada skill em `path/<nome>/` pelo base64 da API (arquivo a arquivo, fiel);
//   * copia para `.ai/skills/<nome>/`, que e' a FONTE neutra que o `ai:generate` le.
//
// Uso:
//   node tools/framework/ai-skills-sync.mjs --update   # resolve a ref de novo e atualiza o lock
//   node tools/framework/ai-skills-sync.mjs            # restaura pelo commit travado (AC-02)
//   node tools/framework/ai-skills-sync.mjs --check     # so' valida .ai/skills/ contra o lock
//
// Token: usa `GITHUB_TOKEN`/`GH_TOKEN` (ou `gh auth token`) se houver — sem ele, a API publica
// funciona dentro do limite anonimo.

import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONFIG = join(REPO, 'rulesync.jsonc')
const TARGET = join(REPO, '.ai', 'skills')
const LOCK = join(REPO, '.ai', 'skills.lock.json')

const mode = process.argv.includes('--update') ? 'update' : process.argv.includes('--check') ? 'check' : 'restore'
const API = 'https://api.github.com'

function token() {
  for (const v of ['GITHUB_TOKEN', 'GH_TOKEN']) if (process.env[v]) return process.env[v]
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

async function api(path) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'segtools-ai-skills' }
  const t = token()
  if (t) headers.authorization = `Bearer ${t}`
  const res = await fetch(`${API}${path}`, { headers })
  if (!res.ok) throw new Error(`GitHub ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Le o array `sources` do rulesync.jsonc. O arquivo tem comentarios; tiramos `//` de linha
// inteira e de fim de linha (nao ha `//` dentro de string nos nossos valores).
function readSources(text) {
  const stripped = text
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .map((l) => l.replace(/\s+\/\/.*$/, ''))
    .join('\n')
  const cfg = JSON.parse(stripped)
  return (cfg.sources ?? []).map((s) => {
    const m = String(s.source).match(/^(?:https?:\/\/github\.com\/)?([^/@:]+)\/([^/@:]+?)(?:\.git)?$/)
    if (!m) throw new Error(`source nao suportado: ${s.source} (espero owner/repo)`)
    return {
      owner: m[1],
      repo: m[2],
      path: s.path ?? 'skills',
      skills: s.skills ?? ['*'],
      ref: s.ref ?? null,
    }
  })
}

// Lista os arquivos de um diretorio recursivo, caminhos relativos.
async function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)))
    else if (entry.isFile()) out.push(relative(base, full))
  }
  return out.sort((a, b) => a.localeCompare(b))
}

// sha256 do CONTEUDO: `caminho\0conteudo\0` de cada arquivo, na ordem. Independente do mtime.
async function hashDir(dir) {
  const h = createHash('sha256')
  for (const rel of await listFiles(dir)) {
    h.update(rel)
    h.update('\0')
    h.update(await readFile(join(dir, rel)))
    h.update('\0')
  }
  return 'sha256-' + h.digest('hex')
}

// Baixa `path/<name>/` do commit travado, arquivo a arquivo, pelo base64 da API. O
// `git/trees` da' a arvore recursiva (inclui subpastas como assets/, rules/, evals/) e o
// `git/blobs` da' o conteudo fiel — a API REST de `contents` corta em 1MB por arquivo.
async function fetchSkill({ owner, repo, path, commit, name, dest }) {
  const tree = await api(`/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`)
  const prefix = `${path}/${name}/`
  const files = tree.tree.filter((n) => n.type === 'blob' && n.path.startsWith(prefix))
  if (files.length === 0) throw new Error(`${prefix} nao existe em ${owner}/${repo}@${commit}`)
  await rm(dest, { recursive: true, force: true })
  for (const f of files) {
    const rel = f.path.slice(prefix.length)
    const blob = await api(`/repos/${owner}/${repo}/git/blobs/${f.sha}`)
    const bytes = Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8')
    const out = join(dest, rel)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, bytes)
  }
  return hashDir(dest)
}

async function resolveCommit({ owner, repo, ref }) {
  if (ref && /^[0-9a-f]{40}$/.test(ref)) return ref
  if (ref) return (await api(`/repos/${owner}/${repo}/commits/${ref}`)).sha
  // Sem `ref`: a branch default. `/commits` (lista) devolve array; o 1o e' o head.
  const list = await api(`/repos/${owner}/${repo}/commits`)
  return (Array.isArray(list) ? list[0] : list).sha
}

async function main() {
  const lock = existsSync(LOCK) ? JSON.parse(await readFile(LOCK, 'utf8')) : { lockfileVersion: 1, sources: {} }
  const sources = readSources(await readFile(CONFIG, 'utf8'))
  const problems = []

  for (const src of sources) {
    const key = `${src.owner}/${src.repo}`
    const locked = lock.sources[key]
    let commit = locked?.commit
    if (mode === 'update' || !commit) commit = await resolveCommit(src)
    if (!commit) throw new Error(`nao resolvi o commit de ${key}@${src.ref ?? 'default'}`)

    const names =
      src.skills.includes('*') && mode === 'update'
        ? Object.keys(lock.sources[key]?.skills ?? {})
        : src.skills
    const targets = src.skills.includes('*')
      ? names.length
        ? names
        : await api(`/repos/${src.owner}/${src.repo}/contents/${src.path}?ref=${commit}`).then((e) =>
            e.filter((n) => n.type === 'dir').map((n) => n.name),
          )
      : src.skills

    const skills = {}
    for (const name of targets) {
      if (mode === 'check') {
        const want = locked?.skills?.[name]?.sha256
        const got = existsSync(join(TARGET, name)) ? await hashDir(join(TARGET, name)) : '(faltando)'
        if (want && got === want) console.log(`ok    ${name}  ${got}`)
        else problems.push(`divergente: .ai/skills/${name}/ (${got}) != lock (${want})`)
        continue
      }
      if (mode === 'restore') {
        if (!locked) {
          problems.push(`${key} nao esta no lock (rode --update)`)
          continue
        }
        const want = locked.skills?.[name]?.sha256
        const got = await fetchSkill({ ...src, commit, name, dest: join(TARGET, name) })
        skills[name] = { sha256: got }
        console.log(`restore ${name}  ${got}${got === want ? '' : `  (lock dizia ${want})`}`)
        continue
      }
      const got = await fetchSkill({ ...src, commit, name, dest: join(TARGET, name) })
      skills[name] = { sha256: got }
      console.log(`update  ${name}  ${got}`)
    }

    if (mode !== 'check') {
      lock.sources[key] = { owner: src.owner, repo: src.repo, path: src.path, commit, skills }
    }
  }

  if (mode === 'update') {
    await writeFile(LOCK, JSON.stringify(lock, null, 2) + '\n')
    console.log(`lock atualizado: ${relative(REPO, LOCK)}`)
  }

  if (problems.length) {
    console.error('\ncatalogo de skills INCONSISTENTE:')
    for (const p of problems) console.error(`  - ${p}`)
    console.error("\nPara reconciliar com o upstream: 'task ai:skills:restore'.")
    process.exit(1)
  }
  if (mode === 'check') console.log('catalogo ok.')
  else console.log(`${Object.values(lock.sources).reduce((n, s) => n + Object.keys(s.skills ?? {}).length, 0)} skill(s) em .ai/skills/.`)
}

await main()
