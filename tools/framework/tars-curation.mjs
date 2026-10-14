#!/usr/bin/env node
// `tars curation` — a rotina de curadoria por PONTEIRO (docs/CURATION.md).
//
// O que ele faz (e so' isso — nada de ler conteudo de projeto):
//   1. le o estado em `.ai/curation.json` (o ponteiro: ultimo commit curado por repo);
//   2. para cada repo VIZINHO no disco, le so' o DELTA `git log/diff <ponteiro>..HEAD` dos
//      caminhos de conhecimento (`.ai/memory/**`, `HANDOFF*`, `*-lessons.md`,
//      `docs/estudos/**`, `estudos/**`, `docs/adr{,_s}/**`, `BACKLOG.md`);
//   3. imprime o que ANDOU (commits + arquivos) e o que NAO andou (silencio = ja' curado);
//   4. com `--advance`, grava o HEAD de cada repo andado no ponteiro — mas SO' quem foi
//      declaradamente lido por inteiro (`--reviewed`). Leitura parcial (amostra) nao avanca:
//      avancar sobre amostra apaga para sempre o delta entre a amostra e a leitura completa.
//
// IDEMPOTENTE por construcao: sem commit novo nos repos, o delta e' vazio e ele nao faz
// nada. O ponteiro e' DADO (`.ai/curation.json`), nao codigo — o mesmo desenho do
// `.ai/tars.lock`: arquivo de conteudo, revisavel, versionado.
//
// Ele NAO generaliza nada sozinho: ler o delta e' DETERMINISTICO (git); decidir o que entra
// no catalogo e' julgamento (LLM) e continua sendo a chamada `tars promote` + o registro em
// `docs/CURATION.md` (origem -> destino -> situacao, com "o que nao entra e por que").
//
// Uso:
//   node tools/framework/tars-curation.mjs [--repos <dir>] [--state <arquivo>] [--advance] [--json]
//   --repos    pasta com os repos vizinhos (default: o irmao do Tars, `..`)
//   --state    arquivo de estado (default: <tars>/.ai/curation.json)
//   --advance  avanca o ponteiro (grava o HEAD lido); sem `--reviewed`, NAO avanca nada
//   --reviewed lista de repos LIDOS por inteiro (`a,b`; `*` para "todos os que andaram") —
//              so' esses avancam. A rodada que leu so' uma amostra declara so' o que leu.
//   --json     saida em JSON (para o coordenador/dashboard)

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTars } from './tars-sync.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// Os caminhos de CONHECIMENTO — a unica coisa que a curadoria olha. Um commit que so' mexeu
// em codigo de produto nao entra: o alvo e' a memoria/estudo/handoff, nao o diff inteiro.
// (`estudos/` na raiz cobre o repo que tem essa pasta fora de `docs/` — ha' os dois padroes.)
export const KNOWLEDGE_PATHS = [
  '.ai/memory',
  'HANDOFF*',
  '*-lessons.md',
  'docs/estudos',
  'estudos',
  'docs/adr',
  'docs/adrs',
  'BACKLOG.md',
]

/** git so' leitura; `-C <repo>`. Falha -> null (repo sem git, sha desconhecido). */
function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const isRepo = (dir) => existsSync(join(dir, '.git'))

/** HEAD atual (sha curto + ISO) ou null se nao for repo git. */
export function headOf(repo) {
  const sha = git(repo, ['rev-parse', '--short', 'HEAD'])
  if (!sha) return null
  const iso = git(repo, ['show', '-s', '--format=%cI', 'HEAD'])
  return { sha, iso }
}

/**
 * O delta de UM repo desde o ponteiro `from` (sha). Sem `from` (ou sha desconhecido) o repo
 * e' tratado como NOVO: lista os commits de conhecimento do HEAD mas avisa que nao ha' base.
 * Retorna { repo, head, from, novel, commits, files } — `novel` e' o sinal da curadoria.
 */
export function deltaOf(repo, from) {
  const head = headOf(repo)
  if (!head) return { repo, head: null, from, novel: false, commits: [], files: [], reason: 'sem .git' }
  if (!from) {
    // Repo novo no ponteiro: sem base, nao da' para medir delta — entrega o HEAD do estado
    // inicial (a §3 do inventario) e deixa o dono aprovar. Nao inventa delta.
    return { repo, head, from: null, novel: false, commits: [], files: [], reason: 'sem ponteiro (estado inicial)' }
  }
  if (from === head.sha) {
    return { repo, head, from, novel: false, commits: [], files: [], reason: 'sem commit novo' }
  }
  const exists = git(repo, ['cat-file', '-e', `${from}^{commit}`])
  if (exists === null) {
    return { repo, head, from, novel: true, commits: [], files: [], reason: `ponteiro '${from}' nao existe (force-push?)` }
  }
  const range = `${from}..HEAD`
  const commits = (git(repo, ['log', '--format=%h %cI %s', range, '--', ...KNOWLEDGE_PATHS]) ?? '')
    .split('\n')
    .filter(Boolean)
  const files = (git(repo, ['diff', '--name-only', range, '--', ...KNOWLEDGE_PATHS]) ?? '').split('\n').filter(Boolean)
  return { repo, head, from, novel: commits.length > 0 || files.length > 0, commits, files, reason: null }
}

/** Le o estado (`{ "<nome-do-repo>": { "sha": ..., "iso": ... } }`); ausente -> `{ repos: {} }`. */
export function readState(file) {
  if (!existsSync(file)) return { repos: {} }
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return { repos: raw.repos ?? {} }
}

/** Descobre os repos vizinhos (uma pasta por repo) em `reposDir`, ORDENADOS por nome. */
export function siblingRepos(reposDir) {
  if (!existsSync(reposDir) || !statSync(reposDir).isDirectory()) return []
  return readdirSync(reposDir)
    .filter((n) => !n.startsWith('.'))
    .map((n) => join(reposDir, n))
    .filter(isRepo)
    .sort()
}

/** A curadoria inteira: mede todos os repos, opcionalmente avanca o ponteiro. */
export function curate({ reposDir, stateFile, advance = false, reviewed = [] }) {
  const state = readState(stateFile)
  const repos = siblingRepos(reposDir).map((dir) => {
    const name = dir.slice(dir.lastIndexOf('/') + 1)
    const from = state.repos[name]?.sha ?? null
    const d = deltaOf(dir, from)
    return { name, ...d }
  })
  const moved = repos.filter((r) => r.novel)
  // Leitura PARCIAL nunca avanca (regra da rodada de 13/10): so' avanca o repo que o
  // chamador declarou LIDO por inteiro em `reviewed`. `*` = todos os que andaram. Sem
  // `reviewed`, `--advance` mede e avisa — nao grava. Avancar sobre amostra apagaria o
  // delta entre a amostra e a leitura completa, e ele nunca voltaria.
  const wants = (name) => reviewed.includes('*') || reviewed.includes(name)
  const advanced = []
  let nextState = state
  if (advance) {
    nextState = { repos: { ...state.repos } }
    for (const r of repos) {
      if (!r.head) continue
      if (r.novel && wants(r.name)) {
        nextState.repos[r.name] = { sha: r.head.sha, iso: r.head.iso }
        advanced.push(r.name)
      } else if (!state.repos[r.name] && wants(r.name)) {
        // Repo novo no ponteiro: ganha o inicial — mas so' se declarado lido.
        nextState.repos[r.name] = { sha: r.head.sha, iso: r.head.iso }
        advanced.push(r.name)
      }
    }
    if (advanced.length > 0) writeState(stateFile, nextState)
  }
  return { repos, moved, stateFile, advance, reviewed, advanced }
}

/** Grava o estado com chaves ORDENADAS (diff limpo a cada rodada — idempotencia visivel). */
export function writeState(file, state) {
  const repos = {}
  for (const name of Object.keys(state.repos).sort()) repos[name] = state.repos[name]
  writeFileSync(file, JSON.stringify({ repos }, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

function report({ repos, moved, stateFile, advance, reviewed = [], advanced = [] }) {
  const tag = advance ? (advanced.length ? ` (avancado: ${advanced.join(', ')})` : ' (nada avancado)') : ''
  console.log(`# curadoria — ponteiro em ${stateFile}${tag}`)
  console.log(`# ${repos.length} repos, ${moved.length} andaram\n`)
  for (const r of repos) {
    if (r.novel) {
      console.log(`→ ${r.name}  ${r.from ?? '(novo)'}..${r.head.sha}  ${r.head.iso}`)
      if (r.reason) console.log(`   ! ${r.reason}`)
      for (const c of r.commits.slice(0, 20)) console.log(`   ${c}`)
      if (r.commits.length > 20) console.log(`   … +${r.commits.length - 20} commits`)
      for (const f of r.files.slice(0, 20)) console.log(`   M ${f}`)
      if (r.files.length > 20) console.log(`   … +${r.files.length - 20} arquivos`)
    } else {
      console.log(`· ${r.name}  (${r.reason ?? 'sem novidade'})`)
    }
  }
  if (advance && reviewed.length === 0) {
    console.log('\n# --advance sem --reviewed: nada foi avancado (leitura parcial nao avanca ponteiro).')
    console.log('# declare o que foi LIDO por inteiro: `--reviewed <repo,...>` (ou `--reviewed \'*\'`).')
  }
  console.log('\n# a proxima perna (julgamento, LLM): ler o delta, chamar `tars promote` e registrar')
  console.log('# a linha origem→destino→situacao em docs/CURATION.md — com "o que nao entra e por que".')
}

// `TARS_AS_MODULE` (posto por `tars.mjs` ANTES dos modulos donos, ver `tars-as-module.mjs`):
// no `bun build --compile` o `import.meta.url` de TODO modulo embutido vira o do entrypoint,
// entao este guard ficava verdadeiro quando `tars.mjs` apenas IMPORTAVA o modulo — e o main
// da curadoria rodava no import (`tars --help` respondia "nao achei a raiz do Tars").
// E' o mesmo Incident que ja' tinha guarda nos outros donos; este ficou de fora.
if (!process.env.TARS_AS_MODULE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const tars = resolve(arg('--tars') ?? process.env.TARS_HOME ?? findTars())
    const reposDir = resolve(arg('--repos') ?? join(tars, '..'))
    const stateFile = resolve(arg('--state') ?? join(tars, '.ai', 'curation.json'))
    const reviewed = (arg('--reviewed') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const r = curate({ reposDir, stateFile, reviewed, advance: process.argv.includes('--advance') })
    if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2))
    else report(r)
  } catch (err) {
    console.error(`tars curation: ${err.message}`)
    process.exit(1)
  }
}
