// tars-actor.mjs — QUEM escreveu o commit: 'agent' ou 'human' (dev.8, fatia 2).
//
// PORQUE: a partir do dev.8 o gate pode ser CONDICIONAL ao autor (`when = { actor }` no
// `.ai/tars.toml`): o `Lesson:` obrigatorio em `feat` existe para forcar o AGENTE a
// registrar o que aprendeu — quem escreve a mao ja' pensa antes de commitar, e cobrar o
// mesmo bloco do humano so' ensina a inventar licao. Sem ator, isso vira politica de
// projeto dentro do motor: daqui sai um predicado, nao um `if` espalhado por gate.
//
// O ator e' decidido por marcador POSITIVO — e o silencio e' 'human', o lado que NAO
// afrouxa gate nenhum. Na duvida, cobra: falso-negativo custa uma licao a mais, o
// falso-positivo custa o gate inteiro que passa calado.
//
// Uso:
//   import { actor, avalia } from './tars-actor.mjs'
//   const ctx = { env: process.env, msg }            // msg = a mensagem do commit
//   ctx.actor = actor(ctx)                            // -> 'agent' | 'human'
//   if (!avalia({ actor: 'agent' }, ctx)) ...pula o gate...

/** Nomes que, num trailer `Co-Authored-By:`, denunciam o agente (case-insensitive). */
const MODELO_RE = /\b(claude|gpt|openai|deepseek|gemini|copilot|codex|opencode)\b/i

// TODO(dev.8+): os marcadores de AMBIENTE do opencode e do codex. O repo so' documenta o
// caminho MCP deles (`.agents/skills/agent-coordination/transports/opencode.md`), nao a
// var de env — inventar o nome aqui daria um marcador que nunca casa. Quando aparecer,
// entra AQUI (uma linha), ao lado do CLAUDECODE: e' este o unico lugar que decide ator.

/**
 * O ator do commit. `env` e' o ambiente de quem chama (o motor passa o dele) e `msg` a
 * mensagem — no `commit-msg` o git entrega o arquivo dela em `$1`. 'agent' se QUALQUER
 * marcador bater; sem nenhum, 'human'.
 */
export function actor({ env = {}, msg = '' } = {}) {
  if (env.TARS_ACTOR === 'agent') return 'agent'
  if (env.CLAUDECODE === '1') return 'agent'
  return temTrailerDeAgente(msg) ? 'agent' : 'human'
}

/** Um trailer `Co-Authored-By:` cujo valor nomeia modelo/ferramenta de IA. */
function temTrailerDeAgente(msg) {
  for (const linha of String(msg ?? '').split(/\r?\n/)) {
    const m = linha.match(/^\s*Co-Authored-By:\s*(.+)$/i)
    if (m && MODELO_RE.test(m[1])) return true
  }
  return false
}

/**
 * Os predicados do `when` do manifesto: nome -> `(valor esperado, ctx) => boolean`.
 * `ctx` e' o retrato do evento (`{ env, msg }`, mais o `actor` ja' calculado).
 */
const atorDoCtx = (ctx = {}) => ctx.actor || actor(ctx)

export const PREDICADOS = {
  actor: (valor, ctx) => atorDoCtx(ctx) === valor,
}

/**
 * `avalia(when, ctx)` — sem `when` e' SEMPRE true (comportamento de sempre: o gate roda).
 * Todas as chaves do `when` precisam casar (AND). Predicado desconhecido GRITA em vez de
 * devolver `true`/`false`: um `when` com nome errado pularia o gate para sempre, calado —
 * e' exatamente o "gate que some" que o motor trata como falha (R4).
 */
export function avalia(when, ctx = {}) {
  if (!when) return true
  for (const [nome, valor] of Object.entries(when)) {
    const predicado = PREDICADOS[nome]
    if (!predicado) {
      throw new Error(`predicado de \`when\` desconhecido: '${nome}' (use ${Object.keys(PREDICADOS).join(', ')})`)
    }
    if (!predicado(valor, ctx)) return false
  }
  return true
}

/** `when` legivel para o log: `{ actor: 'agent' }` -> `actor=agent`. */
export const descreveWhen = (when) => Object.entries(when ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')
