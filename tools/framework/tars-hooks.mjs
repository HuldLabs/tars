#!/usr/bin/env node
// `tars hooks <hook>` — o MOTOR de gates (docs/TARS.md §Modelo, fatia 4).
//
// Le `[gates]` do `.ai/tars.toml` do projeto consumidor e roda, NA ORDEM DECLARADA, os
// gates da base (`.ai/base/gates/<nome>/`) e os LOCAIS (caminho do projeto). Para no
// primeiro que falhar (rc != 0), imprime a saida dele e sai != 0. Gate declarado e AUSENTE
// = falha RUIDOSA (um gate que some nao pode virar um commit que passa).
//
// PORQUE BASE PRIMEIRO: a base e' o piso comum (mensagem, segredo, add amplo) e barato; o
// local e' a politica do projeto, que pode ser caro. `local` no manifesto so' roda nos
// hooks `local` e `pre-commit` — no `pre-push` ele fica de fora de proposito: o pre-push e'
// o portao CARO (a arvore inteira) e o segtools nao repete o gate local ali.
//
// Uso:
//   node <tars>/tools/framework/tars-hooks.mjs <hook> [args do hook...]
//   TARS_PROJECT=<dir>  raiz do projeto consumidor (default: sobe do cwd ate' achar .ai/)
//
// O que o gate recebe: os argumentos do hook como estao (ex.: o arquivo da mensagem no
// `commit-msg`, §1 do `.githooks/` do segtools), `TARS_PROJECT` no ambiente, `TARS_GATE`
// com o nome e `TARS_GATE_PARAMS` com o JSON de `[gates.params.<nome>]` do manifesto.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOOKS, parseToml } from './tars-sync.mjs'
import { jsRuntime } from './tars-runtime.mjs'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const BASE = 'base'

/** Sobe do `start` ate' achar o `.ai/tars.toml` do projeto consumidor. */
export function findProject(start = process.cwd()) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const file = join(dir, '.ai', 'tars.toml')
    if (existsSync(file)) return { project: dir, file }
    if (dirname(dir) === dir) throw new Error('nao achei `.ai/tars.toml` (use TARS_PROJECT=<dir>)')
  }
}

/**
 * O que sobrou para rodar, na ordem declarada: base primeiro, depois local. Um item com `/`
 * e' caminho do PROJETO (gate local); nome simples e' item do catalogo. Gate local listado em
 * `pre-commit` fica de fora do `pre-push` (o portao caro).
 */
export function planGates(manifest, alvo) {
  // `prepare-commit-msg` e' o GEMEO do `commit-msg`: nao tem lista propria no manifesto — ele
  // roda os MESMOS gates do `commit-msg`, mas no passo `--inject` (o emoji entra antes de a
  // mensagem ser validada). Sem manifesto proprio, o par fica uma coisa so' (R3).
  if (alvo === 'prepare-commit-msg') alvo = 'commit-msg'
  if (!HOOKS.includes(alvo)) throw new Error(`hook desconhecido: '${alvo}' (use ${HOOKS.join(', ')})`)
  // `gates.params` e' configuracao, nao lista de gates: fora da varredura.
  const listas = (nome) => (Array.isArray(manifest.gates?.[nome]) ? manifest.gates[nome] : [])
  const base = HOOKS.filter((h) => h === alvo && h !== 'local').flatMap((h) =>
    listas(h).filter((g) => !g.includes('/')).map((g) => ({ nome: g, origem: 'base' })),
  )
  // No `local` os nomes simples sao aceitos por simetria (um gate local pode ser bare);
  // nos outros hooks, item bare em `local` nao existe no `.ai/base/` e seria fantasma.
  const doLocal = (alvo === 'pre-commit' ? ['local'] : []).flatMap((h) =>
    listas(h).filter((g) => g.includes('/')).map((nome) => ({ nome, origem: 'local', caminho: nome })),
  )
  const local = alvo === 'local' ? listas('local').map((g) => ({ nome: g, origem: 'local', caminho: g })) : doLocal
  return [...base, ...local]
}

/**
 * O projeto E' o catalogo (o Tars consumindo a si mesmo, modo `self` do sync): o `.ai/VERSION`
 * marca a raiz do Tars. Aqui a base nao e' `.ai/base/` — ela E' o proprio `.ai/` (copiar
 * `.ai/gates/` para `.ai/base/` seria a duplicacao que a R3 proibe).
 */
export function isCatalog(project) {
  return existsSync(join(project, '.ai', 'VERSION'))
}

/** Onde o gate mora: base no `.ai/base/gates/<nome>/` (ou `.ai/gates/` no catalogo), local no projeto. */
function target(project, hook, item) {
  if (item.origem === 'local') return join(project, item.caminho)
  const base = isCatalog(project) ? join(project, '.ai', 'gates') : join(project, '.ai', BASE, 'gates')
  return join(base, item.nome)
}

/** Comando do gate: pasta => o `gate.mjs` dela (ou o unico `.mjs`/`.sh`); arquivo => ele mesmo.
 *  O runtime JS vem do resolvedor UNICO (`tars-runtime.mjs`): no binario compilado o
 *  `process.execPath` e' o proprio `tars`, nao um runtime — montar o comando com ele fazia o
 *  binario engolir o caminho do gate como argumento e sair 0 (Incident: gate calado). */
function command(dir, hook, runtime) {
  const js = (alvo) => [runtime.cmd, alvo]
  if (!statSync(dir).isFile()) {
    // `prepare-commit-msg`: o passo e' o `--inject` do validador (injeta o emoji do tipo),
    // nao o `gate.mjs` que so' VALIDA. O validador viaja junto do gate (item de catalogo = pasta).
    if (hook === 'prepare-commit-msg') {
      const inject = join(dir, 'validate-commit.mjs')
      if (existsSync(inject)) return [...js(inject), '--inject']
    }
    const gate = join(dir, 'gate.mjs')
    if (existsSync(gate)) return js(gate)
    return null
  }
  if (dir.endsWith('.mjs')) return js(dir)
  if (dir.endsWith('.sh')) return ['sh', dir]
  return null
}

/**
 * Roda o hook inteiro. Devolve {ok, rodados, falhou}; o CLI traduz para o exit code.
 * `log`/`err` sao injetaveis para o teste (a saida de cada gate vai para o terminal, herdada).
 */
export function runHooks({ hook, manifest, project, args = [], log = console.log, err = console.error, spawn = spawnSync } = {}) {
  const rodados = []
  // O runtime dos gates `.mjs` e' resolvido UMA vez (R3) e passado a quem monta o comando.
  // Sem runtime NENHUM, falha antes de tocar qualquer gate: um "ok" aqui seria o gate calado.
  const runtime = jsRuntime()
  if (!runtime) {
    const nome = planGates(manifest, hook).find((g) => g.origem === 'base')?.nome ?? hook
    err(`gate ${nome}: nenhum runtime JS (node/bun) — os gates .mjs NAO rodam (instale node ou bun).`)
    return { ok: false, rodados, falhou: { nome, motivo: 'sem-runtime' } }
  }
  for (const item of planGates(manifest, hook)) {
    const dir = target(project, hook, item)
    if (!existsSync(dir)) {
      err(`gate ${item.nome}: NAO ENCONTRADO em ${dir} — o manifesto declara e o arquivo nao existe (rode tars sync).`)
      return { ok: false, rodados, falhou: { nome: item.nome, motivo: 'ausente' } }
    }
    const cmd = command(dir, hook, runtime)
    if (!cmd) {
      err(`gate ${item.nome}: nao sei executar ${dir} (esperado pasta com gate.mjs, ou arquivo .mjs/.sh).`)
      return { ok: false, rodados, falhou: { nome: item.nome, motivo: 'sem-exec' } }
    }
    log(`gate ${item.nome}`)
    const params = manifest.gates?.params?.[item.nome] ?? {}
    const r = spawn(cmd[0], [...cmd.slice(1), ...args], {
      stdio: 'inherit',
      env: { ...process.env, ...runtime.env, TARS_PROJECT: project, TARS_GATE: item.nome, TARS_GATE_PARAMS: JSON.stringify(params) },
    })
    rodados.push(item.nome)
    if (r.error) {
      err(`gate ${item.nome}: FALHOU — nao consegui executar (${r.error.message}).`)
      return { ok: false, rodados, falhou: { nome: item.nome, motivo: 'exec' } }
    }
    if (r.status !== 0) {
      err(`\ngate ${item.nome}: FALHOU (exit ${r.status}).`)
      return { ok: false, rodados, falhou: { nome: item.nome, motivo: 'rc', rc: r.status } }
    }
  }
  log(`tars hooks ${hook}: ${rodados.length} gate(s) ok.`)
  return { ok: true, rodados }
}

// --- CLI -------------------------------------------------------------------
// `TARS_AS_MODULE` desliga o auto-run quando o `tars.mjs` importa o modulo no modo
// `bun build --compile` (la o import.meta.url de todo modulo embutido vira o do entrypoint).
// `TARS_GATE` marca o gate rodado pelo `command()`: la o `argv[1]` e' o do GATE (ex.:
// `.ai/gates/gitleaks/gate.mjs`), nao o nosso — sem esta exclusao a guarda dispara no gate
// e o nosso CLI engole os argumentos dele.
if (!process.env.TARS_AS_MODULE && !process.env.TARS_GATE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [hook, ...args] = process.argv.slice(2)
  if (!hook) {
    console.error(`uso: tars-hooks.mjs <${HOOKS.join('|')}> [args do hook]`)
    process.exit(2)
  }
  try {
    // TARS_PROJECT aponta a raiz do projeto; o diretorio `.ai/` entra por atalho (quem escreve
    // o corpo do hook tem o `.ai` a mao via `$(git rev-parse --show-toplevel)/.ai`).
    let start = process.env.TARS_PROJECT ?? process.cwd()
    if (existsSync(join(start, 'tars.toml'))) start = dirname(start)
    const found = findProject(start)
    const manifest = parseToml(readFileSync(found.file, 'utf8'))
    const r = runHooks({ hook, manifest, project: found.project, args })
    process.exit(r.ok ? 0 : 1)
  } catch (e) {
    console.error(`tars hooks: ${e.message}`)
    process.exit(1)
  }
}
