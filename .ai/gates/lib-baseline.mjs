// Aplicador da LINHA DE BASE para os gates (item B3.3).
//
// O gate coleta os achados e, antes de reprovar, pergunta a base: este achado JA' era' divida
// adotada? Se sim (mesma `arquivo:linha` E mesmo hash do trecho), ele fica ISENTO; o exit e'
// decidido so' pelo que e' NOVO. E' o que permite adotar um gate num repo com divida sem virar
// o "tudo vermelho" que ensina todo mundo a usar `--no-verify`.
//
// Mora ao lado dos gates (`.ai/gates/lib-baseline.mjs`) porque o gate roda como programa e nao
// pode depender de `tools/framework/`: no consumidor o catalogo nao esta' no PATH. Import
// RELATIVO (`./lib-baseline.mjs`) — o gate e a lib viajam juntos no `tars sync`.
//
// Fail-closed: base AUSENTE, ILEGIVEL ou com hash que nao casa = o achado REPROVA. Nunca o
// contrario: uma base que isenta o que nao devia e' o verde falso que a doutrina proibe.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BASELINE_FILE = '.ai/gates-baseline.json'

/** O hash do trecho isento. `\r\n` normalizado para o mesmo trecho amarrar a mesma isencao no
 *  Windows e no Linux (a classe do incidente de paridade). */
export function hashTrecho(trecho) {
  return createHash('sha256').update(String(trecho).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)
}

/** A chave canonica de um achado: `arquivo:linha` (a coluna, se houver, sai). Pura. */
export function chaveDe(achado) {
  const s = String(achado).trim()
  const m = /^(.*?):(\d+)(?::\d+)?$/.exec(s)
  return m ? `${m[1]}:${m[2]}` : s
}

/**
 * Separa `achados` em `{ novos, isentos }`. `trechoDe(key)` (opcional) devolve o texto da linha
 * para amarrar o hash; sem ele — ou com hash vazio na base — a isencao vale so' pela chave.
 *
 * `base` e' so' a lista DO GATE (`{ key, hash }[]`), nao o arquivo inteiro: quem le' o arquivo e'
 * `baseDoGate`. Pura.
 */
export function filtrar(achados, base, { trechoDe = null } = {}) {
  const porChave = new Map((base ?? []).map((i) => [i.key, i.hash ?? '']))
  const novos = []
  const isentos = []
  for (const a of achados) {
    const key = chaveDe(a)
    if (!porChave.has(key)) { novos.push(a); continue }
    const esperado = porChave.get(key)
    if (!trechoDe || !esperado) { isentos.push(a); continue }
    if (hashTrecho(trechoDe(key)) === esperado) isentos.push(a)
    else novos.push(a) // o trecho mudou: a isencao cai e o gate cobra de novo
  }
  return { novos, isentos }
}

/** A lista da base para UM gate, do arquivo do PROJETO. Ausente/ilegivel = `[]` (cobra tudo). */
export function baseDoGate(project, gate) {
  const f = join(project, BASELINE_FILE)
  if (!existsSync(f)) return []
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    const lista = j?.gates?.[gate]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

/**
 * Aplica a base e devolve `{ novos, isentos, base }`. `gate` e' o nome no arquivo
 * (`TARS_GATE`); `project` e' `TARS_PROJECT`. Atalho para o cabecalho padrao dos gates.
 */
export function aplicarBase(achados, { project, gate, trechoDe = null } = {}) {
  const base = baseDoGate(project, gate)
  return { ...filtrar(achados, base, { trechoDe }), base }
}
