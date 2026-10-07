#!/usr/bin/env node
// `tars sync` — puxa do catalogo Tars SO' o declarado no `.ai/tars.toml` do PROJETO
// consumidor, para `.ai/base/`, e trava versao+sha256 em `.ai/tars.lock` (docs/TARS.md
// §Manifesto, fatias 2-3). Estende o formato do `ai-skills-sync.mjs` (mesmo lockfileVersion,
// mesmos nomes de flag) em vez de criar um terceiro fetcher: aqui a origem e' o PROPRIO
// Tars em disco (nao a API do GitHub), porque o consumidor tem a base local.
//
// O que ele faz:
//   * le `[tars]` (version/skills/rules/memory) e `[gates]` (pre-commit/commit-msg/pre-push/local) do
//     `.ai/tars.toml` do consumidor;
//   * copia cada item declarado de `<tars>/<area>/<item>` para `.ai/base/<area>/<item>`;
//   * escreve `.ai/tars.lock` com a versao do Tars, o commit resolvido e o sha256 de cada
//     arquivo copiado (arquivo de CONTEUDO, nao segredo);
//   * item declarado que nao existe no Tars -> falha RUIDOSA (exit 1, nomeando o item);
//   * base editada a mao no projeto -> drift ACUSA e nao sobrescreve calado (exit 1);
//   * rodar de novo sem mudanca -> nada muda (idempotente).
//
// SO' os gates DECLARADOS vem (a fatia 4): o catalogo tem varios; o consumidor paga o
// peso so' do que usa. O `local` do manifesto e' do PROJETO (moradia propria, nao entra no
// lock) — quem o roda e' o motor `tars-hooks.mjs`, nao o sync.
//
// Uso (dentro do projeto consumidor):
//   node <tars>/tools/framework/tars-sync.mjs [--tars <dir>] [--project <dir>] [--check]
//   --tars     raiz do Tars (default: $TARS_HOME, senao sobe daqui procurando `.ai/VERSION`)
//   --project  raiz do projeto consumidor (default: cwd)
//   --check    so' valida a base contra o lock, sem escrever nada (e' o gate)
//
// Sem TOML externo: o `.ai/tars.toml` e' um arquivo nosso, de chaves simples, e o parser
// aqui cobre so' o que ele usa (secoes, listas de string, escalares) — KISS, sem dependencia.

import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const AREAS = ['skills', 'rules', 'memory', 'gates', 'guards', 'governance']
/** Nomes que o manifesto pode declarar em `[gates]` (docs/TARS.md §Modelo). */
export const HOOKS = ['pre-commit', 'commit-msg', 'pre-push', 'local']

// ---------------------------------------------------------------------------
// Parser TOML minimo: secoes `[x]`, `chave = valor` e listas de string (uma linha
// ou multilinha com `[` ... `]`). Comentario `#` fora de string e' descartado.
// ---------------------------------------------------------------------------
export function parseToml(text) {
  const out = {}
  let section = out
  let key = null // chave cuja lista ainda esta' aberta (multilinha)
  let buffer = ''

  const flush = () => {
    const m = buffer.match(/^\[([\s\S]*)\]$/)
    if (!m) throw new Error(`lista TOML nao fechada: ${buffer}`)
    const vals = list(m[1])
    section[key] = key in section ? [...section[key], ...vals] : vals
    key = null
    buffer = ''
  }

  for (const raw of text.split('\n')) {
    const line = stripComment(raw)
    if (key) {
      // Dentro de uma lista multilinha nao ha chave nem secao: so' mais valores e o `]`.
      buffer += ' ' + line.trim()
      if (!line.includes(']')) continue
      flush()
      continue
    }
    const trimmed = line.trim()
    if (!trimmed) continue
    const sec = trimmed.match(/^\[([^\]]+)\]$/)
    if (sec) {
      // Secao aninhada de verdade (`[gates.params.g2]` cria o objeto no caminho) — o
      // manifesto usa isso para os parametros por gate.
      const caminho = sec[1].split('.')
      let alvo = out
      for (const parte of caminho.slice(0, -1)) alvo = alvo[parte] ??= {}
      section = alvo[caminho.at(-1)] ??= {}
      continue
    }
    const kv = trimmed.match(/^([A-Za-z_][\w.-]*)\s*=\s*(.+)$/)
    if (!kv) throw new Error(`linha TOML nao entendida: ${trimmed}`)
    const [, k, rest] = kv
    if (rest.startsWith('[') && !rest.includes(']')) {
      key = k
      buffer = rest
      continue
    }
    section[k] = value(rest)
  }
  if (key) throw new Error(`lista TOML nao fechada: ${buffer}`)
  return out
}

const stripComment = (line) => {
  let inStr = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inStr = !inStr
    else if (c === '#' && !inStr) return line.slice(0, i)
  }
  return line
}

function value(rest) {
  const t = rest.trim()
  if (t.startsWith('[')) {
    const m = t.match(/^\[([\s\S]*)\]$/)
    if (!m) throw new Error(`lista TOML nao fechada: ${t}`)
    return list(m[1])
  }
  const s = t.match(/^"(.*)"$/)
  return s ? s[1] : t
}

const list = (inner) =>
  inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^"(.*)"$/)
      return m ? m[1] : s
    })

// ---------------------------------------------------------------------------
// Manifesto do consumidor
// ---------------------------------------------------------------------------
export async function readManifest(project) {
  const file = join(project, '.ai', 'tars.toml')
  if (!existsSync(file)) throw new Error(`falta ${relative(project, file) || file} no projeto consumidor`)
  const cfg = parseToml(await readFile(file, 'utf8'))
  const tars = cfg.tars
  if (!tars) throw new Error('.ai/tars.toml sem secao [tars]')
  const gates = cfg.gates ?? {}
  // `local` e' a unica lista do manifesto que NAO vem do catalogo: gate que mora no projeto.
  // Chave desconhecida em `[gates]` e' erro de digitacao (ex.: `precommit`) e calaria o gate;
  // `params` e' a configuracao por gate (docs/TARS.md: "os parametros vem do config do projeto").
  for (const key of Object.keys(gates)) {
    if (key !== 'params' && !HOOKS.includes(key)) {
      throw new Error(`[gates] do .ai/tars.toml tem chave desconhecida: '${key}' (use ${HOOKS.join(', ')})`)
    }
  }
  return {
    version: tars.version ?? null,
    skills: tars.skills ?? [],
    rules: tars.rules ?? [],
    memory: tars.memory ?? [],
    guards: tars.guards ?? [],
    governance: tars.governance ?? [],
    gates,
  }
}

/** Itens do catalogo a copiar (tudo, menos o `local`, que e' do projeto). */
export const declare = (manifest) =>
  AREAS.flatMap((area) =>
    area === 'gates'
      ? HOOKS.filter((h) => h !== 'local').flatMap((h) => (manifest.gates[h] ?? []).map((item) => ({ area, item })))
      : manifest[area].map((item) => ({ area, item })),
  )

// ---------------------------------------------------------------------------
// Tars de origem
// ---------------------------------------------------------------------------
function looksLikeTars(dir) {
  return existsSync(join(dir, '.ai', 'VERSION'))
}

export function findTars(start = HERE) {
  if (process.env.TARS_HOME && looksLikeTars(process.env.TARS_HOME)) return resolve(process.env.TARS_HOME)
  for (let dir = start; ; dir = dirname(dir)) {
    if (looksLikeTars(dir)) return dir
    if (dirname(dir) === dir) break
  }
  throw new Error('nao achei a raiz do Tars (use --tars <dir> ou TARS_HOME)')
}

function tarsVersion(tars) {
  const v = join(tars, '.ai', 'VERSION')
  return existsSync(v) ? readFile(v, 'utf8').then((s) => s.trim()) : null
}

function tarsCommit(tars) {
  try {
    return execFileSync('git', ['-C', tars, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------
export async function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)))
    else if (entry.isFile()) out.push(relative(base, full).split('\\').join('/'))
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

export async function hashSource(dest) {
  if (existsSync(dest) && statSync(dest).isFile()) return sha256(await readFile(dest))
  const h = createHash('sha256')
  const files = await listFiles(dest)
  // Pasta VAZIA nao e' copiavel: `cp` de um diretorio sem arquivo nao cria nada no destino,
  // entao o item ficaria eternamente "nao copiado" e o sync reescreveria a base a cada rodada.
  // O hash do diretorio existente (vazio) e' o hash do nada: casa com o lock e para o laco.
  if (!files.length) return sha256(Buffer.alloc(0))
  for (const rel of files) {
    h.update(rel)
    h.update('\0')
    h.update(await readFile(join(dest, rel)))
    h.update('\0')
  }
  return 'sha256-' + h.digest('hex')
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
// Layout do catalogo no Tars (`.ai/`): skill e gate sao PASTA (`skills/<nome>/`,
// `gates/<nome>/`); regra e fato de memoria sao ARQUIVO (`rules/<nome>.md`,
// `memory/agent/<nome>.md`). O manifesto declara o NOME, sem extensao e sem pasta — quem
// sabe onde o item mora e' este mapa (SSOT).
const LAYOUT = {
  skills: (item) => ({ path: join('skills', item), ext: '' }),
  rules: (item) => ({ path: join('rules', item), ext: '.md' }),
  // Fato de memoria: o manifesto declara o nome do ARQUIVO como ele e' (`db` -> `db.md`);
  // `.jsonl` ja' vem com a extensao no nome (o manifesto nao a inventa).
  memory: (item) => ({ path: join('memory', 'agent', item), ext: item.endsWith('.jsonl') ? '' : '.md' }),
  gates: (item) => ({ path: join('gates', item), ext: '' }),
  // Guard e' ARQUIVO (`.ai/guards/<nome>.<ext>`): o manifesto declara o nome COM a extensao
  // quando ela nao e' `.sh` (o `ensure_memory_link.py` e' guard de verdade, nao sobra); sem
  // extensao assume `.sh`. O modo executavel vem junto (o `cp` preserva) — guard que nao
  // executa nao guarda.
  guards: (item) => ({ path: join('guards', item), ext: /\.[a-z0-9]+$/.test(item) ? '' : '.sh' }),
  // Governanca e' ARQUIVO markdown solto (`.ai/governance/<nome>.md`), igual a regra.
  governance: (item) => ({ path: join('governance', item), ext: '.md' }),
}

/** Fonte do item no Tars, relativa a `.ai/`. */
export const sourceOf = ({ area, item }) => {
  const { path: p, ext } = LAYOUT[area](item)
  return p + ext
}

/** Destino do item no projeto, relativo a `.ai/base/`. */
export const destOf = ({ area, item }) => {
  const { path: p, ext } = LAYOUT[area](item)
  return p + ext
}

/**
 * Compara o declarado com o que esta' em disco. Devolve:
 *   missing  — item declarado que o Tars nao tem (falha ruidosa)
 *   stale    — copiado com hash diferente do lock (base editada a mao = drift)
 *   absent   — declarado, ainda nao copiado
 *   copied   — copiado e batendo com o lock
 */
export async function plan({ tars, project, manifest, lock }) {
  const missing = []
  const stale = []
  const absent = []
  const copied = []
  for (const entry of declare(manifest)) {
    const src = join(tars, '.ai', sourceOf(entry))
    const dest = join(project, '.ai', 'base', destOf(entry))
    if (!existsSync(src)) {
      missing.push(entry)
      continue
    }
    if (!existsSync(dest)) {
      absent.push(entry)
      continue
    }
    const locked = lock?.files?.[destOf(entry)]?.sha256
    const got = await hashSource(dest)
    if (locked && got !== locked) stale.push({ ...entry, want: locked, got })
    else copied.push(entry)
  }
  return { missing, stale, absent, copied }
}

/**
 * Fato da camada base ganha `source: "base"` na copia (TARS-MEM-2): o `ai-memory` do
 * consumidor le base+projeto e sem a marca nao distingue de onde veio o fato — o indice
 * do boot sairia sem procedencia. O catalogo (origem) fica intacto: so' a copia muda.
 * JSONL e' uma linha por fato; qualquer outra forma (agent/<name>.md) vai como esta'.
 */
export async function stampSource(dest) {
  if (!dest.endsWith('.jsonl')) return
  const out = []
  for (const line of (await readFile(dest, 'utf8')).split('\n')) {
    if (!line.trim()) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      out.push(line) // linha ilegivel nao e' nossa para consertar (o gate do ai-memory acusa)
      continue
    }
    out.push(JSON.stringify(e?.source ? e : { ...e, source: 'base' }))
  }
  await writeFile(dest, out.length ? out.join('\n') + '\n' : '')
}

async function copyItem(tars, project, entry) {
  const src = join(tars, '.ai', sourceOf(entry))
  const dest = join(project, '.ai', 'base', destOf(entry))
  await mkdir(dirname(dest), { recursive: true })
  await rm(dest, { recursive: true, force: true })
  await cp(src, dest, { recursive: true })
  if (entry.area === 'memory') await stampSource(dest)
  return hashSource(dest)
}

export async function sync({ tars = findTars(), project = process.cwd(), check = false, log = console.log } = {}) {
  const manifest = await readManifest(project)
  const lockPath = join(project, '.ai', 'tars.lock')
  const lock = existsSync(lockPath) ? JSON.parse(await readFile(lockPath, 'utf8')) : null
  const { missing, stale, absent, copied } = await plan({ tars, project, manifest, lock })

  if (check) {
    if (missing.length) for (const e of missing) log(`falta no tars: ${e.area}/${e.item}`)
    if (stale.length) for (const e of stale) log(`drift: ${e.area}/${e.item} (${e.got} != lock ${e.want})`)
    if (absent.length) for (const e of absent) log(`nao copiado: ${e.area}/${e.item}`)
    return { missing, stale, absent, copied, wrote: [] }
  }

  // Falha RUIDOSA antes de escrever qualquer coisa: item declarado que o Tars nao tem.
  if (missing.length) {
    const names = missing.map((e) => `  - ${e.area}: ${e.item}`).join('\n')
    throw new Error(`item declarado que nao existe no Tars:\n${names}`)
  }
  // Drift: a base foi editada a mao no projeto. Nao sobrescreve calado.
  if (stale.length) {
    const names = stale.map((e) => `  - .ai/base/${e.area}/${e.item} (${e.got} != lock ${e.want})`).join('\n')
    throw new Error(`base editada a mao no projeto (drift, nada sobrescrito):\n${names}\n` +
      `Reverta com git ou apague .ai/base/<area>/<item> para recopiar do Tars.`)
  }

  const files = {}
  const wrote = []
  for (const entry of declare(manifest)) {
    const key = destOf(entry)
    const locked = lock?.files?.[key]?.sha256
    const dest = join(project, '.ai', 'base', destOf(entry))
    const got = existsSync(dest) && locked ? await hashSource(dest) : null
    if (got === locked) {
      files[key] = lock.files[key] // idempotente: nao reescreve
      continue
    }
    files[key] = { area: entry.area, item: entry.item, sha256: await copyItem(tars, project, entry) }
    wrote.push(key)
    log(`copia ${key}  ${files[key].sha256}`)
  }

  const next = {
    lockfileVersion: 1,
    tars: { version: manifest.version ?? (await tarsVersion(tars)), commit: tarsCommit(tars) },
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  }
  const body = JSON.stringify(next, null, 2) + '\n'
  const before = existsSync(lockPath) ? await readFile(lockPath, 'utf8') : null
  if (body !== before) await writeFile(lockPath, body)
  log(
    wrote.length
      ? `sync: ${wrote.length} item(ns), ${Object.keys(files).length} no lock (${relative(project, lockPath)}).`
      : `sync: nada mudou, ${Object.keys(files).length} item(ns) ja' em dia.`,
  )
  return { missing, stale, absent, copied, wrote, lock: next }
}

// ---------------------------------------------------------------------------
// init — porta de entrada do consumidor (docs/TARS.md §Catalogo-alvo: "a porta de
// entrada e' `tars init`"). Cria o manifesto minimo e a memoria vazia, e ja' roda o
// sync: projeto que nao consome nada nao precisa de `tars.toml`.
// ---------------------------------------------------------------------------
export const MANIFEST_TEMPLATE = `# Manifesto do consumidor do Tars (docs/TARS.md §Modelo). So' o DECLARADO vem.
# As listas abaixo estao vazias de proposito: descomente e preencha o que este projeto
# usa. O MOTOR vem sempre (ai-memory, ai-layer-check, o sync e os hooks), sem declarar.
[tars]
version = "\${version}"
skills  = []                                        # ex.: ["agent-coordination", "segtools-sdd"]
rules   = []                                        # ex.: ["base"]
memory  = []                                        # fatias da memoria base por tema, ex.: ["git", "db"]
guards  = []                                        # ex.: ["block-secret-dump", "sessionstart-context-digest"]
governance = []                                     # ex.: ["EVOLUTION", "source-of-truth"]

[gates]
pre-commit = []                                     # do catalogo: commit-msg, gitleaks, no-add-all, layout-check, ds-gate
pre-push   = []                                     # do catalogo: full-check
local      = []                                     # do PROJETO (moradia propria, nao entra no lock): ex.: ["tools/gates/meu.sh"]
`

/** Cria o manifesto minimo e a memoria vazia, e sincroniza. */
export async function init({ tars = findTars(), project = process.cwd(), log = console.log } = {}) {
  const manifestPath = join(project, '.ai', 'tars.toml')
  // Falha RUIDOSA antes de escrever: projeto que ja' tem manifesto nao e' inicializado
  // por cima (o `init` nunca adivinha o que era do projeto).
  if (existsSync(manifestPath)) throw new Error(`ja' existe ${relative(project, manifestPath)} — projeto ja' inicializado (edite a mao)`)
  const version = (await tarsVersion(tars)) ?? 'v0.0'
  await mkdir(join(project, '.ai', 'memory'), { recursive: true })
  await writeFile(manifestPath, MANIFEST_TEMPLATE.replace('${version}', version))
  const r = await sync({ tars, project, log })
  log(`init: ${relative(project, manifestPath)} + .ai/memory/ criados (Tars ${version}); rode \`tars sync\` apos declarar itens.`)
  return { manifest: manifestPath, version, wrote: r.wrote }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

// `bun build --compile`: EM TODO modulo embutido o `import.meta.url` vira o do entrypoint
// (`/$bunfs/root/tars`), entao este guarda passaria a ser verdadeiro tambem quando o
// `tars.mjs` apenas importa o modulo — o `dist/tars --help` respondia com o main daqui.
// `tars` marcado no argv desativa o auto-run (tars.mjs) sem tirar o uso direto do arquivo.
if (!process.env.TARS_AS_MODULE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [cmd = 'sync'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const check = process.argv.includes('--check')
  try {
    const opts = {
      tars: resolve(arg('--tars') ?? findTars()),
      project: resolve(arg('--project') ?? process.cwd()),
    }
    if (cmd === 'init') {
      await init(opts)
    } else if (cmd === 'sync') {
      const r = await sync({ ...opts, check })
      const bad = check && (r.missing.length || r.stale.length || r.absent.length)
      if (bad) {
        console.error('\nbase do Tars inconsistente (rode `tars sync`).')
        process.exit(1)
      }
      if (check) console.log('base do Tars ok.')
    } else {
      throw new Error(`comando desconhecido: '${cmd}' (use sync | init)`)
    }
  } catch (err) {
    console.error(`tars ${cmd}: ${err.message}`)
    process.exit(1)
  }
}
