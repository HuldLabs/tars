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

/** Onde o gate mora: base no `.ai/base/gates/<nome>/`, local no caminho do projeto. */
function target(project, hook, item) {
  if (item.origem === 'local') return join(project, item.caminho)
  return join(project, '.ai', BASE, 'gates', item.nome)
}

/** Comando do gate: pasta => o `gate.mjs` dela (ou o unico `.mjs`/`.sh`); arquivo => ele mesmo. */
function command(dir) {
  if (!statSync(dir).isFile()) {
    const gate = join(dir, 'gate.mjs')
    if (existsSync(gate)) return [process.execPath, gate]
    return null
  }
  if (dir.endsWith('.mjs')) return [process.execPath, dir]
  if (dir.endsWith('.sh')) return ['sh', dir]
  return null
}

/**
 * Roda o hook inteiro. Devolve {ok, rodados, falhou}; o CLI traduz para o exit code.
 * `log`/`err` sao injetaveis para o teste (a saida de cada gate vai para o terminal, herdada).
 */
export function runHooks({ hook, manifest, project, args = [], log = console.log, err = console.error, spawn = spawnSync } = {}) {
  const rodados = []
  for (const item of planGates(manifest, hook)) {
    const dir = target(project, hook, item)
    if (!existsSync(dir)) {
      err(`gate ${item.nome}: NAO ENCONTRADO em ${dir} — o manifesto declara e o arquivo nao existe (rode tars sync).`)
      return { ok: false, rodados, falhou: { nome: item.nome, motivo: 'ausente' } }
    }
    const cmd = command(dir)
    if (!cmd) {
      err(`gate ${item.nome}: nao sei executar ${dir} (esperado pasta com gate.mjs, ou arquivo .mjs/.sh).`)
      return { ok: false, rodados, falhou: { nome: item.nome, motivo: 'sem-exec' } }
    }
    log(`gate ${item.nome}`)
    const params = manifest.gates?.params?.[item.nome] ?? {}
    const r = spawn(cmd[0], [...cmd.slice(1), ...args], {
      stdio: 'inherit',
      env: { ...process.env, TARS_PROJECT: project, TARS_GATE: item.nome, TARS_GATE_PARAMS: JSON.stringify(params) },
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
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
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
