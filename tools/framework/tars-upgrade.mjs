#!/usr/bin/env node
// `tars upgrade-notes` — as NOTAS DE UPGRADE entre a versao do consumidor e a atual.
//
// Por que existe: o agente do seo-brain gastou turnos decifrando o que mudou no Tars
// (07/10). O consumidor precisa de notas ACIONAVEIS: o que mudou, por que, quais arquivos
// no projeto sao tocados e o comando exato a rodar. A fonte e' o `CHANGELOG.md` do catalogo:
//   `## 0.0.1-dev.N` + as 4 subsecoes fixas (`O que mudou` / `Por que` / `Arquivos
//   impactados no consumidor` / `O que o consumidor faz`).
//
// Uso (dentro do projeto consumidor):
//   tars upgrade-notes [--tars <dir>] [--project <dir>] [--from <versao>] [--json]
//
// Sem `--from`, compara o `.ai/tars.lock` do consumidor com a versao atual do catalogo e
// imprime SO' as notas das versoes estritamente entre as duas. O `tars sync` chama isto no
// fim quando a versao subiu (uma linha apontando `tars upgrade-notes`).
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTars, readVersion } from './tars-sync.mjs'

/** Versao `0.0.1-dev.N` -> comparavel por N; `0.0.1` (release) vem depois de todo dev. */
export function versionKey(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/.exec(String(v ?? '').trim())
  if (!m) return null
  const [, major, minor, patch, dev] = m
  // Sem sufixo `-dev` = release final: dev N fica logo abaixo (soma fracionaria).
  const devPart = dev === undefined ? 1 : Number(dev) / 1000
  return Number(major) * 1e6 + Number(minor) * 1e3 + Number(patch) + devPart
}

export const compareVersions = (a, b) => {
  const ka = versionKey(a)
  const kb = versionKey(b)
  if (ka === null || kb === null) return null // versao ilegivel: nao se compara
  return ka - kb
}

/**
 * Le o CHANGELOG e separa por versao. Cada bloco vai da linha `## <versao>` ate' a proxima
 * `## `. Ordem preservada do arquivo (mais nova no topo, convencao do Keep a Changelog).
 */
export function parseChangelog(text) {
  const blocos = []
  let atual = null
  for (const linha of text.split('\n')) {
    const m = /^##\s+(\S+)\s*$/.exec(linha)
    if (m) {
      atual = { version: m[1], corpo: [] }
      blocos.push(atual)
      continue
    }
    if (atual) atual.corpo.push(linha)
  }
  return blocos.map((b) => ({ version: b.version, corpo: b.corpo.join('\n').trim() }))
}

/** Notas entre `from` (exclusivo) e `to` (inclusivo), mais novas primeiro. */
export function notesBetween(blocos, from, to) {
  const kf = from ? versionKey(from) : null
  const out = []
  for (const b of blocos) {
    const kv = versionKey(b.version)
    if (kv === null) continue // cabecalho sem versao (ex.: `## [Unreleased]`)
    if (compareVersions(b.version, to) > 0) continue
    if (kf !== null && compareVersions(b.version, from) <= 0) continue
    out.push(b)
  }
  return out.sort((a, b) => compareVersions(b.version, a.version))
}

/** Le a versao travada no `.ai/tars.lock` do consumidor (null quando nao ha lock). */
export function lockVersion(project) {
  const file = join(project, '.ai', 'tars.lock')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))?.tars?.version ?? null
  } catch {
    return null
  }
}

/** Junta tudo: a versao de origem, a atual e as notas entre elas. */
export function upgradeNotes({ tars, project, from } = {}) {
  const catalogo = resolve(tars ?? findTars())
  const root = resolve(project ?? process.cwd())
  const changelogPath = join(catalogo, 'CHANGELOG.md')
  const version = readVersion(catalogo)
  const origem = from ?? lockVersion(root)
  if (!existsSync(changelogPath)) return { version, from: origem, notas: [], faltando: 'CHANGELOG.md ausente no catalogo' }
  const blocos = parseChangelog(readFileSync(changelogPath, 'utf8'))
  if (origem && compareVersions(origem, version) === null)
    return { version, from: origem, notas: [], faltando: `versao do lock ilegivel: '${origem}' (esperado X.Y.Z[-dev.N])` }
  // Versao do lock que o CHANGELOG nao conhece (esquema antigo, ex.: `1.0.0` antes do
  // `0.0.1-dev.N`): comparar diria "ja' em dia" e esconderia tudo (seo-brain, 14/10). Sem
  // ponto de partida conhecido, mostra TODAS as notas ate' a atual e diz por que.
  if (origem && !blocos.some((b) => b.version === origem))
    return { version, from: origem, notas: notesBetween(blocos, null, version), faltando: null, aviso: `versao do lock '${origem}' nao consta do CHANGELOG (esquema antigo?) — mostrando todas as notas ate' ${version}` }
  const notas = notesBetween(blocos, origem, version)
  return { version, from: origem, notas, faltando: null }
}

/** Imprime as notas: um bloco por versao, na ordem mais nova -> mais antiga. */
export function format(r, log = console.log) {
  if (r.faltando) {
    log(`tars upgrade-notes: ${r.faltando}`)
    return
  }
  if (r.aviso) log(`tars upgrade-notes — ${r.aviso}:`)
  else if (!r.from) log(`tars upgrade-notes — sem lock no consumidor; notas ate' ${r.version}:`)
  else if (!r.notas.length) log(`tars upgrade-notes — nada entre ${r.from} e ${r.version} (ja' em dia).`)
  else log(`tars upgrade-notes — de ${r.from} para ${r.version}:`)
  for (const n of r.notas) {
    log(`\n## ${n.version}\n${n.corpo}`)
  }
}

// --- CLI -------------------------------------------------------------------
if (!process.env.TARS_AS_MODULE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const arg = (name) => {
    const i = process.argv.indexOf(name)
    return i === -1 ? null : process.argv[i + 1]
  }
  try {
    const r = upgradeNotes({
      tars: resolve(arg('--tars') ?? findTars()),
      project: resolve(arg('--project') ?? process.cwd()),
      from: arg('--from'),
    })
    if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2))
    else format(r)
    if (r.faltando) process.exit(1)
  } catch (err) {
    console.error(`tars upgrade-notes: ${err.message}`)
    process.exit(1)
  }
}
