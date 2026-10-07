#!/usr/bin/env node
// `tars verify <arquivo>` — as CLAIMS de um bloco de entrega viram DADO e cada uma e'
// RE-EXECUTADA contra a arvore (fabber `ai-layer-benchmark.md:250-270`, item 11 do
// relatorio do Tars). O `doctor` cobra a doutrina; o `verify` cobra a ENTREGA.
//
// PORQUE EXISTE: "rodou sem erro" nao e' evidencia de convergencia (fabber
// `architectural-premises.md:75-115`, INV-IAC-1). Uma claim so' e' VERIFIED quando um
// TERCEIRO roda o `verify` e a saida casa com o `expect` — saida nao rodada nesta sessao
// nunca conta. Um `verify` que nao casa (ou ausente) e' PHANTOM: a claim nao tem prova.
//
// FORMATO (uma claim por linha do bloco de entrega):
//   claim: o adapter sobe no host do MCP | verify: node x.mjs | expect: [DERIVED] rc=0
//   - `claim:`  o que se afirma ser verdade (texto livre)
//   - `verify:` o comando que um TERCEIRO roda (shell)
//   - `expect:` saida literal que o comando deve produzir (substring), ou `/regex/`
//   - tag       `[VERIFIED]` | `[DERIVED]` | `[ASSUMED]` | `[UNKNOWN]`, no `claim:` ou no
//               `expect:`. Ausente = [UNKNOWN] (o mais fraco: nunca confiavel por omissao)
//
// REPROVA (exit != 0):
//   PHANTOM  — o `verify` rodou e nao casou o `expect`, ou o campo falta
//   UNKNOWN  — claim sem tag (ausente = UNKNOWN) bloqueia incondicional
//   ASSUMED  — mais de 3 claims [ASSUMED] no bloco (teto do fabber)
//   NEGATIVO — claim de "corrigido/testado" sem uma prova NEGATIVA (um `verify` que
//              DEVERIA falhar e falha; ver §negativo). O caso que "so' passa" nao distingue
//              quem convergiu de quem nunca testou o alvo certo.
//
// Uso:
//   node <tars>/tools/framework/tars-verify.mjs <arquivo> [--cwd <dir>] [--json]
//   <arquivo> = `-` le o bloco da entrada padrao.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = dirname(fileURLToPath(import.meta.url))

/** As quatro tags de confianca (fabber): a mais fraca e' o DEFAULT. */
export const TAGS = ['VERIFIED', 'DERIVED', 'ASSUMED', 'UNKNOWN']
/** Teto de [ASSUMED] por bloco: acima disso a entrega se auto-bloqueia. */
export const MAX_ASSUMED = 3
/** Claim cujo texto casa isto promete conserto/teste — exige prova NEGATIVA. */
const CLAIM_FORTE = /\b(corrig\w*|fixed|conserta\w*|testad\w*|tested|validado|validated)\b/i
/** Comando de prova negativa: marca `verify-negativo:` ou `verify:` que DEVE falhar. */
const NEGATIVO_RE = /\b(?:falha|falhar|fail|fails|deve falhar|expect[- ]fail)\b/i

/**
 * Extrai as claims do texto. Aceita o par `|` (formato do fabber) e o par `||`.
 * Campos ausentes entram como null — quem julga (classify) decide, nao o parser.
 */
export function parseClaims(text) {
  const out = []
  const linhas = text.split(/\r?\n/)
  let atual = null
  let dentro = false
  for (const linha of linhas) {
    const i = linha.search(/claim\s*:/i)
    if (i !== -1) {
      if (atual) out.push(fecha(atual))
      dentro = true
      atual = { campos: {} }
      // A linha inteira (a partir do `claim:`) traz os campos, varios por `|`.
      atual = absorve(atual, linha.slice(i))
      continue
    }
    if (!dentro) continue
    if (linha.trim() === '') continue
    if (/^\s*(verify|expect|tag)\s*:/i.test(linha) || linha.includes('|')) {
      const j = linha.indexOf('|')
      atual = absorve(atual, j === -1 ? linha : linha.slice(j + 1))
      continue
    }
    break // linha fora do formato = fim do bloco
  }
  if (atual) out.push(fecha(atual))
  return out
}

/** Absorve `| campo: valor` (varios por linha) no acumulador; devolve o acumulador. */
function absorve(acc, trecho) {
  for (const parte of String(trecho).split('|')) {
    const m = parte.match(/\s*(claim|verify|expect|tag|verify-negativo)\s*:\s*(.*)$/i)
    if (!m) continue
    const campo = m[1].toLowerCase()
    // `claim:` so' abre; um novo `claim:` no meio da mesma linha e' ignorado aqui.
    if (campo === 'claim' && acc.campos.claim !== undefined) continue
    acc.campos[campo] = m[2].trim()
  }
  return acc
}

/** Normaliza a tag: explicita > embutida no claim/expect > UNKNOWN (default fraco). */
function fecha(acc) {
  const c = acc.campos
  const fonte = `${c.claim ?? ''} ${c.expect ?? ''}`
  const m = fonte.match(/\[(VERIFIED|DERIVED|ASSUMED|UNKNOWN)\]/i)
  const tag = (c.tag || m?.[1] || 'UNKNOWN').toUpperCase()
  const limpa = (s) => (s ?? '').replace(/\[(VERIFIED|DERIVED|ASSUMED|UNKNOWN)\]\s*/i, '').trim()
  const forte = CLAIM_FORTE.test(limpa(c.claim))
  return {
    claim: limpa(c.claim),
    verify: (c.verify ?? '').trim() || null,
    // `expect:` presente e vazio e' VALIDO (so' o exit 0 importa): preserva '' para nao
    // virar "sem expect". Ausente de verdade continua null.
    expect: c.expect === undefined ? null : limpa(c.expect),
    tag: TAGS.includes(tag) ? tag : 'UNKNOWN',
    // Claim de conserto/teste exige prova negativa: marcador `verify-negativo:` (o
    // comando que DEVE falhar) ou `verify:` cujo texto pede a falha (`| fail`).
    'verify-negativo': c['verify-negativo'] ?? null,
    negativo: c['verify-negativo'] != null || (c.verify ? NEGATIVO_RE.test(c.verify) : false),
    forte,
  }
}

/** `expect` literal = substring; `/re/` = regex. Casamento normaliza espacos das bordas. */
export function matchesExpect(expect, saida) {
  // `expect` vazio = "so' o exit 0": nao ha saida a casar, o rc manda.
  if (expect == null || expect.trim() === '') return true
  const rev = expect.match(/^\/(.*)\/[a-z]*$/)
  if (rev) {
    try {
      return new RegExp(rev[1], 'm').test(saida)
    } catch {
      return false
    }
  }
  return saida.includes(expect.replace(/^`|`$/g, ''))
}

/** Roda o `verify` (shell, no cwd do projeto). Timeout generoso: a entrega inteira e' < 30 s. */
function roda(comando, cwd) {
  const r = spawnSync(comando, { shell: true, cwd, encoding: 'utf8', timeout: 30_000 })
  if (r.error) return { rc: 127, out: r.error.message, ok: false }
  return { rc: r.status ?? 127, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), ok: r.status === 0 }
}

/**
 * Classifica UMA claim contra o alvo:
 *   VERIFIED — o `verify` rodou e casou o `expect`
 *   PHANTOM  — o `verify` nao casou, ou falta `verify`/`expect`
 *   UNKNOWN  — sem tag propria (default): bloqueia sem rodar
 */
export function classify(claim, { cwd = process.cwd(), spawn = roda } = {}) {
  // `expect: null` = campo ausente (sem prova); `expect: ''` = presente e vazio = so' o exit 0.
  if (!claim.verify || claim.expect == null) {
    return { ...claim, status: 'PHANTOM', detalhe: claim.verify ? 'sem `expect`' : 'sem `verify` (a claim nao tem prova)' }
  }
  // Prova negativa: o comando que DEVE falhar. Se ele PASSA, a claim nao distingue quem
  // convergiu de quem nunca testou o alvo certo (INV-IAC-1) — PHANTOM, sem nem rodar o positivo.
  if (claim.negativo) {
    const rn = spawn(negativoComando(claim), cwd)
    if (rn.ok) {
      return { ...claim, status: 'PHANTOM', rc: rn.rc, saida: rn.out, negativoRodou: false,
        detalhe: 'prova negativa PASSOU — o comando deveria FALHAR no alvo (nao distingue convergencia)' }
    }
  }
  const { rc, out } = spawn(claim.verify, cwd)
  const casou = rc === 0 && matchesExpect(claim.expect, out)
  return {
    ...claim,
    status: casou ? 'VERIFIED' : 'PHANTOM',
    rc,
    saida: out,
    negativoRodou: claim.negativo ? true : undefined,
    detalhe: casou
      ? claim.expect === ''
        ? `exit ${rc} (expect vazio: so' o exit conta)`
        : `saida casa ${claim.expect}`
      : `exit ${rc}${matchesExpect(claim.expect, out) ? '' : ' e saida NAO casa'} — esperado: ${claim.expect || '(vazio)'}`,
  }
}

/**
 * Julga o bloco inteiro. `faltando` e' o que derruba o exit code: PHANTOM, UNKNOWN,
 * NEGATIVO (claim forte sem prova negativa) — e, se passar do teto, o ASSUMED excedente.
 */
export function verify({ caminho, cwd = process.cwd(), texto, spawn = roda } = {}) {
  const bruto = texto ?? readFileSync(caminho, 'utf8')
  const claims = parseClaims(bruto).map((c) => classify(c, { cwd, spawn }))
  const falhas = []

  // Claim de conserto/teste SEM prova negativa no bloco = nao distingue quem convergiu de
  // quem nunca testou o alvo certo. A prova negativa pode estar em QUALQUER claim do bloco.
  if (!claims.some((c) => c.negativo) && claims.some((c) => c.forte && c.status === 'VERIFIED')) {
    const alvo = claims.find((c) => c.forte && c.status === 'VERIFIED')
    alvo.status = 'NEGATIVO'
    alvo.detalhe = 'claim de corrigido/testado sem prova NEGATIVA (um `verify` que DEVERIA falhar e falha)'
    falhas.push(alvo)
  }
  // UNKNOWN bloqueia INCONDICIONAL (fabber): mesmo que o `verify` case, "saida nao rodada
  // nesta sessao nunca conta como [VERIFIED]" — a tag mais fraca nunca fecha uma entrega.
  for (const c of claims) {
    if (c.tag === 'UNKNOWN' && c.status === 'VERIFIED') {
      c.status = 'UNKNOWN'
      c.detalhe = 'sem tag propria ([VERIFIED]/[DERIVED]/[ASSUMED]): saida nao rodada NESTA sessao nao conta'
    }
  }
  // Cada claim nao-VERIFIED entra em `falhas` exatamente uma vez, com o status mais grave
  // ja' carimbado (PHANTOM/NEGATIVO/ASSUMED/UNKNOWN), sem duplicar.
  for (const c of claims) if (c.status !== 'VERIFIED' && !falhas.includes(c)) falhas.push(c)

  const assumed = claims.filter((c) => c.tag === 'ASSUMED')
  if (assumed.length > MAX_ASSUMED) {
    for (const c of assumed.slice(MAX_ASSUMED)) {
      c.status = 'ASSUMED'
      c.detalhe = `acima do teto de ${MAX_ASSUMED} [ASSUMED] — a entrega se auto-bloqueia`
      falhas.push(c)
    }
  }
  return { claims, falhas, assumed: assumed.length, negativos: claims.filter((c) => c.negativo).length }
}

/** O comando que a prova negativa roda: o `verify-negativo:` declarado, ou o proprio `verify`. */
function negativoComando(c) {
  const cmd = c['verify-negativo'] ?? c.verify
  // Falha ALTA (R4): sem comando, o spawn devolveria erro e contaria como "falhou" — a prova
  // negativa passaria de graca.
  if (!cmd) throw new Error('prova negativa sem comando (`verify-negativo:` ou `verify:` vazio)')
  return cmd
}

/** Uma linha por claim: `STATUS  tag  claim`, com o detalhe abaixo quando ha' o que dizer. */
export function format({ claims, falhas, assumed }, log = console.log) {
  for (const c of claims) {
    log(`${(c.status || 'UNKNOWN').padEnd(9)} [${c.tag}] ${c.claim || '(sem claim)'}`)
    if (c.status !== 'VERIFIED') log(`          ${c.detalhe}`)
  }
  const ver = claims.filter((c) => c.status === 'VERIFIED').length
  log(`\nVERIFIED ${ver} · PHANTOM ${claims.filter((c) => c.status === 'PHANTOM').length} · ASSUMED ${assumed}`)
  if (falhas.length) log(`REPROVA: ${falhas.length} claim(s) sem prova (PHANTOM/UNKNOWN/NEGATIVO/ASSUMED).`)
}

// --- CLI -------------------------------------------------------------------
const val = (args, nome) => {
  const i = args.indexOf(nome)
  return i === -1 ? null : args[i + 1]
}
if (!process.env.TARS_AS_MODULE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const caminho = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--cwd')
  try {
    if (!caminho) throw new Error('uso: tars verify <arquivo|-> [--cwd <dir>] [--json]')
    const r = verify({
      caminho: caminho === '-' ? null : caminho,
      texto: caminho === '-' ? readFileSync(0, 'utf8') : undefined,
      cwd: resolve(val(args, '--cwd') ?? process.cwd()),
    })
    if (args.includes('--json')) console.log(JSON.stringify({ ...r, claims: r.claims.map(({ saida, ...c }) => c) }, null, 2))
    else format(r)
    process.exit(r.falhas.length ? 1 : 0)
  } catch (err) {
    console.error(`tars verify: ${err.message}`)
    process.exit(2)
  }
}
