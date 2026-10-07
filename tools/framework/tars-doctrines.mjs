#!/usr/bin/env node
// `tars doctor` — a DOUTRINA como DADO: cada regra que a gente diz seguir declara a FONTE
// onde esta' escrita, o GATE que a aplica e a PROVA que a falsifica (docs/TARS.md; relatorio
// do doctor §3). Sem isso o par doutrina->gate so' existe na cabeca de quem escreveu o hook.
//
// A ideia que este modulo embute (fabber `architectural-premises.md:29`, "uma regra de
// arquitetura que nao e' teste e' uma sugestao"): doutrina cujo `prova` PASSA nao esta' sendo
// aplicada — e' PHANTOM. O doctor nao inventa gate nenhum: ele declara o par e aponta o orfao.
//
// Le DUAS fontes, na mesma forma: o catalogo (`.ai/doctrines.toml`) e o projeto
// (`.ai/tars.toml`, secao [[doctrine]], que vence pelo `id`). Os caminhos de `fonte`/`gate`/
// `prova` sao resolvidos na raiz do CATALOGO (o catalogo descreve a si mesmo; o consumidor
// declara so' o que e' dele, com caminho proprio).
//
// Uso (dentro do projeto consumidor):
//   node <tars>/tools/framework/tars-doctrines.mjs [--tars <dir>] [--project <dir>] [--json]
//
// Saida: uma linha por doutrina, `STATUS id  fonte  gate`, e exit != 0 quando ha PHANTOM ou
// DRIFT (`--ci` e' o mesmo exit, explicito para o leitor do pipeline). SEM GATE e' aviso:
// doutrina orfa declarada e' divida nomeada, nao esquecimento — nao derruba o build.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTars, parseToml } from './tars-sync.mjs'

export const HERE = dirname(fileURLToPath(import.meta.url))

/** Onde cada doutrina RODA. E' o unico eixo que muda entre projetos (docs/TARS.md §Modelo). */
export const WHERE = ['pre-commit', 'commit-msg', 'pre-push', 'session-start', 'ci']

/** `id` e' `<tema>/<slug>`: o tema agrupa, o slug nomeia. E' a chave de dedup catalogo x projeto. */
const ID_RE = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/

/** Doutrina sem `gate` declarado nao e' esquecimento tolerado: e' divida que precisa de motivo. */
function validate(d, escopo) {
  const onde = escopo === 'catalogo' ? '.ai/doctrines.toml' : '.ai/tars.toml [[doctrine]]'
  const bad = (msg) => { throw new Error(`${onde}: doutrina '${d.id ?? '?'}' ${msg}`) }
  if (!d.id || !ID_RE.test(d.id)) bad(`precisa de id '<tema>/<slug>' (ex.: 'git/branch-name')`)
  if (!d.fonte) bad('sem `fonte` (o arquivo:ancora onde a regra esta ESCRITA)')
  if (!d.prova) bad("sem `prova` (o comando que REPROVA — e' o que torna a doutrina falsificavel)")
  if (!d.gate) bad('sem `gate`; declare `gate = "nenhum"` com `motivo` — orfa nomeada, nunca silenciosa')
  if (d.gate === 'nenhum' && !d.motivo) bad('declara `gate = "nenhum"` mas nao diz `motivo`')
  if (d.onde && !WHERE.includes(d.onde)) bad(`onde '${d.onde}' desconhecido (use ${WHERE.join(', ')})`)
  return {
    id: d.id,
    titulo: d.titulo ?? d.id,
    fonte: d.fonte,
    gate: d.gate,
    motivo: d.motivo ?? null,
    prova: d.prova,
    onde: d.onde ?? 'ci',
    escopo: d.escopo ?? (escopo === 'catalogo' ? 'catalogo' : 'projeto'),
    doc: d.doc ?? null,
  }
}

/** Le a secao `[[doctrine]]` de um TOML ja' parseado (o array de tabelas vira `notas`). */
const doctrinesOf = (cfg) => (Array.isArray(cfg.doctrine) ? cfg.doctrine : [])

function readToml(file) {
  if (!existsSync(file)) return null
  return parseToml(readFileSync(file, 'utf8'))
}

/**
 * Resolve as doutrinas do catalogo + as do projeto. O projeto VENCE pelo `id` (a mesma regra
 * do conflito de memoria: docs/TARS.md §Memoria em duas camadas) — o que o projeto nao
 * redeclara herda do catalogo.
 */
export function loadDoctrines({ tars, project }) {
  const catalogo = doctrinesOf(readToml(join(tars, '.ai', 'doctrines.toml')) ?? {})
  const projectCfg = readToml(join(project, '.ai', 'tars.toml')) ?? {}
  const doProjeto = doctrinesOf(projectCfg)
  const out = new Map()
  for (const d of catalogo) out.set(d.id, validate(d, 'catalogo'))
  for (const d of doProjeto) out.set(d.id, validate(d, 'projeto'))
  return [...out.values()]
}

/**
 * `arquivo:linha` ou `arquivo:120-140`; sem linha, o arquivo inteiro. O prefixo `segtools:`
 * marca doutrina que so' o projeto consumidor tem: a fonte e' conferida la', nao aqui — o
 * catalogo descreve o par sem copiar a politica de quem o consome.
 */
export function parseRef(ref) {
  const externo = ref.startsWith('segtools:')
  const corpo = externo ? ref.slice('segtools:'.length) : ref
  const m = corpo.match(/^(.*?):(\d+)(?:-(\d+))?$/)
  const base = m ? { arquivo: m[1], linha: Number(m[2]), fim: m[3] ? Number(m[3]) : Number(m[2]) } : { arquivo: corpo }
  return { ...base, externo }
}

/** `true` quando o arquivo existe e o range de linhas ainda cabe nele (senao: DRIFT). */
function fonteOk(base, ref) {
  const { arquivo, linha, fim } = parseRef(ref)
  const full = isAbsolute(arquivo) ? arquivo : join(base, arquivo)
  if (!existsSync(full)) return { ok: false, porque: `fonte nao existe: ${arquivo}` }
  if (linha === undefined) return { ok: true }
  const total = readFileSync(full, 'utf8').split('\n').length
  if (fim > total) return { ok: false, porque: `fonte ${arquivo}:${linha} aponta linha ${fim} de ${total} — o texto mudou de lugar` }
  return { ok: true }
}

/** Roda a `prova` (shell, na raiz do catalogo). Timeout curto: o doctor inteiro e' < 5 s. */
function rodaProva(prova, base) {
  const r = spawnSync(prova, { shell: true, cwd: base, encoding: 'utf8', timeout: 20_000 })
  if (r.error) return { rc: 127, out: r.error.message }
  return { rc: r.status ?? 127, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

/**
 * Classifica uma doutrina:
 *   OK        — a prova REPROVA (exit != 0): a doutrina e' cobrada de verdade
 *   PHANTOM   — nao ha gate, ou a prova PASSA: a regra nao esta' sendo aplicada
 *   SEM GATE  — orfa declarada com motivo: divida nomeada (aviso, nao derruba o build)
 *   DRIFT     — a `fonte` sumiu ou a linha declarada saiu do texto: o punho mudou
 */
export function classify(d, base = process.cwd(), { spawn = rodaProva } = {}) {
  // Doutrina de OUTRO projeto (`segtools:`): nem a fonte nem a prova rodam aqui — o catalogo
  // so' descreve o par. Julgar aqui daria DRIFT falso (o arquivo mora no projeto, nao aqui).
  if (parseRef(d.fonte).externo) return { ...d, status: 'PROJETO', detalhe: `descreve ${d.fonte} — o doctor roda no projeto consumidor` }
  const fonte = fonteOk(base, d.fonte)
  if (!fonte.ok) return { ...d, status: 'DRIFT', detalhe: fonte.porque }
  if (d.gate === 'nenhum') {
    const { rc, out } = spawn(d.prova, base)
    return rc === 0
      ? { ...d, status: 'SEM GATE', detalhe: `${d.motivo} (prova ainda nao existe: exit 0)`, prova: d.prova, saida: out }
      : { ...d, status: 'SEM GATE', detalhe: d.motivo, prova: d.prova }
  }
  const { rc, out } = spawn(d.prova, base)
  if (rc === 0) return { ...d, status: 'PHANTOM', detalhe: 'a prova PASSOU — nada distingue quem segue de quem ignora', saida: out }
  return { ...d, status: 'OK', detalhe: `prova reprova (exit ${rc})` }
}

/** A doutrina nao esta' sendo cobrada: o doctor sai != 0 (R4 — falha alta). */
export const FALHA = ['PHANTOM', 'DRIFT']

/** Carrega, classifica e resume. `faltando` e' o que derruba o exit code. */
export function doctor({ tars, project } = {}) {
  const catalogo = resolve(tars ?? findTars())
  const root = resolve(project ?? process.cwd())
  // A base das doutrinas de outro projeto (`segtools:`) e' o PROJETO, nao o catalogo.
  const itens = loadDoctrines({ tars: catalogo, project: root }).map((d) =>
    classify(d, parseRef(d.fonte).externo ? root : catalogo),
  )
  const porStatus = Object.fromEntries(
    ['OK', 'PHANTOM', 'SEM GATE', 'DRIFT', 'PROJETO'].map((s) => [s, itens.filter((i) => i.status === s).length]),
  )
  return { tars: catalogo, project: root, itens, porStatus, faltando: itens.filter((i) => FALHA.includes(i.status)) }
}

/** Uma linha por doutrina: `STATUS  id  onde  gate`, com o detalhe abaixo quando ha' o que dizer. */
export function format({ itens, porStatus, tars, project }, log = console.log) {
  log(`tars doctor — ${itens.length} doutrina(s) · catalogo ${tars} · projeto ${project}`)
  for (const i of itens) {
    log(`${i.status.padEnd(9)} ${i.id}  [${i.onde}]  gate=${i.gate}`)
    if (i.status !== 'OK') log(`          ${i.detalhe}`)
  }
  log(
    `\nOK ${porStatus.OK} · PHANTOM ${porStatus.PHANTOM} · SEM GATE ${porStatus['SEM GATE']} · DRIFT ${porStatus.DRIFT}` +
      (porStatus.PROJETO ? ` · PROJETO ${porStatus.PROJETO}` : ''),
  )
  if (porStatus['SEM GATE']) log('SEM GATE e aviso: a doutrina esta declarada sem quem a cobre (divida nomeada).')
  if (porStatus.PROJETO) log(`PROJETO: ${porStatus.PROJETO} doutrina(s) de outro consumidor — confira rodando o doctor la'.`)
  if (porStatus.PHANTOM || porStatus.DRIFT) log('PHANTOM/DRIFT reprovam: a doutrina diz que e cobrada e nao e.')
}

// --- CLI -------------------------------------------------------------------
if (!process.env.TARS_AS_MODULE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const val = (nome) => {
    const i = args.indexOf(nome)
    return i === -1 ? null : args[i + 1]
  }
  try {
    const r = doctor({
      tars: val('--tars') ?? process.env.TARS_HOME ?? findTars(),
      project: val('--project') ?? process.env.TARS_PROJECT ?? process.cwd(),
    })
    if (args.includes('--json')) console.log(JSON.stringify(r, null, 2))
    else format(r)
    process.exit(r.faltando.length ? 1 : 0)
  } catch (err) {
    console.error(`tars doctor: ${err.message}`)
    process.exit(2)
  }
}
