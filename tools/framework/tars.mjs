#!/usr/bin/env node
// `tars` — o PONTO DE ENTRADA unico do Tars (docs/TARS.md §Agnóstico de runtime).
//
// Por que existe: o consumidor pode ser um repo SO Python (uv/venv, sem Node), e o README
// pedia `node <tars>/tools/framework/tars-sync.mjs`. Aqui nao ha logica nova (R3): o
// arquivo so' DESPACHA para o que ja' existe — `tars-sync.mjs` (init/sync/check),
// `tars-hooks.mjs` (nota de gates) e `tars-promote.mjs` (promocao). Este arquivo tambem e'
// o alvo do `bun build --compile`, e o binario roda sem Node instalado.
//
// Uso:
//   tars init [--tars <dir>] [--project <dir>]
//   tars sync [--check] [--tars <dir>] [--project <dir>]
//   tars check [--tars <dir>] [--project <dir>]      # atalho de `sync --check`
//   tars hooks <pre-commit|commit-msg|pre-push|local> [args do hook...]
//   tars promote --area <memory|skill|gate> --item <nome> [--project <dir>] [--tars <dir>]
//   tars --help
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Os donos de cada comando entram por import ESTATICO: o `bun build --compile` so' embute
// o que enxerga em tempo de build — `await import(join(home(), 'tars-sync.mjs'))` virava
// `/$bunfs/root/tars-sync.mjs` e o binario morria em runtime (Incident: dist/tars perde modulo).
// Este import vem PRIMEIRO e de proposito: ele marca `TARS_AS_MODULE`, que desliga os
// auto-run dos modulos DONOS (no `--compile` o import.meta.url de todo modulo embutido vira
// o do entrypoint, e o guard deles disparava o main no import — `--help` respondia `sync`).
import './tars-as-module.mjs'
import * as promote from './tars-promote.mjs'
import * as hooks from './tars-hooks.mjs'
import * as syncMod from './tars-sync.mjs'
import * as gitMod from './tars-git.mjs'
import * as doctorMod from './tars-doctrines.mjs'
import * as verifyMod from './tars-verify.mjs'

// O `import.meta.url` do binario compilado aponta o modulo embutido; `process.execPath`
// cobre o resto. Em ambos os casos a base e' o IRMAO de `tars.mjs`.
const HERE = dirname(fileURLToPath(import.meta.url))
const COMPILED = fileURLToPath(import.meta.url).startsWith('/$bunfs/')

/** Sobe a partir de `start` ate' achar um repo do Tars (`.ai/VERSION`); `null` se nao houver. */
function findRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.ai', 'VERSION'))) return dir
    if (dirname(dir) === dir) return null
  }
}

// Quando COMPILADO, o modulo mora em `/$bunfs/root/...` — sem valor. A raiz do catalogo
// passa a ser o repo onde o BINARIO vive (`process.execPath`), subindo ate' achar `.ai/VERSION`.
// Ordem: `--tars` > `TARS_HOME` > este default > cwd (fonte). Sem ele, rodar o binario fora
// do repo do Tars morria com "nao achei a raiz do Tars" (Incident: dist/tars perde modulo).
function defaultTars() {
  if (COMPILED) return findRoot(dirname(process.execPath))
  return null
}

const args = process.argv.slice(2)
const cmd = args[0] ?? '--help'

/** Resolve o caminho base dos modulos: irmão do script ou do binario compilado. */
function home() {
  // `TARS_HOME` (docs/README) manda; senao o diretorio deste arquivo.
  const base = process.env.TARS_HOME ? join(process.env.TARS_HOME, 'tools', 'framework') : HERE
  return base
}

const USAGE = [
  'uso: tars <comando> [opcoes]',
  '',
  '  init                       cria .ai/tars.toml minimo e sincroniza o declarado',
  '  sync [--check]             puxa o declarado para .ai/base/ (--check: so valida)',
  '  check                      atalho de `sync --check` (o gate)',
  '  hooks <hook> [args...]     roda os gates do hook (pre-commit|commit-msg|pre-push|local)',
  '  promote --area <> --item   sobe um item comprovado do projeto para o catalogo',
  '  doctor [--json]            confere doutrina x gate x prova (exit != 0 em PHANTOM/DRIFT)',
  '  verify <arquivo>           roda os `verify` de um bloco de claims e cobra o `expect` (exit',
  '                             != 0 em PHANTOM/sem negativo/excesso de [ASSUMED]); `-` le stdin',
  '  git prune [--remote]       apaga branches ja incorporadas (--remote: tambem no origin)',
  '                             use --dry-run para so imprimir; nunca apaga main nem a atual',
  '',
  '  --help                     esta ajuda',
  '',
  'Opcoes comuns: --tars <dir> (raiz do catalogo), --project <dir> (raiz do consumidor).',
  'Sem Node instalado, e o que o binario compilado (`dist/tars`) responde.',
].join('\n')

/** Delegacao: importa o modulo DONO do comando e chama a funcao exportada (nada reimplementado). */
async function sync(action, rest, project) {
  const mod = syncMod
  const opts = {
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? mod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project),
  }
  if (action === 'init') return void (await mod.init(opts))
  const r = await mod.sync({ ...opts, check: rest.includes('--check') })
  if (rest.includes('--check')) {
    const bad = r.missing.length || r.stale.length || r.absent.length
    if (bad) {
      console.error('\nbase do Tars inconsistente (rode `tars sync`).')
      process.exit(1)
    }
    console.log('base do Tars ok.')
  }
}

async function runHooksCommand(rest, project) {
  const [hook, ...rawArgs] = rest
  if (!hook) throw new Error('falta o hook: use `tars hooks <pre-commit|commit-msg|pre-push|local> [args]`')
  const mod = hooks
  const { parseToml } = syncMod
  // `--project` tambem vale aqui: sem ele o repo consumidor so' era encontravel por TARS_PROJECT.
  // E sai da lista de args: eles vao inteiros para o gate (o `--project` nao e' do gate).
  const at = rawArgs.indexOf('--project')
  const hookArgs = at === -1 ? rawArgs : rawArgs.filter((_, i) => i !== at && i !== at + 1)
  let start = (at === -1 ? null : rawArgs[at + 1]) ?? project ?? process.env.TARS_PROJECT
  if (!start) throw new Error('nao achei o projeto (use --project <dir> ou TARS_PROJECT=<dir>)')
  if (existsSync(join(start, 'tars.toml'))) start = dirname(start)
  const found = mod.findProject(start)
  const manifest = parseToml(readFileSync(found.file, 'utf8'))
  const r = mod.runHooks({ hook, manifest, project: found.project, args: hookArgs })
  process.exit(r.ok ? 0 : 1)
}

async function promoteCommand(rest, project) {
  const mod = promote
  const area = argValue(rest, '--area')
  const item = argValue(rest, '--item')
  if (!mod.AREA?.[area]) throw new Error(`use --area <memory|skill|gate> e --item <nome>`)
  if (!item) throw new Error('falta --item <nome>')
  await mod.AREA[area]({
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? mod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project),
    item,
  })
  console.log('promocao escrita no working tree do Tars (nao commitada: revise antes).')
}

/** `tars git prune` — despacho fino para o modulo dono (nada de logica de git aqui). */
async function gitCommand(rest, project) {
  const sub = rest[0]
  if (sub !== 'prune') throw new Error(`use \`tars git prune [--remote] [--dry-run]\` (recebi '${sub ?? ''}')`)
  await gitMod.gitPrune({
    project: resolve(project ?? process.cwd()),
    remote: rest.includes('--remote'),
    dryRun: rest.includes('--dry-run'),
  })
}

/** `tars doctor` — despacho fino para o modulo dono (a classificacao mora la', nao aqui). */
async function doctorCommand(rest, project) {
  const r = doctorMod.doctor({
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? syncMod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project ?? process.cwd()),
  })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else doctorMod.format(r)
  if (r.faltando.length) process.exit(1)
}

/** `tars verify <arquivo>` — despacho fino: o parser e o julgamento moram no modulo dono. */
async function verifyCommand(rest) {
  const mod = verifyMod
  const cwd = argValue(rest, '--cwd')
  const arquivo = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--cwd')[0]
  if (!arquivo) throw new Error('uso: tars verify <arquivo|-> [--cwd <dir>] [--json]')
  const r = mod.verify({
    caminho: arquivo === '-' ? null : resolve(arquivo),
    texto: arquivo === '-' ? readFileSync(0, 'utf8') : undefined,
    cwd: resolve(cwd ?? process.cwd()),
  })
  if (rest.includes('--json')) console.log(JSON.stringify({ ...r, claims: r.claims.map(({ saida, ...c }) => c) }, null, 2))
  else mod.format(r)
  if (r.falhas.length) process.exit(1)
}

/** Le o valor de `--nome <v>` da lista de rest (o mesmo `arg` dos scripts originais). */
function argValue(list, name) {
  const i = list.indexOf(name)
  return i === -1 ? null : list[i + 1]
}

/** Monta as funcoes de despacho por comando; `check` e' `sync` com `--check` forcado. */
const COMMANDS = {
  init: (rest, project) => sync('init', rest, project),
  sync: (rest, project) => sync('sync', rest, project),
  check: (rest, project) => sync('sync', [...rest, '--check'], project),
  hooks: runHooksCommand,
  promote: promoteCommand,
  doctor: doctorCommand,
  verify: verifyCommand,
  git: gitCommand,
}

async function main() {
  if (cmd === '--help' || cmd === '-h' || cmd === 'help' || cmd === '--version') {
    console.log(USAGE)
    return
  }
  const handler = COMMANDS[cmd]
  if (!handler) throw new Error(`comando desconhecido: '${cmd}' (use ${Object.keys(COMMANDS).join(' | ')})`)
  // Sem `--project` e sem TARS_PROJECT: quando rodado como CLI o padrao e' o cwd; importado
  // como biblioteca nao ha projeto implicito (o cwd ali e' o do runner de teste).
  const asCli = COMPILED || (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  await handler(args.slice(1), process.env.TARS_PROJECT ?? (asCli ? process.cwd() : undefined))
}

// Executa so' quando chamado como processo (import num teste nao dispara o despacho).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    await main()
  } catch (err) {
    console.error(`tars ${cmd}: ${err.message}`)
    process.exit(1)
  }
}

export { COMMANDS, USAGE, argValue, main }
