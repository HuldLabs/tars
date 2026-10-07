#!/usr/bin/env node
// `tars handoff check [HANDOFF.md]` — o handoff vira contrato CHECAVEL. TARS-CONSUME fatia 4,
// item 3 (fontes: `/workspace/.cache/tars-research/RELATORIO.md` Tema 2 — "nao ha' tars handoff
// check: nada verifica que o HANDOFF tem estado+proximo+sesao e que bate com o git"; e a
// taxonomia de intencao do farmega.v2 `.ai/agents/_shared/handoff-taxonomy.toml`, HEAD 617239d).
//
// PORQUE EXISTE: o HANDOFF e' o cursor que o proximo agente le primeiro, mas nada cobrava que
// ele estivesse VIVO. Um HANDOFF de tres dias atras, com branch que ja' foi apagada, custa uma
// sessao inteira de retrabalho. O check julga a SECAO DO TOPO (o cursor, nao o historico):
//   1. "Proximo passo" presente (sem ele o sucessor nao sabe por onde comecar);
//   2. cada sha citado existe no repo;
//   3. data recente (<= MAX_DIAS);
//   4. a branch citada existe no git (o estado bate com a arvore).
//
// TAXONOMIA DE INTENCAO (opcional): quando o topo traz `Intencao: <id>`, o id tem de ser um dos
// 6 (porte do farmega.v2, reduzido). Campo ausente = nao reprova (o handoff antigo entra aos
// poucos); presente e invalido = reprova.
//
// Uso:
//   node tools/framework/tars-handoff.mjs check [HANDOFF.md] [--cwd <dir>] [--json] [--dias N]
//   tars handoff check [HANDOFF.md]
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'

/** As 6 intencoes do handoff (porte reduzido do `handoff-taxonomy.toml`, 8 -> 6). */
export const INTENTS = ['clarify-scope', 'implement-change', 'review-change', 'validate-risk', 'shape-runtime', 'escalate-conflict']
/** Idade maxima do cursor, em dias. Acima disso o estado provavelmente ja' mudou. */
export const MAX_DIAS = 7
/** Cabecalho `## ` (secao de nivel 2). */
const SECAO = /^##\s/
/** A secao de ESTADO e' o cursor: o titulo nomeia estado/status/sessao. */
const SECAO_ESTADO = /^##\s+.*\b(estado|status|sess[ãa]o|agora)\b/i

/**
 * A secao do CURSOR: o cabecalho `## Estado em ...` (ou o primeiro `##`, se nenhum nomear
 * estado) ate' o proximo `##`. O topo do arquivo (cabecalho + o bloco `>`) e' indice, nao
 * cursor; cortar no PRIMEIRO `##` lia o indice e nunca achava o "Proximo passo".
 */
export function topoDoHandoff(md) {
  const linhas = String(md).split(/\r?\n/)
  let inicio = linhas.findIndex((l) => SECAO_ESTADO.test(l))
  if (inicio === -1) inicio = linhas.findIndex((l) => SECAO.test(l))
  if (inicio === -1) return String(md)
  let fim = linhas.length
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (SECAO.test(linhas[i])) { fim = i; break }
  }
  return linhas.slice(inicio, fim).join('\n')
}

/** "Proximo passo" presente? Aceita "Próximo passo:", "Proximo passo", "*Proximo passo*". */
export function temProximoPasso(topo) {
  return /pr[oó]ximo\s+passo/i.test(topo)
}

/** Data mais recente do topo: `DD/MM/YYYY`, `DD/MM` (ano corrente) ou `YYYY-MM-DD`. */
export function dataDoTopo(topo, hoje = new Date()) {
  let melhor = null
  const guarda = (d) => { if (d && (!melhor || d > melhor)) melhor = d }
  for (const m of String(topo).matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) guarda(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
  for (const m of String(topo).matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : hoje.getUTCFullYear()
    guarda(new Date(Date.UTC(ano, +m[2] - 1, +m[1])))
  }
  return melhor
}

/** A intencao declarada no topo (`Intencao: <id>`), ou null se nao houver campo. */
export function intentDoTopo(topo) {
  const m = /inten[cç][aã]o\s*:\s*([a-z-]+)/i.exec(topo)
  return m ? m[1].toLowerCase() : null
}

/**
 * Julga o handoff. `git` injetavel; `hoje` injetavel (o teste nao depende do relogio).
 * Devolve `{ ok, erros, avisos, data, branch, shas }`.
 */
export function checkHandoff(file, { cwd = process.cwd(), git, hoje = new Date(), dias = MAX_DIAS } = {}) {
  const corre = git ?? ((args) => spawnSync('git', args, { cwd, encoding: 'utf8' }))
  const erros = []
  const avisos = []
  if (!existsSync(file)) return { ok: false, erros: [`HANDOFF nao encontrado: ${file}`], avisos, data: null, branch: null, shas: [] }
  const topo = topoDoHandoff(readFileSync(file, 'utf8'))

  if (!temProximoPasso(topo)) erros.push("secao do topo sem 'Proximo passo' (o sucessor nao sabe por onde comecar)")

  // SHAs citados no topo: cada um tem de existir no repo (ancestral OU apenas conhecido).
  const shas = [...new Set([...topo.matchAll(/(?<![0-9a-zA-Z])[0-9a-f]{7,40}(?![0-9a-zA-Z])/gi)]
    .map((m) => m[0]).filter((s) => /[0-9]/.test(s) && /[a-f]/i.test(s) && new Set(s).size > 1))]
  for (const sha of shas) {
    if (corre(['cat-file', '-e', `${sha}^{commit}`]).status !== 0) erros.push(`sha citado nao existe no repo: '${sha}'`)
  }

  // Branch citada: o texto do topo tem de nomear uma branch que existe.
  const branch = branchCitada(topo)
  if (branch === null) avisos.push('nenhuma branch citada no topo (nao da para bater o estado com o git)')
  else if (!existeBranch(branch, corre)) erros.push(`branch citada nao existe no git: '${branch}'`)

  // Data recente.
  const data = dataDoTopo(topo, hoje)
  if (!data) avisos.push('nenhuma data no topo (nao da para medir a idade do cursor)')
  else {
    const idade = Math.floor((hoje.getTime() - data.getTime()) / 86400000)
    if (idade > dias) erros.push(`cursor velho: ${idade} dia(s) (max ${dias}) — o estado provavelmente ja' mudou`)
  }

  // Taxonomia de intencao: opcional; quando declarada, tem de ser valida.
  const intent = intentDoTopo(topo)
  if (intent && !INTENTS.includes(intent)) erros.push(`intencao invalida: '${intent}' (use ${INTENTS.join('|')})`)

  return { ok: erros.length === 0, erros, avisos, data, branch, shas, intent }
}

/**
 * A branch DECLARADA no topo. O campo `**Branch:** <nome>` e' a fonte; sem ele, aceita o
 * primeiro token `tipo/slug` do texto. O nome sai do TEXTO (nao do git): um nome citado que
 * nao existe e' justamente o defeito que o check existe para pegar — some-lo como "aviso"
 * deixaria passar o caso "o cursor aponta para uma branch que ja' foi apagada".
 */
function branchCitada(topo) {
  const campo = /\bbranch\s*:?\s*\**\s*`?([A-Za-z0-9][A-Za-z0-9._/-]*)`?/i.exec(topo)
  if (campo && campo[1] === 'main') return 'main'
  if (campo && campo[1].includes('/')) return campo[1]
  for (const m of String(topo).matchAll(/\b([a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*)\b/gi)) {
    if (existeNomeDeBranch(m[1])) return m[1]
  }
  return null
}

/**
 * Um token `tipo/slug` com a cara de um nome de branch. A lista de prefixos e' o que separa
 * `chore/ecossistema` (branch) de `docs/PRECOMPACT.md` (caminho de arquivo, que tambem e'
 * `palavra/palavra`) — sem ela o check acusava "branch nao existe" num doc citado.
 * `main` entra sem prefixo: projeto so-main e' legitimo e a branch principal nao tem `tipo/`.
 */
function existeNomeDeBranch(nome) {
  if (nome === 'main') return true
  return /^(feat|fix|chore|docs|refactor|test|perf|ci|build|revert|hotfix)\/[A-Za-z0-9]/.test(nome)
    && !/\.[a-z]{2,4}$/i.test(nome)
}

/** A branch existe (local ou remota)? */
function existeBranch(nome, corre) {
  return corre(['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`]).status === 0
    || corre(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${nome}`]).status === 0
}

/** Texto curto do report. */
export function format(r) {
  const l = [`tars handoff check: ${r.ok ? 'ok' : `${r.erros.length} problema(s)`} (branch ${r.branch ?? '-'}; data ${r.data ? r.data.toISOString().slice(0, 10) : '-'}; ${r.shas.length} sha)${r.intent ? `; intencao ${r.intent}` : ''}`]
  for (const e of r.erros) l.push(`  ERRO: ${e}`)
  for (const a of r.avisos) l.push(`  aviso: ${a}`)
  return l.join('\n')
}
