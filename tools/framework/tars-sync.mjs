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
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Caminho de ITEM (chave de lock, drift, poda) e' identificador: sempre `/`, nunca o
// separador da plataforma — senao o lock do Windows divergiria do Linux (tars-paths.mjs).
import { joinPosix, posix } from './tars-paths.mjs'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const AREAS = ['skills', 'rules', 'memory', 'gates', 'guards', 'governance']
/** Nomes que o manifesto pode declarar em `[gates]` (docs/TARS.md §Modelo). */
export const HOOKS = ['pre-commit', 'commit-msg', 'pre-push', 'local']

// ---------------------------------------------------------------------------
// Parser TOML minimo: secoes `[x]`, array de tabelas `[[x]]` (as doutrinas do doctor),
// `chave = valor` e listas de string (uma linha ou multilinha com `[` ... `]`). Comentario
// `#` fora de string e' descartado.
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
    const arr = trimmed.match(/^\[\[([^\]]+)\]\]$/)
    if (arr) {
      // Array de TABELAS: cada `[[doctrine]]` acrescenta um objeto a lista. O `doctor` le as
      // doutrinas do catalogo (`.ai/doctrines.toml`) e as do projeto por esta secao.
      const caminho = arr[1].split('.')
      let alvo = out
      for (const parte of caminho.slice(0, -1)) alvo = alvo[parte] ??= {}
      const lista = (alvo[caminho.at(-1)] ??= [])
      if (!Array.isArray(lista)) throw new Error(`'${arr[1]}' ja' existe como valor simples neste TOML`)
      section = {}
      lista.push(section)
      continue
    }
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

/** Desfaz os escapes do TOML basico dentro de uma string (`\"`, `\\`, `\n`). */
const unescape = (s) => s.replace(/\\(["\\/nrt])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t' })[c] ?? c)

function value(rest) {
  const t = rest.trim()
  if (t.startsWith('[')) {
    const m = t.match(/^\[([\s\S]*)\]$/)
    if (!m) throw new Error(`lista TOML nao fechada: ${t}`)
    return list(m[1])
  }
  const s = t.match(/^"(.*)"$/)
  return s ? unescape(s[1]) : t
}

const list = (inner) =>
  inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^"(.*)"$/)
      return m ? unescape(m[1]) : s
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
    // `[tars.env]` — ambiente extra do agente (o sync sempre injeta o NAO INTERATIVO).
    env: cfg.env ?? {},
    gates,
  }
}

/**
 * Dependencia IMPLICITA do catalogo: guard que `source`a um irmao (ex.: `lib-json.sh` do
 * `jget`) nao roda no consumidor se o irmao nao vier junto — foi o que a prova do binario
 * pegou em 07/10: o guard saia com `jget: command not found` e LIBERAVA o `git add -A`.
 * Declarar o guard traz a dependencia; o consumidor nao precisa saber que ela existe.
 */
export const GUARD_DEPS = ['lib-json']

/** Irmas de guard que o catalogo tem e o consumidor declarou um guard que usa. */
const guardDeps = (manifest, tars) =>
  (manifest.guards ?? []).some((g) => existsSync(join(tars, '.ai', 'guards', g.replace(/\.sh$/, '') + '.sh')))
    ? GUARD_DEPS.filter((dep) => existsSync(join(tars, '.ai', 'guards', dep + '.sh')))
    : []

/**
 * Script de TESTE de guard (`test-*.sh`) e' prova, nao hook: roda no CI contra o guard,
 * nunca no harness do agente (item 1a). Ele e' COPIADO (o consumidor roda a suite local),
 * mas NAO vira comando do PreToolUse — senao cada Bash pagaria o teste inteiro e o
 * consumidor declara-o so' para ter a prova por perto.
 */
export const isGuardTest = (item) => /(^|\/)test-/.test(item)

/** Guard DECLARADO que de fato vira hook (o teste fica de fora). */
const hookGuards = (manifest) => (manifest.guards ?? []).filter((g) => !isGuardTest(g))

/** Itens do catalogo a copiar (tudo, menos o `local`, que e' do projeto). */
export const declare = (manifest, { tars } = {}) =>
  AREAS.flatMap((area) => {
    if (area === 'gates')
      return HOOKS.filter((h) => h !== 'local').flatMap((h) => (manifest.gates[h] ?? []).map((item) => ({ area, item })))
    const items = manifest[area].map((item) => ({ area, item }))
    // Sem `tars` resolvido (teste de declaracao puro), as dependencias nao entram: quem
    // sincroniza SEMPRE passa o catalogo.
    return area === 'guards' && tars ? [...items, ...guardDeps(manifest, tars).map((item) => ({ area, item }))] : items
  })

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

/** `findTars` que nao explode: devolve `null` quando nao ha' catalogo acima do `start`. */
export function findTarsSafely(start = HERE) {
  try {
    return findTars(start)
  } catch {
    return null
  }
}

/**
 * Versao do Tars: `.ai/VERSION` e' a FONTE (o `ai-layer-check` a valida como SemVer) e o
 * `package.json` e' o espelho. `tars --version`, o `tars.lock` do consumidor e as notas de
 * upgrade leem daqui — um lugar so' (R3). Cai no `package.json` quando so' ele existe.
 */
export function readVersion(tars = findTars()) {
  const v = join(tars, '.ai', 'VERSION')
  if (existsSync(v)) return readFileSync(v, 'utf8').trim() || null
  try {
    return JSON.parse(readFileSync(join(tars, 'package.json'), 'utf8')).version ?? null
  } catch {
    return null
  }
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
    else if (entry.isFile()) out.push(posix(relative(base, full)))
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
  skills: (item) => ({ path: joinPosix('skills', item), ext: '' }),
  rules: (item) => ({ path: joinPosix('rules', item), ext: '.md' }),
  // Fato de memoria: o manifesto declara o nome do ARQUIVO como ele e' (`db` -> `db.md`);
  // `.jsonl` ja' vem com a extensao no nome (o manifesto nao a inventa).
  memory: (item) => ({ path: joinPosix('memory', 'agent', item), ext: item.endsWith('.jsonl') ? '' : '.md' }),
  gates: (item) => ({ path: joinPosix('gates', item), ext: '' }),
  // Guard e' ARQUIVO (`.ai/guards/<nome>.<ext>`): o manifesto declara o nome COM a extensao
  // quando ela nao e' `.sh` (o `ensure_memory_link.py` e' guard de verdade, nao sobra); sem
  // extensao assume `.sh`. O modo executavel vem junto (o `cp` preserva) — guard que nao
  // executa nao guarda.
  guards: (item) => ({ path: joinPosix('guards', item), ext: /\.[a-z0-9]+$/.test(item) ? '' : '.sh' }),
  // Governanca e' ARQUIVO markdown solto (`.ai/governance/<nome>.md`), igual a regra.
  governance: (item) => ({ path: joinPosix('governance', item), ext: '.md' }),
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
  for (const entry of declare(manifest, { tars })) {
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

/**
 * O projeto E' o proprio catalogo (o Tars consumindo a si mesmo). Nesse caso nao ha' o
 * que COPIAR: a base ja' e' o `.ai/` do catalogo — copiar `.ai/gates/` para `.ai/base/`
 * seria a duplicacao que a R3 proibe. O sync em modo `self` so' faz o wiring e os hooks
 * do git (o Tars e o seu primeiro consumidor — a doutrina vale para ele primeiro).
 */
export const isSelf = (tars, project) => Boolean(tars) && resolve(tars) === resolve(project)

export async function sync({ tars = findTars(), project = process.cwd(), check = false, adopt = [], log = console.log } = {}) {
  const manifest = await readManifest(project)
  const self = isSelf(tars, project)
  const lockPath = join(project, '.ai', 'tars.lock')
  const lock = existsSync(lockPath) ? JSON.parse(await readFile(lockPath, 'utf8')) : null
  const { missing, stale, absent, copied } = await plan({ tars, project, manifest, lock })
  // Familia D: a saida gerada orfa e' calculada AQUI, com o manifesto de agora e o lock de
  // ANTES de a base ser reescrita (o lock novo ja' perdeu a skill removida).
  const { orphan, foreign } = prunePlan(project, manifest, lock)

  if (check) {
    if (missing.length) for (const e of missing) log(`falta no tars: ${e.area}/${e.item}`)
    if (stale.length) for (const e of stale) log(`drift: ${e.area}/${e.item} (${e.got} != lock ${e.want})`)
    if (absent.length) for (const e of absent) log(`nao copiado: ${e.area}/${e.item}`)
    if (orphan.length) for (const o of orphan) log(`saida gerada orfa (rode \`tars sync\`): ${o}`)
    return { missing, stale, absent, copied, wrote: [], pruned: orphan, foreign }
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
  // Modo `self`: a base JA' e' o `.ai/` do catalogo — copiar `.ai/gates/` para `.ai/base/`
  // seria a duplicacao que a R3 proibe. O sync so' faz wiring + hooks (abaixo).
  for (const entry of self ? [] : declare(manifest, { tars })) {
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
    tars: { version: manifest.version ?? readVersion(tars), commit: tarsCommit(tars) },
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  }
  // Em modo `self` o lock nao existe: nao ha' item copiado para travar (a base e' o catalogo).
  const body = JSON.stringify(next, null, 2) + '\n'
  const before = existsSync(lockPath) ? await readFile(lockPath, 'utf8') : null
  if (!self && body !== before) await writeFile(lockPath, body)
  // O wiring por ferramenta e' a ponta que faz o guard RODAR: sem ele a base e' so' arquivo.
  const wired = await writeWiring(project, manifest)
  if (wired.length) log(`gera ${wired.join(', ')} (wiring do harness)`)
  // A outra ponta: os hooks do GIT. Sem eles um commit passa sem gate nenhum.
  const hooksWrote = await writeGitHooks(project, manifest, undefined, adopt)
  if (hooksWrote.length) log(`gera ${hooksWrote.join(', ')} (hooks do git)`)
  // Familia D: a saida gerada da skill que saiu do manifesto some (o gerador nao a remove).
  await pruneOrphans(project, orphan)
  if (orphan.length) for (const o of orphan) log(`poda ${o} (skill fora do manifesto)`)
  // Pasta de skill que o sync NUNCA declarou e' do projeto: alta e clara, mas nunca apagada.
  if (foreign.length) for (const f of foreign) log(`aviso: ${f} nao foi gerado por este sync (skill nao declarada) — nao podado`)
  // FALHA ALTA (R4): o consumidor que USA hooks proprios e fica sem NENHUM hook vivo tem o
  // git engolindo commit calado — o sync nao pode sair 0 achando que esta' tudo bem.
  const mortos = deadHooks(project, manifest)
  if (mortos) throw new Error(mortos)
  log(
    wrote.length
      ? `sync: ${wrote.length} item(ns), ${Object.keys(files).length} no lock (${relative(project, lockPath)}).`
      : `sync: nada mudou, ${Object.keys(files).length} item(ns) ja' em dia.`,
  )
  // A versao do catalogo subiu desde a ultima vez: o consumidor precisa das notas, nao de
  // decifrar o diff (foi o que custou turnos ao seo-brain). Uma linha, o detalhe fica la'.
  const antes = lock?.tars?.version ?? null
  if (antes && antes !== next.tars.version) log(`Tars ${antes} -> ${next.tars.version}: rode \`tars upgrade-notes\` para as notas de upgrade.`)
  return { missing, stale, absent, copied, wrote, wired, hooks: hooksWrote, lock: next, fromVersion: antes, pruned: orphan, foreign }
}

// ---------------------------------------------------------------------------
// Wiring por ferramenta (fatia 3a) — a fonte (`.ai/base/`) nao basta: sem a config do
// harness o guard nao RODA. O Tars gera a saida MINIMA para o Claude Code; as outras
// ferramentas (codex/opencode) e a traducao completa de regras/skills ficam para a
// fatia seguinte — R4: o menor caso que prova o caminho inteiro primeiro.
//
// Escopo do que o wiring chama: SO' os guards que o consumidor DECLAROU (`[tars].guards`).
// Chamar guard nao copiado quebraria a sessao; e' a mesma logica do sync — o consumidor
// paga o peso do que usa.
// ---------------------------------------------------------------------------
/** Um guard DECLARADO vira o comando que o harness roda (relativo ao projeto). */
const guardCommand = (item) => `bash "$CLAUDE_PROJECT_DIR/.ai/base/${destOf({ area: 'guards', item })}"`

/** PreToolUse: um comando por guard declarado; entrada vazia se nenhum. */
export function preToolUseFor(manifest) {
  const commands = hookGuards(manifest).map(guardCommand)
  return commands.length
    ? [{ matcher: 'Bash|PowerShell', hooks: commands.map((command) => ({ type: 'command', command })) }]
    : []
}

/**
 * Ambiente NAO INTERATIVO do agente: comando que abre prompt (senha de git, host key do
 * ssh) bloqueia sem TTY ate' o timeout — foi o `git fetch` de 8 min em 07/10. `GIT_TERMINAL_PROMPT=0`
 * faz o git FALHAR ALTO em vez de perguntar; `BatchMode` corta a senha no ssh; `GCM_INTERACTIVE=never`
 * idem no credential manager. Um passo do sync fecha a CLASSE inteira para todo consumidor.
 */
export const NONINTERACTIVE_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=15',
}

/**
 * Hooks que NAO dependem do manifesto: os da base. `guards` declara os do PROJETO e
 * `paths` diz onde o arquivo mora DE FATO (o consumidor pode ter `.ai/guards/` proprio).
 * Hook cujo arquivo nao existe e' OMITIDO: apontar para `.ai/guards/` ausente fazia o
 * harness rodar um `bash: no such file` em toda sessao (defeito do seo-brain, 07/10).
 */
export const BASE_HOOKS = [
  { event: 'PreCompact', matcher: 'manual|auto', file: 'precompact-persist-state.sh' },
  { event: 'SessionStart', matcher: 'startup|resume|clear|compact', file: 'sessionstart-context-digest.sh' },
  { event: 'SessionStart', matcher: 'startup|resume|clear|compact', file: 'ensure-memory-link.sh' },
]

/** Acha o arquivo da base: no projeto (`.ai/guards/`) primeiro, depois na base copiada. */
export function resolveGuardFile(project, file) {
  for (const rel of ['guards', join('base', 'guards')]) {
    const full = join(project, '.ai', rel, file)
    if (existsSync(full)) return full
  }
  return null
}

/**
 * O caminho que o hook DEVE citar: o mesmo que `resolveGuardFile` achou, relativo a raiz do
 * projeto (o comando usa `$CLAUDE_PROJECT_DIR/.ai/...`). Emitir `.ai/guards/` fixo enquanto o
 * arquivo mora em `.ai/base/guards/` fazia o harness rodar `bash: no such file` — e o projeto
 * que so' usa a base copiada nao tem `.ai/guards/` nenhum (defeito do seo-brain, 07/10).
 */
export function guardRelPath(project, file) {
  const full = resolveGuardFile(project, file)
  if (!full) return null
  const rel = posix(relative(join(project, '.ai'), full))
  return `.ai/${rel}`
}

/** Guard declarado pelo PROJETO (`[tars].guards`), na pasta propria ou na base copiada. */
export function projectGuardHooks(project, manifest) {
  const out = []
  // O catalogo consumindo a si mesmo guarda o guard em `.ai/guards/`, nao em `.ai/base/guards/`.
  const prefixo = isSelf(findTarsSafely(project), project) ? '.ai' : '.ai/base'
  for (const item of hookGuards(manifest)) {
    const rel = destOf({ area: 'guards', item })
    if (!existsSync(join(project, prefixo, rel))) throw new Error(`guard '${item}' declarado mas ausente (${rel}) — rode \`tars sync\``)
    out.push({ type: 'command', command: `bash "$CLAUDE_PROJECT_DIR/${prefixo}/${rel}"` })
  }
  return out.length ? [{ matcher: 'Bash|PowerShell', hooks: out }] : []
}

/** Hooks da base, agrupados por evento; sem `project` (teste puro) todos entram. */
function baseHooks(project) {
  const eventos = { PreToolUse: [], PreCompact: [], SessionStart: [] }
  for (const h of BASE_HOOKS) {
    // O caminho do hook e' o que o `resolveGuardFile` ACHOU (projeto ou base copiada); fixo em
    // `.ai/guards/` o harness rodaria um arquivo que nao existe (defeito do seo-brain).
    const rel = project ? guardRelPath(project, h.file) : `.ai/guards/${h.file}`
    if (!rel) continue
    const entry = { matcher: h.matcher, hooks: [{ type: 'command', command: `bash "$CLAUDE_PROJECT_DIR/${rel}"` }] }
    const slot = eventos[h.event] ??= []
    const same = slot.find((e) => e.matcher === h.matcher)
    if (same) same.hooks.push(...entry.hooks)
    else slot.push(entry)
  }
  return eventos
}

/**
 * `project` e' opcional: sem ele o settings sai completo (uso legado/teste). Com ele, hook
 * cujo arquivo nao existe no consumidor e' omitido — o sync faz o certo por padrao.
 *
 * PRESERVA o que nao e' do sync (merge sobre o arquivo atual): o sync e' dono de `$schema`,
 * `env` e dos eventos da base (PreToolUse/PreCompact/SessionStart); o resto — `permissions`,
 * evento que o projeto mantem a mao (Stop, ...) — fica intacto. Sem isso o `tars sync`
 * APAGAVA o `Stop` (stop-unfinished-work) e o bloco `permissions` do proprio Tars (07/10).
 */
export function claudeSettings(manifest, project = null, atual = null) {
  const base = baseHooks(project)
  return {
    ...(atual ?? {}),
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    env: { ...NONINTERACTIVE_ENV, ...(manifest.env ?? {}) },
    hooks: {
      ...(atual?.hooks ?? {}),
      PreToolUse: [...base.PreToolUse, ...(project ? projectGuardHooks(project, manifest) : preToolUseFor(manifest))],
      PreCompact: base.PreCompact,
      SessionStart: base.SessionStart,
    },
  }
}

/** Escreve `<project>/.claude/settings.json` — idempotente (mesmo conteudo, nada muda). */
export async function writeWiring(project, manifest) {
  const dir = join(project, '.claude')
  const file = join(dir, 'settings.json')
  let atual = null
  if (existsSync(file)) {
    try {
      atual = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      // Ilegivel NAO autoriza reescrever do zero (R4): o merge viraria perda calada das
      // chaves do dono. Falha alto nomeando o arquivo — quem quebrou o JSON conserta.
      throw new Error(
        `.claude/settings.json ilegivel (JSON invalido, nada sobrescrito): ${file}\n` +
          `Conserte o JSON ou apague o arquivo para o Tars gerar do zero.`,
      )
    }
  }
  const body = JSON.stringify(claudeSettings(manifest, project, atual), null, 2) + '\n'
  if (existsSync(file) && (await readFile(file, 'utf8')) === body) return []
  await mkdir(dir, { recursive: true })
  await writeFile(file, body)
  return ['.claude/settings.json']
}

// ---------------------------------------------------------------------------
// Hooks do GIT (fatia 3b): o Tars gera `.githooks/{pre-commit,commit-msg,pre-push}`
// apontando para os gates do manifesto. So' quando o consumidor JA' usa hooks proprios
// (`.githooks/` existe ou `core.hooksPath` ja' aponta para la'): o Tars nao troca o
// `core.hooksPath` de quem nao pediu — wiring silencioso quebrado e' pior que ausente.
// ---------------------------------------------------------------------------
export const GIT_HOOKS = ['pre-commit', 'commit-msg', 'pre-push']
export const DEFAULT_HOOKS_PATH = '.githooks'

/** Onde os hooks do git moram: `core.hooksPath` do consumidor, ou `null` se ele nao declarou. */
export function hooksPathOf(project) {
  try {
    const p = execFileSync('git', ['-C', project, 'config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return p || null
  } catch {
    return null
  }
}

/**
 * O Tars so' escreve os hooks do git quando o consumidor JA' usa hooks proprios: o
 * `core.hooksPath` esta' declarado, ou a pasta `.githooks/` ja' existe. Sem isso o `sync`
 * trocaria o `core.hooksPath` de quem nunca pediu — wiring silencioso quebrado e' pior que
 * ausente. Quem nao usa hooks do git simplesmente nao ganha pasta nova.
 */
export function usesGitHooks(project, hooksPath = hooksPathOf(project)) {
  return hooksPath !== null || existsSync(join(project, DEFAULT_HOOKS_PATH))
}

/** A pasta efetiva dos hooks: o declarado, senao o default do projeto. */
export function effectiveHooksPath(project) {
  return hooksPathOf(project) ?? DEFAULT_HOOKS_PATH
}

// ---------------------------------------------------------------------------
// Poda da saida gerada orfa (familia D). O gerador (rulesync) escreve a saida de cada
// skill DECLARADA em `.claude/skills/<nome>`, `.agents/skills/<nome>` e
// `.opencode/skills/<nome>`, mas NAO sabe remover a que deixou de ser declarada — skill
// renomeada no catalogo (`fabber-root-cause-debugging` -> `root-cause-debugging`, seo-brain
// 07/10) deixa as DUAS no consumidor. Quem tem a memoria da saida que o gerador criou e' o
// sync, entao a poda mora aqui.
//
// A prova de posse e' o NOME: o sync so' remove a pasta cujo nome ele conhece como de uma
// skill (manifesto AGORA + lock de ANTES), nunca uma pasta alheia. Pasta com nome que o sync
// nunca declarou e' do projeto e so' entra num AVISO — apagar o que nao e' nosso e' o
// incident 07/10 esperando acontecer de novo.
// ---------------------------------------------------------------------------
export const SKILL_TARGETS = ['.claude/skills', '.agents/skills', '.opencode/skills']

/** Nomes de skill que o sync conhece como de sua lavra: o manifesto AGORA + o lock de ANTES. */
export function knownSkills(manifest, lock) {
  const nomes = new Set(declare(manifest, { tars: null }).filter((e) => e.area === 'skills').map((e) => e.item))
  for (const key of Object.keys(lock?.files ?? {})) {
    const m = key.match(/^skills\/(.+)$/)
    if (m) nomes.add(m[1])
  }
  return nomes
}

/**
 * Pastas de skill em cada alvo de ferramenta. Devolve { orphan, foreign }: `orphan` e' a
 * saida de uma skill CONHECIDA que nao esta' mais declarada (poda), `foreign` e' pasta cujo
 * nome o sync nunca declarou (do projeto — nunca se apaga, so' avisa). Olha so' o primeiro
 * nivel: o sync nunca entra numa pasta para decidir apagar.
 */
export function prunePlan(project, manifest, lock) {
  const declaradas = new Set(declare(manifest, { tars: null }).filter((e) => e.area === 'skills').map((e) => e.item))
  const conhecidas = knownSkills(manifest, lock)
  const orphan = []
  const foreign = []
  for (const dir of SKILL_TARGETS) {
    const abs = join(project, dir)
    if (!existsSync(abs)) continue
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() || declaradas.has(e.name)) continue
      const rel = `${dir}/${e.name}`
      if (conhecidas.has(e.name)) orphan.push(rel)
      else foreign.push(rel)
    }
  }
  return { orphan, foreign }
}

/** Remove as pastas orfas; idempotente (nada orfao = nada apagado). */
export async function pruneOrphans(project, orphans) {
  for (const rel of orphans) await rm(join(project, rel), { recursive: true, force: true })
}

/**
 * Corpo do hook: chama o motor `tars hooks <hook>` com `$@` (o git passa o arquivo da
 * mensagem no commit-msg). As tres fontes, na ordem — a mais portatil primeiro:
 *
 *   1. `$TARS_HOME/dist/tars` — o binario do catalogo. E' o unico caminho que NAO depende
 *      de PATH nem de Node no consumidor, e o `TARS_HOME` ja' e' a variavel de contrato do
 *      Tars (tars.mjs a le primeiro). Antes o corpo citava `$root/dist/tars` — o binario do
 *      PROPRIO consumidor, que nao existe em quem so' consome o catalogo.
 *   2. `tars` no PATH — instalacao global, tambem sem Node.
 *   3. `node "$root/tools/framework/tars.mjs"` — o consumidor que tem o fonte do Tars.
 *
 * Falha ALTA nomeando as tres: hook que sai 0 calado e' o commit sem gate que a R4 proibe.
 */
export function hookBody(hook) {
  return (
    '#!/usr/bin/env sh\n' +
    `# Gerado por \`tars sync\` (${hook}) — nao edite a mao: o proximo sync sobrescreve.\n` +
    '# Os gates vem de `[gates]` do .ai/tars.toml (catalogo em .ai/base/gates/, locais do projeto).\n' +
    'set -e\n' +
    'root="$(git rev-parse --show-toplevel)"\n' +
    'if [ -n "$TARS_HOME" ] && [ -x "$TARS_HOME/dist/tars" ]; then exec "$TARS_HOME/dist/tars" hooks ' + hook + ' "$@"; fi\n' +
    'if command -v tars >/dev/null 2>&1; then exec tars hooks ' + hook + ' "$@"; fi\n' +
    'if [ -f "$root/tools/framework/tars.mjs" ]; then exec node "$root/tools/framework/tars.mjs" hooks ' + hook + ' "$@"; fi\n' +
    // Aspas SIMPLES no texto citado: crase dentro de `"..."` e' substituicao de comando —
    // o `sh` EXECUTARIA `tars sync` ao so' MONTAR a mensagem de erro (Incident: hook mudo).
    'echo "hook ' + hook + ': nao achei o motor do Tars — procurei $TARS_HOME/dist/tars, \'tars\' no PATH e $root/tools/framework/tars.mjs (rode \'tars sync\')" >&2\n' +
    'exit 1\n'
  )
}

/**
 * A marca de autoria: o corpo que o sync gera traz esta linha. Arquivo SEM ela e' do dono —
 * o sync nunca o sobrescreve (incident 07/10: `.githooks/pre-commit` de 319 linhas do
 * segtools foi trocado pelo corpo generico, calado). Posse e' declarada no proprio arquivo,
 * nunca inferida pela existencia da pasta.
 */
export const OWNED = '# Gerado por `tars sync`'

/** Gera os hooks do git declarados; idempotente (mesmo conteudo, nada muda). */
export async function writeGitHooks(
  project,
  manifest,
  hooksPath = effectiveHooksPath(project),
  adopt = [],
) {
  if (!usesGitHooks(project, hooksPathOf(project))) return []
  const dir = join(project, hooksPath)
  const wrote = []
  await mkdir(dir, { recursive: true })
  // `prepare-commit-msg` acompanha o `commit-msg`: e' quem INJETA o emoji do tipo (o
  // `validate-commit.mjs --inject`), sem o qual o `commit-msg` reprova a mensagem escrita
  // a mao sem emoji. Declarar `commit-msg` traz os dois — o par e' uma coisa so'.
  const alvos = GIT_HOOKS.filter((h) => (manifest.gates?.[h] ?? []).length)
  if (alvos.includes('commit-msg')) alvos.push('prepare-commit-msg')
  const alheios = []
  for (const hook of alvos) {
    const file = join(dir, hook)
    const body = hookBody(hook)
    const existe = existsSync(file)
    const atual = existe ? await readFile(file, 'utf8') : null
    if (existe && atual === body) continue // idempotente: ja' e' o nosso
    if (existe && !atual.includes(OWNED)) {
      // Arquivo do dono: so' escreve com `--adopt` (e guarda o original em `.bak`).
      if (!adopt.includes(hook)) {
        alheios.push(`${hooksPath}/${hook}`)
        continue
      }
      await writeFile(file + '.bak', atual)
    }
    await writeFile(file, body, { mode: 0o755 })
    // `writeFile` com `mode` NAO muda o bit de quem JA' existe: adotar um hook do projeto
    // (0644) sem chmod deixaria o hook morto e o `deadHooks` reprovaria o sync logo abaixo.
    await chmod(file, 0o755)
    wrote.push(`${hooksPath}/${hook}`)
  }
  // R4: falha alta nomeando cada arquivo e as duas saidas — adotar, ou declarar o gate como local.
  if (alheios.length) {
    const names = alheios.map((f) => `  - ${f}`).join('\n')
    throw new Error(
      `hook do projeto sem a marca de autoria (nada sobrescrito):\n${names}\n` +
        `Adote com \`tars sync --adopt <hook>\` (o original fica em <hook>.bak) ou declare o gate como local.`,
    )
  }
  return wrote
}

/**
 * O hook esta' VIVO — o git consegue executa-lo? O bit de execucao e' a prova no POSIX.
 *
 * No win32 ele NAO EXISTE: o NTFS guarda so' o atributo de leitura, e o `statSync().mode`
 * volta 0666 para todo mundo — exigir `0o111` reprovava TODO hook do consumidor Windows
 * dizendo "nao executavel" e o `tars sync` morria logo depois de escrever os hooks certos
 * (Incident: `HOOKS MORTOS` com o hook no lugar). La' quem executa o hook e' o `sh` do
 * Git for Windows, e o que faz o arquivo ser um script — nao um binario qualquer — e' o
 * shebang. Mesma cobertura, outra testemunha: existe + `#!`.
 */
export function hookVivo(file, { win32 = process.platform === 'win32' } = {}) {
  if (!existsSync(file) || !statSync(file).isFile()) return false
  if (!win32) return Boolean(statSync(file).mode & 0o111)
  try {
    return readFileSync(file, 'utf8').startsWith('#!')
  } catch {
    return false
  }
}

/**
 * O consumidor USA hooks proprios mas nenhum hook do manifesto esta' VIVO no disco: o git
 * engole o commit calado (foi a falha do proprio Tars, 07/10 — `.githooks` apontado mas
 * inexistente). Devolve a mensagem de erro (R4) ou `null` quando esta' tudo certo.
 */
export function deadHooks(project, manifest, hooksPath = effectiveHooksPath(project)) {
  if (!usesGitHooks(project, hooksPathOf(project))) return null
  const esperados = GIT_HOOKS.filter((h) => (manifest.gates?.[h] ?? []).length)
  if (!esperados.length) return null
  const dir = join(project, hooksPath)
  if (!existsSync(dir)) return `HOOKS MORTOS: core.hooksPath=${hooksPath} nao existe — nenhum gate roda (rode \`tars sync\`)`
  const faltando = esperados.filter((h) => !hookVivo(join(dir, h)))
  return faltando.length
    ? `HOOKS MORTOS: ${faltando.map((h) => `${hooksPath}/${h}`).join('; ')} ausente/nao executavel — nenhum gate roda (rode \`tars sync\`)`
    : null
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

# Ambiente extra do agente (opcional). O sync SEMPRE injeta o nao interativo
# (GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never, GIT_SSH_COMMAND com BatchMode).
# Descomente so' o que este projeto acrescenta:
# [env]
# MINHA_CHAVE = "valor"

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
  const version = readVersion(tars) ?? 'v0.0'
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
