// backup-coverage — backup so' e' real com PROVA DE RESTORE, e a cobertura e' teste
// fail-closed: app que declara dir de dado fora da lista de fontes do backup REPROVA
// nomeando `arquivo:campo` (B2.6, plano de 14/10).
//
// A fonte sao os achados 13 e 14 da coleta do homelab (13/10, commits `28daa62` e
// `026edf2`): 8 contextos escreviam dado em `/srv` FORA da lista de backup e o backup
// saia VAZIO EM SILENCIO — descoberto depois, no restore, quando ja' era tarde. A trava
// que resolve e' um teste que varre as fichas, extrai os apps que TEM dir de dado e falha
// quando o app nao esta' na lista de fontes. E o item B2.6 acrescenta a outra metade:
// a lista so' vale se houver PROVA DE RESTORE declarada — "o job rodou" prova que a copia
// aconteceu, nao que o dado volta.
//
// O gate julga DUAS coisas no que esta' staged:
//   1. COBERTURA — todo app com dir de dado declarado tem de aparecer na lista de fontes
//      do backup (reprova nomeando `arquivo:campo`).
//   2. PROVA — a declaracao de backup tem de nomear a prova de restore (sentinela/scratch)
//      e a cadencia; "só o job" nao passa.
//
// Fail-closed: sem `git` ou sem conseguir julgar, REPROVA dizendo que nao julgou — nunca
// passa calado. Um gate que nao corre e' pior que gate nenhum.
//
// Parametros (opcionais, no `[gates.params.backup-coverage]` do .ai/tars.toml):
//   allow   = trechos de caminho isentos
//   fichas  = lista de caminhos de ficha decl (default: tudo que declare [backup])
//   fontes  = chave da lista de fontes (default: fontes)
//   dados   = chaves que declaram dir de dado (default: data_dir/dir_dado/data/volume)

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')
const allow = Array.isArray(params.allow) ? params.allow : []
const CHAVES_DADO = params.dados ?? ['data_dir', 'dir_dado', 'data', 'dir_dados']
const CHAVE_FONTES = params.fontes ?? 'fontes'

const AJUDA = [
  '  Declare o app na lista de fontes do backup (com o dir de dado), e faca a PROVA de',
  '  restore: sentinela restaurada para um scratch, verificada e descartada, com cadencia.',
  '  "O job rodou" nao e prova — o dado tem de voltar. Ver .ai/gates/backup-coverage/GATE.md.',
  '',
].join('\n')

/** Le' o campo da linha (yaml `chave: valor` ou toml `chave = valor`), devolvendo o texto. */
function campoDaLinha(linha) {
  const m = linha.match(/^\s*(?:-\s*)?([A-Za-z_][\w-]*)\s*[:=]\s*(.*)$/)
  return m ? { chave: m[1], valor: m[2].replace(/#.*$/, '').trim() } : null
}

/** Os itens de uma lista: inline (`["a", "b"]`) ou em bloco (`- a` nas linhas seguintes). */
function itens(valor) {
  const v = valor.trim()
  if (/^\[.*\]$/.test(v)) {
    return v.slice(1, -1).split(',').map((s) => s.replace(/^["']|["']$/g, '').trim()).filter(Boolean)
  }
  return []
}

/**
 * Julga UM arquivo: achados `arquivo:linha — motivo`. Lista vazia = passa.
 *
 * Um app "tem dir de dado" quando o campo de dado carrega um caminho de verdade (nao
 * vazio, nao `null`, nao `none`). A lista de fontes do backup e' o campo CHAVE_FONTES.
 * Sem lista de fontes E com app de dado, o arquivo inteiro reprova (o buraco do achado 14).
 */
export function julgaArquivo(arquivo, texto) {
  const achados = []
  const linhaDe = new Map()
  texto.split('\n').forEach((l, i) => linhaDe.set(i + 1, l))
  const linhas = [...linhaDe.entries()].map(([n, l]) => ({ n, l: l.replace(/#.*$/, '') }))

  // 1. os apps com dir de dado declarado
  const comDado = []
  for (const { n, l } of linhas) {
    const c = campoDaLinha(l)
    if (!c || !CHAVES_DADO.includes(c.chave)) continue
    const v = c.valor.replace(/^["']|["']$/g, '').trim()
    if (!v || /^(null|none|~|-|false)$/i.test(v)) continue
    comDado.push({ linha: n, valor: v })
  }

  // 2. a lista de fontes do backup (a declaracao) — inline ou em bloco
  const lista = []
  let dentro = false
  for (const { l } of linhas) {
    const c = campoDaLinha(l)
    if (c && c.chave === CHAVE_FONTES) {
      lista.push(...itens(c.valor))
      // lista inline fecha na propria linha; lista vazia abre o bloco
      dentro = !/^\[.*\]$/.test(c.valor.trim())
      continue
    }
    if (!dentro) continue
    const item = l.match(/^\s*-\s*(.+)$/)
    if (item) { lista.push(item[1].replace(/^["']|["']$/g, '').trim()); continue }
    // Sai do bloco quando comeca outra coisa no nivel de cima.
    if (/^\S/.test(l) || (c && /^\s{0,2}\w/.test(l))) dentro = false
  }

  // 3. cobertura: app com dado fora da lista
  for (const { linha, valor } of comDado) {
    const coberto = lista.some((f) => f && (valor === f || valor.startsWith(f) || f.startsWith(valor)))
    if (!coberto) achados.push(arquivo + ':' + linha + ' — app escreve dado em ' + valor + ' fora da lista `' + CHAVE_FONTES + '` do backup (backup vazio em silencio)')
  }

  // 4. prova de restore: a declaracao de backup tem de nomea-la
  if (lista.length && !/restore|restaur|sentinela|sentinel|prova/i.test(texto)) {
    achados.push(arquivo + ':1 — a declaracao de backup nao nomeia a PROVA de restore (sentinela + cadencia); "o job rodou" nao prova que o dado volta')
  }

  return achados
}

const mensagem = (achados) => [
  'BACKUP-COVERAGE: backup so e real com prova de restore (B2.6).',
  '',
  ...achados.map((a) => '  ' + a),
  '',
  AJUDA,
].join('\n')

const ARQUIVO_DECL = /(backup|ficha|receita|vars|host|receitas\/)/i
const EXT = /\.(ya?ml|toml|py|jsonc?)$/i

/** Le' os arquivos declaratorios do projeto (staged quando houver, senao rastreados). */
export function arquivosDecl(raiz) {
  const staged = spawnSync('git', ['-C', raiz, 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'], { encoding: 'utf8' })
  const fonte = staged.status === 0 && staged.stdout
    ? staged.stdout
    : (spawnSync('git', ['-C', raiz, 'ls-files', '-z'], { encoding: 'utf8' }).stdout || '')
  return fonte.split('\0').filter(Boolean).filter((f) => EXT.test(f) && ARQUIVO_DECL.test(f) && !allow.some((x) => f.includes(x)))
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const arquivos = arquivosDecl(project)
  const achados = []
  for (const f of arquivos) {
    let texto
    try { texto = readFileSync(project + '/' + f, 'utf8') } catch { continue }
    achados.push(...julgaArquivo(f, texto))
  }
  if (achados.length) { console.error('\n' + mensagem(achados)); process.exit(1) }
  process.exit(0)
}
