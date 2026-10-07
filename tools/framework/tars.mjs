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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// O `import.meta.url` do binario compilado aponta o modulo embutido; `process.execPath`
// cobre o resto. Em ambos os casos a base e' o IRMAO de `tars.mjs`.
const HERE = dirname(fileURLToPath(import.meta.url))
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
  '',
  '  --help                     esta ajuda',
  '',
  'Opcoes comuns: --tars <dir> (raiz do catalogo), --project <dir> (raiz do consumidor).',
  'Sem Node instalado, e o que o binario compilado (`dist/tars`) responde.',
].join('\n')

/** Delegacao: importa o modulo DONO do comando e chama a funcao exportada (nada reimplementado). */
async function sync(action, rest, project) {
  const mod = await import(join(home(), 'tars-sync.mjs'))
  const opts = {
    tars: resolve(argValue(rest, '--tars') ?? mod.findTars()),
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

async function hooks(rest, project) {
  const [hook, ...hookArgs] = rest
  if (!hook) throw new Error('falta o hook: use `tars hooks <pre-commit|commit-msg|pre-push|local> [args]`')
  const mod = await import(join(home(), 'tars-hooks.mjs'))
  const { existsSync } = await import('node:fs')
  const { parseToml } = await import(join(home(), 'tars-sync.mjs'))
  const { readFileSync } = await import('node:fs')
  let start = process.env.TARS_PROJECT ?? project
  if (existsSync(join(start, 'tars.toml'))) start = dirname(start)
  const found = mod.findProject(start)
  const manifest = parseToml(readFileSync(found.file, 'utf8'))
  const r = mod.runHooks({ hook, manifest, project: found.project, args: hookArgs })
  process.exit(r.ok ? 0 : 1)
}

async function promote(rest, project) {
  const mod = await import(join(home(), 'tars-promote.mjs'))
  const area = argValue(rest, '--area')
  const item = argValue(rest, '--item')
  if (!mod.AREA?.[area]) throw new Error(`use --area <memory|skill|gate> e --item <nome>`)
  if (!item) throw new Error('falta --item <nome>')
  await mod.AREA[area]({
    tars: resolve(argValue(rest, '--tars') ?? mod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project),
    item,
  })
  console.log('promocao escrita no working tree do Tars (nao commitada: revise antes).')
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
  hooks,
  promote,
}

async function main() {
  if (cmd === '--help' || cmd === '-h' || cmd === 'help' || cmd === '--version') {
    console.log(USAGE)
    return
  }
  const handler = COMMANDS[cmd]
  if (!handler) throw new Error(`comando desconhecido: '${cmd}' (use ${Object.keys(COMMANDS).join(' | ')})`)
  await handler(args.slice(1), process.env.TARS_PROJECT ?? process.cwd())
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
