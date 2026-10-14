// fail-closed — a ausencia de trava REPROVA; nunca um "return ok" silencioso.
// 
// B2.3 (plano de release de 14/10): "Fail-closed: ausencia de trava/gates REPROVA, nunca
// return silencioso". A fonte e um incidente real do kipp (seg-agentmem-2 #7): o codigo
// cobrava a trava quando ela EXISTIA e, quando nao existia, returnava verde — o buraco
// exatamente onde a protecao tinha de valer. "Nada a checar" virou "esta tudo certo".
// 
// Este gate cobre a FORMA do defeito no codigo do projeto: tudo que julga uma trava precisa
// declarar o que faz quando ela NAO esta de pe. Uma saida antecipada que responde com
// APROVACAO sem nomear a AUSENCIA / o NADA / o motivo da isencao e reprovada com
// arquivo:linha — nomear o lugar e o que torna o conserto possivel.
// 
// LINT DE VERDADE, sobre a ARVORE: o arquivo vai ao parser (acorn, o mesmo que o vitest ja
// embarca — R1: nao se instala parser novo) e o julgamento anda sobre IfStatement /
// alternate / consequent, entao comentario, string e regex do proprio codigo nao confundem.
// .ts passa pelo stripTypeScriptTypes antes; o que o parser nao aceitar NAO e julgado — e
// isso e DITO, nunca passa calado.
// 
// Parametros (opcionais, no [gates.params.fail-closed] do .ai/tars.toml):
//   allow = lista de trechos de caminho isentos (ex.: ["tools/framework/tars-ai-"])

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')
const allow = Array.isArray(params.allow) ? params.allow : []

const JS = /[.](mjs|cjs|js|ts)$/i

// --- o parser (acorn embarcado no vitest; R1: ja esta na arvore) -------------
//
// O vitest bundla o acorn em node_modules/vitest/dist/chunks/acorn.*.js, com a unica
// exportacao `p` (o proprio parse). Resolver pelo disco e o unico caminho; se ele nao
// estiver la, o gate NAO julga — e diz que nao julgou (fail-closed: quem le sabe que a
// trava nao correu).
const raizesDoCatalogo = () => {
  const raizes = [path.resolve(project)]
  // O gate mora no CATALOGO, que pode estar num worktree SEM node_modules (o bun install
  // roda no checkout principal). O git-common-dir DO PROPRIO GATE aponta para o .git
  // compartilhado — a raiz do checkout principal e o pai dele.
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const r = spawnSync('git', ['-C', aqui, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' })
  const gitDir = (r.stdout || '').trim()
  if (gitDir) raizes.push(path.dirname(path.resolve(aqui, gitDir)))
  raizes.push(path.dirname(path.dirname(path.dirname(aqui))))
  return raizes
}

let parseAcorn = null
for (const raiz of raizesDoCatalogo()) {
  const glob = spawnSync('sh', ['-c', 'ls ' + JSON.stringify(path.join(raiz, 'node_modules/vitest/dist/chunks')) + '/acorn.*.js 2>/dev/null | head -1'], { encoding: 'utf8' })
  const arquivo = (glob.stdout || '').trim()
  if (!arquivo) continue
  try {
    const mod = await import(pathToFileURL(arquivo).href)
    if (typeof mod.p === 'function') { parseAcorn = mod.p; break }
  } catch { /* segue para a proxima raiz */ }
}

/** O que um no carrega de TEXTO: literal, template, identificador, chave de objeto. */
function textos(node, achados = []) {
  if (!node || typeof node !== 'object') return achados
  if (node.type === 'Literal') achados.push(String(node.value))
  else if (node.type === 'Identifier') achados.push(node.name)
  else if (node.type === 'TemplateLiteral') for (const q of node.quasis) achados.push(q.value?.cooked ?? q.value?.raw ?? '')
  else if (node.type === 'Property' && node.key) {
    // A chave e o VALOR juntos, como no codigo: "ok: true" e a forma que o APROVA procura.
    const chave = node.key.name ?? node.key.value ?? ''
    achados.push(chave + ': ' + textos(node.value).join(' '))
  }
  for (const [chave, valor] of Object.entries(node)) {
    if (chave === 'loc' || chave === 'start' || chave === 'end' || chave === 'range') continue
    if (Array.isArray(valor)) for (const v of valor) textos(v, achados)
    else if (valor && typeof valor === 'object') textos(valor, achados)
  }
  return achados
}

// Saida antecipada que APROVA sem dizer a que veio: { ok: true }, return true ou return 'ok'.
// Mesma familia do "return { ok: true, detalhe: ... }" que a gitHooksCheck tinha antes de
// ganhar o HOOKS MORTOS do B2.3.
const APROVA = /\bok\s*:\s*true\b|\breturn\s+true\b|\breturn\s+['"]ok['"]/

/** Nomes que GRITAM a ausencia (a trava que falta, o "nada a checar", o motivo da isencao). */
const GRITA = /\b(motivo|detail|detalhe|erro|error|reason|falh|alert|aviso|warn|missing|falt|ausent|nada|none|vazio|empty|indefin|skipped|orphan)\b/i

const temGrito = (node) => textos(node).some((t) => GRITA.test(t))

/** O return mais interno abaixo de node — para nao atravessar funcao aninhada. */
function achaReturn(node) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'ReturnStatement') return node
  for (const [chave, valor] of Object.entries(node)) {
    if (chave === 'loc' || chave === 'start' || chave === 'end' || chave === 'range') continue
    if (Array.isArray(valor)) { for (const v of valor) { const a = achaReturn(v); if (a) return a } }
    else if (valor && typeof valor === 'object') { const a = achaReturn(valor); if (a) return a }
  }
  return null
}

/**
 * Julga a saida de um if. Devolve null (nada a cobrar) ou o tipo do achado.
 *
 * O DEFEITO e a saida ANTECIPADA que responde APROVACAO sem nomear a ausencia: e o
 * if (semTrava) return { ok: true } — o do incidente do kipp; a saida do ramo guardado,
 * nao a forma do teste, e o que decide. O que importa e a FORMA do retorno do ramo.
 */
export function julgaIf(no) {
  const alt = no.alternate
  // else if: a propria alternativa e outro ramo; decidir aqui e decidir a arvore inteira.
  if (alt && alt.type === 'IfStatement') return null
  // O ramo VERDADEIRO (o guardado): se ele ja responde aprovacao calada, e o defeito.
  const ret = achaReturn(no.consequent)
  if (ret && APROVA.test(textos(ret.argument).join(' ')) && !temGrito(ret.argument)) return 'aprova-sem-motivo'
  // O ramo FALSO, quando existe e nao e outro if: mesma cobranca.
  if (alt && alt.type !== 'IfStatement') {
    const retAlt = achaReturn(alt)
    if (retAlt && APROVA.test(textos(retAlt.argument).join(' ')) && !temGrito(retAlt.argument)) return 'else-aprova-sem-motivo'
  }
  return null
}

/** Todo IfStatement da arvore (recursivo). */
function todosIfs(node, achados = []) {
  if (!node || typeof node !== 'object') return achados
  if (node.type === 'IfStatement') achados.push(node)
  for (const [chave, valor] of Object.entries(node)) {
    if (chave === 'loc' || chave === 'start' || chave === 'end' || chave === 'range') continue
    if (Array.isArray(valor)) for (const v of valor) todosIfs(v, achados)
    else if (valor && typeof valor === 'object') todosIfs(valor, achados)
  }
  return achados
}

/**
 * Julga UM arquivo: "arquivo:linha — tipo" por saida silenciosa. null = nao julgado (o
 * parser recusou); o chamador decide se grita.
 */
export function julgaArquivo(arquivo, texto) {
  let js = texto
  if (/[.]ts$/i.test(arquivo)) {
    try { js = stripTypeScriptTypes(texto) } catch { return null }
  }
  let ast
  try { ast = parseAcorn(js, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) } catch { return null }
  const achados = []
  for (const no of todosIfs(ast)) {
    const tipo = julgaIf(no)
    if (tipo) achados.push(arquivo + ':' + no.loc.start.line + ' — ' + tipo)
  }
  return achados
}

const mensagem = (achados) => [
  'FAIL-CLOSED: a AUSENCIA de trava virou APROVACAO silenciosa (B2.3).',
  '',
  ...achados.map((a) => '  ' + a),
  '',
  '  O ramo de ausencia tem de nomear o que faltou —',
  '  "return { ok: false, motivo: ... }" ou, se isento, ok: true com o motivo escrito.',
  '  Ver .ai/gates/fail-closed/GATE.md.',
  '',
].join('\n')

// --- CLI (pre-commit) -------------------------------------------------------
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  if (!parseAcorn) {
    console.error('gate fail-closed: parser (acorn do vitest) ausente — NAO julguei o staged. Rode bun install.')
    process.exit(1)
  }
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'], { cwd: project, encoding: 'utf8' })
  if (r.status !== 0 || typeof r.stdout !== 'string') {
    console.error('gate fail-closed: sem git — NAO julguei o staged.')
    process.exit(1)
  }
  const arquivos = r.stdout.split('\0').filter(Boolean).filter((f) => JS.test(f) && !allow.some((x) => f.includes(x)))
  const achados = []
  for (const f of arquivos) {
    let texto
    try { texto = readFileSync(project + '/' + f, 'utf8') } catch { continue } // sumiu do disco: nada a julgar
    const julgado = julgaArquivo(f, texto)
    if (julgado === null) { console.error('gate fail-closed: ' + f + ' — o parser nao aceitou; NAO julguei.'); continue }
    achados.push(...julgado)
  }
  if (achados.length) { console.error('\n' + mensagem(achados)); process.exit(1) }
  process.exit(0)
}
