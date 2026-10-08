#!/usr/bin/env node
// `tars secrets` — MANIPULACAO SEGURA DE SEGREDOS (S2b): `compare | fingerprint | set | copy |
// move | rm | scan | import` (mais o `exec` REDIGIDO). O `tars-secrets.mjs` continua dono do
// ciclo do cofre (refresh/check/rotate/token) e das primitivas que este modulo REUSA — o
// wrapper unico (`roda`/`spawnOp`), a decifra, o env do cofre, a escrita no item.
//
// O que vale aqui, sem excecao:
//   1. UM parser de endereco (`parseEndereco`) para as quatro origens/destinos.
//   2. Segredo NUNCA passa por argv (ha' `ps`): vem do stdin oculto, de um arquivo 0600 ou de
//      outro endereco — e o `op` so' ve' CAMINHO de arquivo, nunca o valor.
//   3. `compare` e' em TEMPO CONSTANTE e o veredito e' so' `igual`/`diferente` — nem o
//      tamanho, nem um prefixo, nem o valor saem.
//   4. Nada local muda antes de o destino CONFIRMAR (le' de volta e compara em memoria).
//   5. Toda operacao deixa rastro em `<dir>/audit.log` (JSONL 0600): ator, comando, enderecos,
//      nomes, resultado. NUNCA valor — nem fingerprint de segredo.
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { actor } from './tars-actor.mjs'
import { findSecretsIds } from './secrets-patterns.mjs'
import {
  AMBIENTE_ACUSADO,
  ErroConfig,
  comTmp,
  decifraMapa,
  editaItemNoCofre,
  envDoCofre,
  envDoFilho,
  exec,
  partesRef,
  perguntaTty,
  leOculto,
  podeAbrirCofre,
  protegeArquivo,
  registra,
  roda,
  spawnOp,
  validaRef,
} from './tars-secrets.mjs'

// --- ENDERECO: UM parser so' ---------------------------------------------------------
//
// Quatro formas, e o TIPO decidido por ele e' o que o resto do modulo consulta — nenhum call
// site volta a olhar o prefixo da string (R3). `op://` exige o CAMPO (sem ele nao ha' o que
// ler nem onde gravar); o resto do formato ja' vem conferido por `partesRef`.
export const TIPOS = ['cofre', 'file', 'env', 'cache']

/** Endereco invalido NUNCA e' ecoado: o argumento pode ser o segredo no lugar errado. */
export function parseEndereco(bruto) {
  const s = String(bruto ?? '')
  if (s.startsWith('op://')) {
    const { item, campo } = partesRef(s)
    return { tipo: 'cofre', bruto: s, ref: s, item, campo }
  }
  if (s.startsWith('file:')) {
    const caminho = s.slice('file:'.length)
    if (!caminho) throw new ErroConfig('[secrets] endereco `file:` sem caminho')
    return { tipo: 'file', bruto: s, caminho: path.resolve(caminho) }
  }
  if (s.startsWith('env:')) {
    const nome = s.slice('env:'.length)
    if (!NOME.ok.test(nome)) throw new ErroConfig('[secrets] endereco `env:` com nome invalido (valor deliberadamente NAO ecoado)')
    return { tipo: 'env', bruto: s, nome }
  }
  if (s.startsWith('cache:')) {
    const nome = s.slice('cache:'.length)
    if (!NOME.ok.test(nome)) throw new ErroConfig('[secrets] endereco `cache:` com nome invalido (valor deliberadamente NAO ecoado)')
    return { tipo: 'cache', bruto: s, nome }
  }
  throw new ErroConfig(
    '[secrets] endereco invalido (use `op://cofre/item/campo`, `file:<caminho>`, `env:<NOME>` ou `cache:<NOME>`; valor deliberadamente NAO ecoado)',
  )
}

const NOME = { ok: /^[A-Za-z_][A-Za-z0-9_]*$/ }

/** O ITEM do cofre (`op://cofre/item`) — sem campo. Ref malformada nao e' ecoada. */
export function validaItem(ref) {
  const m = /^op:\/\/([^/]+)\/([^/]+)$/.exec(validaRef(ref))
  if (!m) throw new ErroConfig('[secrets] o item e\' `op://cofre/item` (sem campo atras; o campo e\' o NOME de cada linha)')
  return `op://${m[1]}/${m[2]}`
}

/**
 * O rotulo do endereco para mensagem e auditoria: o ENDERECO, nunca o valor. O cofre sem campo
 * (o endereco de ITEM que o `rm` aceita) sai sem a barra final — `op://v/i/null` mentiria.
 */
export const rotula = (end) =>
  end.tipo === 'cofre'
    ? end.campo
      ? `${end.item}/${end.campo}`
      : end.item
    : end.tipo === 'file'
      ? end.caminho
      : `${end.tipo}:${end.nome}`

// --- LEITURA DE ARQUIVO: 0600/0400, ou a ACL do win32 ---------------------------------
//
// Um arquivo de segredo legivel pelo grupo inteiro nao e' um arquivo de segredo. No Windows
// `chmod` nao protege nada, entao o que manda e' a ACL — e so' a CONCESSAO do dono conta: uma
// entrada HERDADA (`(I)`) nao e' escolha dele e recusa-la tornaria o comando inutil em
// qualquer pasta normal do perfil.
export function exigeRestrito(caminho, { fs: fsm = fs } = {}) {
  if (process.platform !== 'win32') {
    const modo = fsm.statSync(caminho).mode & 0o777
    if (modo !== 0o600 && modo !== 0o400) {
      throw new ErroConfig(`[secrets] ler ${caminho} exige modo 0600/0400 (esta' ${modo.toString(8)}): restrinja antes`)
    }
    return
  }
  const r = spawnSync('icacls', [caminho], { encoding: 'utf8' })
  if (r.status !== 0) throw new ErroConfig(`[secrets] nao consegui ler a ACL de ${caminho}`)
  const eu = os.userInfo().username.toLowerCase()
  // O caminho do arquivo ABRE a saida e vem colado no PRIMEIRO ace (`<caminho> USER:(F)`):
  // tirar a linha inteira jogaria fora justamente a concessao do dono. O caminho sai antes.
  for (const linha of (r.stdout || '').split(caminho).join('').split(/\r?\n/)) {
    const l = linha.trim()
    if (!l || !l.includes(':')) continue
    const principal = l.split(':')[0].trim().split('\\').pop().toLowerCase()
    if (!principal || principal === eu || l.includes('(I)')) continue
    throw new ErroConfig(`[secrets] ler ${caminho} exige ACL so' do usuario — '${principal}' tambem tem acesso`)
  }
}

/** Le um arquivo de segredo (0600/0400) e devolve o texto. */
export function leArquivoRestrito(caminho, { fs: fsm = fs } = {}) {
  if (!fsm.existsSync(caminho)) throw new ErroConfig(`[secrets] arquivo ausente: ${caminho}`)
  exigeRestrito(caminho, { fs: fsm })
  return fsm.readFileSync(caminho, 'utf8')
}

/** Escrita ATOMICA 0600: o arquivo de destino nunca existe meio-escrito. */
export function gravaArquivoRestrito(caminho, conteudo) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true, mode: 0o700 })
  const tmp = `${caminho}.novo`
  fs.writeFileSync(tmp, conteudo, { mode: 0o600 })
  protegeArquivo(tmp)
  fs.renameSync(tmp, caminho)
}

/** O `op read --out-file` — NUNCA stdout (o valor em pipe vaza no log de quem chamou). */
function leCofre(cfg, ref, env) {
  return comTmp('valor', '', (f) => {
    const r = spawnOp(['read', '--out-file', f, ref], envDoCofre(cfg, env))
    if (r.status !== 0) {
      throw new ErroConfig(`[secrets] o 1Password nao entregou ${ref}: ${(r.stderr || r.error?.message || '').trim()}`)
    }
    // O `op read` acrescenta UM \n ao valor do campo; sem tira-lo, um `set` seguido de leitura
    // compararia um valor com o proprio + \n e o cofre seria acusado de ter gravado errado.
    return fs.readFileSync(f, 'utf8').replace(/\r?\n$/, '')
  })
}

/** O MAPA do cache, decifrado UMA vez por invocacao (so' quando algum endereco pede). */
const cacheDe = (cfg, memo) => (memo.v ??= decifraMapa(cfg))

function leEndereco(end, cfg, ctx) {
  if (end.tipo === 'cofre') return leCofre(cfg, end.ref, ctx.env)
  if (end.tipo === 'file') return leArquivoRestrito(end.caminho)
  if (end.tipo === 'env') {
    const v = ctx.env[end.nome]
    if (v === undefined) throw new ErroConfig(`[secrets] \`env:${end.nome}\` nao esta' no ambiente`)
    return v
  }
  const mapa = cacheDe(cfg, ctx)
  if (mapa[end.nome] === undefined) throw new ErroConfig(`[secrets] \`cache:${end.nome}\` nao esta' no cache — rode \`tars secrets refresh\``)
  return mapa[end.nome]
}

// --- ESCRITA --------------------------------------------------------------------------
//
// Duas regras de destino, e as duas GRAVAM: `env:` e `cache:` como DESTINO sao recusados com
// a saida certa na mensagem. Um valor empurrado para o ambiente persistente (rc/profile/HKCU/
// runtime.env) vira uma segunda fonte de verdade que ninguem revoga — o cofre deixa de ser o
// unico caminho. E o cache e' DERIVADO: escreve-lo a mao o deixaria fora de sincronia com o
// cofre ate' o proximo refresh.
function gravaEndereco(end, valor, cfg, ctx) {
  if (end.tipo === 'cofre') return editaItemNoCofre(cfg, end.ref, valor, ctx.env)
  if (end.tipo === 'file') return gravaArquivoRestrito(end.caminho, valor)
  if (end.tipo === 'cache') {
    throw new ErroConfig(`[secrets] \`cache:${end.nome}\` e' DERIVADO e so' serve de ORIGEM — grave no cofre e rode \`tars secrets refresh\``)
  }
  throw new ErroConfig(
    `[secrets] destino \`env:${end.nome}\` PROIBIDO em copy/move/set: ambiente persistente (rc/profile/HKCU/runtime.env) e' segunda fonte de verdade — grave no cofre ou num \`file:\``,
  )
}

// --- COMPARE --------------------------------------------------------------------------
/**
 * Comparacao em TEMPO CONSTANTE. O comprimento NAO e' consultado antes: os dois lados sao
 * preenchidos ate' o MAIOR deles e o `timingSafeEqual` roda sobre o par — um `a.length !== b.length`
 * no topo devolveria na hora e o tempo de resposta diria o tamanho do segredo alheio. O
 * comprimento ainda entra no veredito (senao `ab` e `ab\0` seriam iguais), mas DEPOIS do
 * compare, como um bit a mais.
 */
export function comparaValores(a, b) {
  const A = Buffer.from(String(a), 'utf8')
  const B = Buffer.from(String(b), 'utf8')
  const n = Math.max(A.length, B.length)
  const pa = Buffer.alloc(n)
  const pb = Buffer.alloc(n)
  A.copy(pa)
  B.copy(pb)
  return crypto.timingSafeEqual(pa, pb) && A.length === B.length
}

/** `compare` — imprime SO' `igual`/`diferente`; exit 0/1. */
export function cmdCompare(rest, ctx) {
  const [a, b] = rest
  if (!a || !b) throw new ErroConfig('uso: tars secrets compare <endereco> <endereco>')
  const endA = parseEndereco(a)
  const endB = parseEndereco(b)
  const igual = comparaValores(leEndereco(endA, ctx.cfg, ctx), leEndereco(endB, ctx.cfg, ctx))
  audit(ctx, { comando: 'compare', enderecos: [rotula(endA), rotula(endB)], resultado: igual ? 'igual' : 'diferente' })
  return { saida: igual ? 'igual' : 'diferente', status: igual ? 0 : 1 }
}

// --- FINGERPRINT ----------------------------------------------------------------------
/**
 * `fingerprint` — SO' a identidade PUBLICA de uma chave: o recipient age (`age-keygen -y`) ou
 * a impressao da publica derivada de uma chave SSH. Qualquer outra coisa RECUSA: nao existe
 * "impressao" de uma senha, e inventar uma (um hash, um tamanho) seria publicar um oraculo de
 * conferencia do segredo — para isso existe o `compare`.
 */
export function fingerprintDe(valor) {
  const s = String(valor)
  if (/AGE-SECRET-KEY-1/.test(s)) {
    return comTmp('age.key', `${s.trim()}\n`, (f) => ({ tipo: 'age', identidade: roda('age-keygen', ['-y', f]).stdout.trim() }))
  }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)) {
    return comTmp('id.key', `${s.trim()}\n`, (f) => {
      const pub = roda('ssh-keygen', ['-y', '-f', f])
      if (pub.status !== 0 || !pub.stdout.trim()) {
        throw new ErroConfig(`[secrets] nao consegui derivar a publica da chave SSH: ${(pub.stderr || '').trim()}`)
      }
      const lf = spawnSync('ssh-keygen', ['-lf', '-'], { input: pub.stdout, encoding: 'utf8' })
      if (lf.status !== 0 || !lf.stdout.trim()) throw new ErroConfig('[secrets] `ssh-keygen -lf` nao devolveu a impressao')
      return { tipo: 'ssh', identidade: lf.stdout.trim() }
    })
  }
  throw new ErroConfig('[secrets] sem identidade publica; use compare')
}

/** `fingerprint <endereco>` — origem cofre passa por `op read --out-file` (tmp 0600), nunca stdout. */
export function cmdFingerprint(rest, ctx) {
  const [a] = rest
  if (!a) throw new ErroConfig('uso: tars secrets fingerprint <endereco>')
  const end = parseEndereco(a)
  const fp = fingerprintDe(leEndereco(end, ctx.cfg, ctx))
  audit(ctx, { comando: 'fingerprint', enderecos: [rotula(end)], resultado: fp.tipo })
  return { saida: fp.identidade, status: 0 }
}

// --- SET / COPY / MOVE ----------------------------------------------------------------
/** `set` — grava no COFRE. Do DONO (TTY): e' mao humana escrevendo, nao automacao. */
export function cmdSet(rest, ctx) {
  const pos = rest.filter((a) => !a.startsWith('--'))
  const ref = pos[0]
  if (!ref) throw new ErroConfig('uso: tars secrets set <op://cofre/item/campo> [--from-file <arq 600>] [--from <endereco>]')
  const end = parseEndereco(ref)
  if (end.tipo !== 'cofre') throw new ErroConfig('[secrets] `set` grava no COFRE: o endereco tem de ser `op://cofre/item/campo`')
  exigeDono(ctx.cfg, ctx)
  const arq = valorDe(rest, '--from-file')
  const de = valorDe(rest, '--from')
  if (arq && de) throw new ErroConfig('[secrets] use UM caminho de valor: `--from-file` ou `--from`')
  let valor
  if (arq) valor = leArquivoRestrito(path.resolve(arq))
  else if (de) valor = leEndereco(parseEndereco(de), ctx.cfg, ctx)
  else valor = ctx.le('tars secrets set: cole o VALOR (nao aparece no terminal): ')
  if (!valor) throw new ErroConfig('[secrets] valor VAZIO — nada foi gravado')
  registraEmMemoria(valor)
  gravaEndereco(end, valor, ctx.cfg, ctx)
  // A releitura e' o unico jeito de saber que o cofre guardou o que se mandou — o `op` aceitar
  // o template nao prova o valor. Falha aqui NAO desfaz (nao ha' transacao entre nos e ele).
  const volta = leCofre(ctx.cfg, end.ref, ctx.env)
  if (!comparaValores(volta, valor)) {
    throw new ErroConfig(`[secrets] o cofre nao devolveu o valor gravado em ${end.item} (campo ${end.campo}) — confira o item`)
  }
  audit(ctx, { comando: 'set', enderecos: [rotula(end)], resultado: 'ok' })
  return { saida: `tars secrets set: ${end.item}/${end.campo} atualizado`, status: 0 }
}

/**
 * `copy` — le' `a`, grava `b` e CONFIRMA com `compare` lendo `b` de volta. `move` e' o mesmo
 * com o `rm` da origem DEPOIS da confirmacao: compare falho preserva a origem (nunca apaga o
 * unico lugar onde o valor existe).
 */
export function cmdCopy(rest, ctx) {
  const [a, b] = rest.filter((x) => !x.startsWith('--'))
  if (!a || !b) throw new ErroConfig('uso: tars secrets copy <origem> <destino>')
  return copia(a, b, ctx, 'copy')
}

export function cmdMove(rest, ctx) {
  const [a, b] = rest.filter((x) => !x.startsWith('--'))
  if (!a || !b) throw new ErroConfig('uso: tars secrets move <origem> <destino>')
  const r = copia(a, b, ctx, 'move')
  const end = parseEndereco(a)
  apaga(end, ctx, { confirmado: true })
  audit(ctx, { comando: 'move', enderecos: [rotula(end), rotula(parseEndereco(b))], resultado: 'ok' })
  return r
}

function copia(a, b, ctx, comando) {
  const o = parseEndereco(a)
  const d = parseEndereco(b)
  if (o.tipo === 'cofre' && d.tipo === 'cofre' && o.bruto === d.bruto) {
    throw new ErroConfig(`[secrets] ${comando} com a MESMA origem e destino (${rotula(o)})`)
  }
  const valor = leEndereco(o, ctx.cfg, ctx)
  registraEmMemoria(valor)
  gravaEndereco(d, valor, ctx.cfg, ctx)
  const volta = leEndereco(d, ctx.cfg, ctx)
  if (!comparaValores(volta, valor)) {
    throw new ErroConfig(`[secrets] o destino ${rotula(d)} nao confirma o que foi gravado — a origem NAO foi tocada`)
  }
  audit(ctx, { comando, enderecos: [rotula(o), rotula(d)], resultado: 'ok' })
  return { saida: `tars secrets ${comando}: ${rotula(o)} -> ${rotula(d)} (confirmado)`, status: 0 }
}

// --- RM -------------------------------------------------------------------------------
/** `rm <endereco>` — [s/N] mostrando SO' o endereco; nunca o valor. */
export function cmdRm(rest, ctx) {
  const bruto = rest.filter((x) => !x.startsWith('--'))[0]
  // `rm` no cofre e' por ITEM: `op item delete --archive` arquiva o item INTEIRO, entao um
  // endereco COM campo prometeria apagar so' o campo e arquivaria o item todo. O parser das
  // quatro formas exige o campo (as demais operacoes sao POR CAMPO); aqui o ITEM e' lido por
  // `enderecoDoItem`, que reusa `validaItem` — o mesmo validador do `import` (R3). Todo o resto
  // (`file:`, `env:`, `cache:`) segue o parser normal.
  return apaga(String(bruto ?? '').startsWith('op://') ? enderecoDoItem(bruto) : parseEndereco(bruto), ctx, {})
}

/**
 * O endereco de ITEM (`op://cofre/item`) — a unica forma de cofre que o `rm` aceita. Com campo
 * atras, RECUSA: arquivar o item inteiro por causa de um campo e' mais do que se pediu, e a
 * mensagem diz o endereco certo. O valor nunca e' ecoado.
 */
export function enderecoDoItem(bruto) {
  const s = String(bruto ?? '')
  const m = /^op:\/\/([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(s)
  if (!m) throw new ErroConfig('[secrets] endereco `op://` invalido (use `op://cofre/item`; valor deliberadamente NAO ecoado)')
  if (m[3]) throw new ErroConfig('[secrets] rm do cofre arquiva o item INTEIRO; use `op://cofre/item` (sem o campo)')
  const item = validaItem(s)
  return { tipo: 'cofre', bruto: s, ref: item, item, campo: null }
}

function apaga(end, ctx, { confirmado }) {
  const onde = ctx.em
  if (end.tipo === 'cache') {
    throw new ErroConfig(`[secrets] \`cache:${end.nome}\` e' DERIVADO — rode \`tars secrets refresh\` (ou apague o cache) para ele sumir`)
  }
  if (end.tipo === 'cofre') {
    if (!confirmado && !ctx.confirma(`tars secrets rm: ARQUIVAR o item ${end.item} no 1Password?\n`)) return cancelado('rm')
    const r = spawnOp(['item', 'delete', '--archive', end.item], envDoCofre(ctx.cfg, ctx.env))
    if (r.status !== 0) {
      throw new ErroConfig(`[secrets] o 1Password nao arquivou ${end.item}: ${(r.stderr || r.error?.message || '').trim()}`)
    }
    audit(ctx, { comando: 'rm', enderecos: [rotula(end)], resultado: 'arquivado' })
    return { saida: `tars secrets rm: ${end.item} ARQUIVADO no 1Password (nada foi apagado de vez)`, status: 0 }
  }
  if (end.tipo === 'file') {
    if (!confirmado && !ctx.confirma(`tars secrets rm: apagar o arquivo ${end.caminho}?\n`)) return cancelado('rm')
    fs.rmSync(end.caminho, { force: true })
    audit(ctx, { comando: 'rm', enderecos: [rotula(end)], resultado: 'apagado' })
    return { saida: `tars secrets rm: ${end.caminho} apagado`, status: 0 }
  }
  // `env:` — o processo nao se limpa daqui (nao da' para mutar o ambiente do pai); o que se
  // remove e' a LINHA persistente. Sem arquivo indicado, o registro do Windows e' o alvo do
  // win32; fora dele nao ha' onde remover, e o erro diz qual caminho informar.
  if (onde) return removeLinhaDeEnv(onde, end.nome, ctx, { confirmado })
  if (process.platform === 'win32') {
    if (!confirmado && !ctx.confirma(`tars secrets rm: remover ${end.nome} de HKCU\\Environment?\n`)) return cancelado('rm')
    const r = spawnSync('reg', ['delete', 'HKCU\\Environment', '/v', end.nome, '/f'], { encoding: 'utf8' })
    if (r.status !== 0) throw new ErroConfig(`[secrets] nao consegui remover ${end.nome} de HKCU\\Environment`)
    audit(ctx, { comando: 'rm', nomes: [end.nome], resultado: 'registro' })
    return { saida: `tars secrets rm: ${end.nome} removido de HKCU\\Environment`, status: 0 }
  }
  throw new ErroConfig(`[secrets] remover \`env:${end.nome}\` exige \`--em <arquivo>\` (rc/profile): nao ha' ambiente persistente padrao aqui`)
}

const cancelado = (comando) => ({ saida: `tars secrets ${comando}: cancelado (nada foi tocado)`, status: 0 })

/**
 * Remove a LINHA de atribuicao do rc/profile. A escrita e' ATOMICA (tmp no MESMO diretorio +
 * rename): o arquivo do dono vale ate' o rename, sem janela em que esteja pela metade — e sem
 * a copia `.tars-bak` que so' existia para cobrir essa janela. O MODO do original e' o do tmp:
 * um rc 0644 reescrito 0600 seria uma mudanca de permissao que ninguem pediu.
 */
export function removeLinhaDeEnv(arquivo, nome, ctx, { confirmado } = {}) {
  // O nome vai INTERPOLADO na RegExp logo abaixo: sem esta conferencia, um `.*` casaria a
  // primeira linha do arquivo e o `rm` apagaria o que ninguem pediu. `NOME` e' o MESMO
  // validador do `parseEndereco` (R3) — e o valor e' deliberadamente NAO ecoado.
  if (!NOME.ok.test(nome)) throw new ErroConfig('[secrets] nome invalido para `rm env:` (valor deliberadamente NAO ecoado)')
  const caminho = path.resolve(arquivo)
  if (!fs.existsSync(caminho)) throw new ErroConfig(`[secrets] arquivo ausente: ${caminho}`)
  const txt = fs.readFileSync(caminho, 'utf8')
  // O separador e' DETECTADO e preservado: reescrever um perfil CRLF em LF mexeria no arquivo
  // inteiro (diff sujo) por causa de uma linha removida.
  const crlf = txt.includes('\r\n')
  const linhas = txt.split(/\r?\n/)
  const re = new RegExp(`^\\s*(?:export\\s+)?${nome}\\s*=`)
  const alvo = linhas.findIndex((l) => re.test(l))
  if (alvo === -1) throw new ErroConfig(`[secrets] '${nome}' nao esta' declarado em ${caminho}`)
  if (!confirmado && !ctx.confirma(`tars secrets rm: remover ${nome} de ${caminho}:${alvo + 1}?\n`)) return cancelado('rm')
  const tmp = `${caminho}.tars-rm`
  fs.rmSync(tmp, { force: true }) // sobra de um rm morto no meio nao dita o modo do proximo
  fs.writeFileSync(tmp, linhas.filter((_, i) => i !== alvo).join(crlf ? '\r\n' : '\n'), { mode: fs.statSync(caminho).mode & 0o777 })
  fs.renameSync(tmp, caminho)
  audit(ctx, { comando: 'rm', nomes: [nome], resultado: `linha ${alvo + 1} em ${caminho}` })
  return { saida: `tars secrets rm: ${nome} removido de ${caminho}:${alvo + 1}`, status: 0 }
}

// --- IMPORTS --------------------------------------------------------------------------
/** O `.env`: `NOME=VALOR` por linha; comentario e linha vazia fora. */
export function leEnv(txt) {
  const pares = []
  for (const linha of String(txt).split(/\r?\n/)) {
    const l = linha.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i <= 0) continue
    const nome = l.slice(0, i).trim()
    const valor = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!NOME.ok.test(nome)) continue
    pares.push([nome, valor])
  }
  return pares
}

/**
 * `import <arquivo .env>` — do DONO. Cada `NOME=VALOR` vira um CAMPO do item, conferido com
 * `compare` um a um. Duas exclusoes, e as duas por um motivo: comentario nao e' dado, e valor
 * que e' PLACEHOLDER (`op://...`, `{{ ... }}`) nao e' segredo — gravar `op://x/y/z` como valor
 * do campo tornaria o cofre um eco do template. A origem nao e' tocada.
 */
export function cmdImport(rest, ctx) {
  const arq = rest.filter((a) => !a.startsWith('--'))[0]
  const item = valorDe(rest, '--item')
  if (!arq || !item) throw new ErroConfig('uso: tars secrets import <arquivo .env> --item <op://cofre/item>')
  // O ITEM, nao um endereco: sem campo atras (o campo e' o NOME de cada linha do `.env`, e o
  // `parseEndereco` exige um — por isso aqui a conferencia e' a do formato de item).
  const endItem = { tipo: 'cofre', item: validaItem(item) }
  exigeDono(ctx.cfg, ctx)
  const pares = leEnv(leArquivoRestrito(path.resolve(arq))).filter(([, v]) => !/^op:\/\/|\{\{/.test(v))
  if (!pares.length) throw new ErroConfig(`[secrets] nenhum \`NOME=VALOR\` aproveitavel em ${arq}`)
  const nomes = pares.map(([n]) => n)
  if (!ctx.confirma(`tars secrets import: gravar ${pares.length} campo(s) em ${endItem.item}: ${nomes.join(' ')}\n`)) {
    return cancelado('import')
  }
  for (const [nome, valor] of pares) {
    registraEmMemoria(valor)
    const ref = `${endItem.item}/${nome}`
    editaItemNoCofre(ctx.cfg, ref, valor, ctx.env, { criar: true })
    if (!comparaValores(leCofre(ctx.cfg, ref, ctx.env), valor)) {
      throw new ErroConfig(`[secrets] o cofre nao devolveu o valor gravado em ${endItem.item} (campo ${nome})`)
    }
  }
  audit(ctx, { comando: 'import', enderecos: [endItem.item], nomes, resultado: 'ok' })
  return { saida: pares.map(([n]) => `${n}=${endItem.item}/${n}`).join('\n'), status: 0 }
}

// --- SCAN -----------------------------------------------------------------------------
/**
 * `scan` — procura segredo onde ele NAO deveria estar. Reporta SO' `arquivo:linha` (ou
 * `local`) + o NOME/ID do padrao: o trecho achado NUNCA aparece, nem truncado — uma linha de
 * transcript e' exatamente o lugar onde o valor esta', e cita-la seria o vazamento que o
 * comando existe para achar. Exit != 0 quando acha.
 *
 * A deteccao tem duas fontes (R3): os padroes de `secrets-patterns.mjs` (a MESMA lista do
 * pre-commit) e os VALORES do cache, decifrados UMA vez e comparados em memoria.
 */
export const ONDES = ['ambiente', 'rc', 'winreg', 'historico', 'transcripts', 'git', 'templates']

export function acusa(linha, valores) {
  const ids = findSecretsIds(linha) // o ID (estavel, para maquina) — nao o rotulo humano
  for (const [nome, v] of valores) if (linha.includes(v)) ids.push(`cache:${nome}`)
  return [...new Set(ids)]
}

/** Le um arquivo linha a linha em STREAMING: um `.jsonl` de transcript passa de 100MB. */
async function varreArquivo(arquivo, fn) {
  const rl = createInterface({ input: fs.createReadStream(arquivo, { encoding: 'utf8' }), crlfDelay: Infinity })
  let n = 0
  try {
    for await (const linha of rl) {
      n++
      fn(linha, n)
    }
  } catch {
    return n // arquivo ilegivel no meio (permissao, arquivo sumindo): o que ja' passou vale
  }
  return n
}

/** Os `*.jsonl` de sessao de IA sob `dir` (recursivo), sem seguir link simbolico. */
function jsonlsDe(dir, saida = []) {
  let nomes
  try {
    nomes = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return saida
  }
  for (const e of nomes) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) jsonlsDe(p, saida)
    else if (e.isFile() && e.name.endsWith('.jsonl')) saida.push(p)
  }
  return saida
}

/** `op://` fora do valor inteiro de `KEY=`, e `{{ }}` em linha `*_REF`/`*_FILE`. */
const REF_INTEIRA = /^\s*[A-Z_][A-Z0-9_]*\s*=\s*"?op:\/\/[^"\r\n]+"?\s*$/
const TEMPLATE_REF = /^\s*[A-Z_][A-Z0-9_]*_(REF|FILE)\s*=/

export async function cmdScan(rest, ctx) {
  const alvos = valoresDe(rest, '--onde')
  const quer = (n) => alvos.length === 0 || alvos.includes(n)
  const achados = []
  const marca = (local, id) => achados.push({ local, id })
  // Um passo do scan que NAO rodou (gitleaks ausente/relatorio ilegivel) nao pode virar
  // silencio: vira aviso na saida — e, com `--onde git` explicito, reprova o comando.
  const avisos = []
  const avisa = (motivo) => avisos.push(motivo)

  let mapa = {}
  if (fs.existsSync(ctx.cfg.cache_file)) {
    try {
      mapa = decifraMapa(ctx.cfg)
    } catch {
      mapa = {} // cache ilegivel nao pode cegar o scan: os padroes seguem valendo
    }
  }
  const valores = Object.entries(mapa)
    .map(([k, v]) => [k, String(v)])
    .filter(([, v]) => v.length >= 8)

  if (quer('ambiente')) {
    const nomes = [...new Set([...AMBIENTE_ACUSADO, ...nomesDoTemplate(ctx.cfg)])]
    for (const n of nomes) if (ctx.env[n]) marca('local', n)
  }

  if (quer('rc')) {
    const casa = ctx.home
    const perfis = ['.bashrc', '.profile', '.zshrc'].map((f) => path.join(casa, f))
    const ps = process.platform === 'win32' ? path.join(ctx.env.APPDATA || '', 'Microsoft', 'Windows', 'PowerShell', 'Microsoft.PowerShell_profile.ps1') : null
    for (const f of [...perfis, ps].filter(Boolean)) {
      if (!fs.existsSync(f)) continue
      await varreArquivo(f, (l, n) => acusaLinha(f, n, l, valores, marca))
    }
  }

  if (quer('winreg') && process.platform === 'win32') {
    const r = spawnSync('reg', ['query', 'HKCU\\Environment'], { encoding: 'utf8' })
    if (r.status === 0) {
      for (const l of (r.stdout || '').split(/\r?\n/)) {
        // `reg query` devolve `    NOME    REG_SZ    valor` — a LINHA inteira e' o alvo (o
        // valor esta' nela), mas o que sai e' so' o NOME a esquerda.
        if (acusaLinha('', 0, l, valores, () => {}).length) marca('local', l.trim().split(/\s{2,}/)[0])
      }
    }
  }

  if (quer('historico')) {
    const hist = [path.join(ctx.home, '.bash_history'), path.join(ctx.home, '.zsh_history')]
    if (process.platform === 'win32') {
      hist.push(path.join(ctx.env.APPDATA || '', 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt'))
    }
    for (const f of hist) {
      if (!fs.existsSync(f)) continue
      await varreArquivo(f, (l, n) => acusaLinha(f, n, l, valores, marca))
    }
  }

  if (quer('transcripts')) {
    const raizes = [path.join(ctx.home, '.claude', 'projects'), path.join(ctx.home, '.local', 'share', 'opencode')]
    for (const raiz of raizes) {
      for (const f of jsonlsDe(raiz)) {
        await varreArquivo(f, (l, n) => acusaLinha(f, n, l, valores, marca))
      }
    }
  }

  if (quer('git')) {
    // `gitleaks git` (nao reimplementado) com `--redact`: o JSON do relatorio e' o unico lugar
    // onde o achado aparece com o valor, e o `--redact` troca o valor por `REDACTED` ja' na
    // saida do proprio gitleaks — sem isso o relatorio seria uma copia do segredo em claro no
    // disco. Ele nasce no MESMO tmp 0700 com `TMP_PREFIX` do refresh (`comTmp`), entao um scan
    // morto no meio cai no `reapResiduo` como qualquer outro residuo de texto claro.
    comTmp('gitleaks.json', '', (rel) => {
      const r = roda('gitleaks', ['git', '--no-banner', '--redact', '--report-format', 'json', '--report-path', rel], { cwd: ctx.cwd, env: ctx.env })
      if (r.error?.code === 'ENOENT') return avisa('git: PULADO (gitleaks ausente)')
      // Vazio = o gitleaks nao chegou a gerar o relatorio (cwd sem repo, erro de execucao).
      if (!fs.existsSync(rel) || !fs.statSync(rel).size) return avisa('git: PULADO (relatorio ilegivel)')
      let achadosGitleaks
      try {
        achadosGitleaks = JSON.parse(fs.readFileSync(rel, 'utf8'))
      } catch {
        // Nunca `catch {}` mudo: um relatorio que nao le' e' um passo que NAO rodou (R4).
        return avisa('git: PULADO (relatorio ilegivel)')
      }
      for (const f of achadosGitleaks || []) marca(`${f.File}:${f.StartLine}`, f.RuleID)
    })
  }

  if (quer('templates')) {
    const tpls = [ctx.cfg.template, ...globTpl(ctx.cwd)].filter((f, i, a) => f && fs.existsSync(f) && a.indexOf(f) === i)
    for (const f of tpls) {
      await varreArquivo(f, (l, n) => {
        if (l.includes('op://') && !REF_INTEIRA.test(l)) marca(`${f}:${n}`, 'op:// fora de `KEY=`')
        else if (/\{\{/.test(l) && TEMPLATE_REF.test(l)) marca(`${f}:${n}`, '`{{ }}` em `*_REF`/`*_FILE`')
      })
    }
  }

  audit(ctx, { comando: 'scan', resultado: achados.length ? `${achados.length} achado(s)` : avisos.length ? `${avisos.length} aviso(s)` : 'limpo' })
  const linhas = []
  if (achados.length) {
    linhas.push(`tars secrets scan: ${achados.length} achado(s) (o valor NAO e' exibido)`)
    linhas.push(...achados.map((a) => `  ${a.local}  ${a.id}`))
  } else {
    linhas.push(avisos.length ? `tars secrets scan: limpo (com ${avisos.length} aviso(s))` : 'tars secrets scan: limpo')
  }
  linhas.push(...avisos.map((a) => `  ${a}`))
  return { saida: linhas.join('\n'), status: achados.length || (avisos.length && alvos.includes('git')) ? 1 : 0 }
}

/** Marca UM achado numa linha de arquivo — e a unica forma de citar arquivo:linha. */
function acusaLinha(arquivo, n, linha, valores, marca) {
  const ids = acusa(linha, valores)
  if (ids.length) marca(`${arquivo}:${n}`, ids.join(','))
  return ids
}

/** Os NOMES declarados no template (`KEY=...`): os que o `check` acusa no ambiente. */
function nomesDoTemplate(cfg) {
  try {
    return fs
      .readFileSync(cfg.template, 'utf8')
      .split(/\r?\n/)
      .map((l) => /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(l)?.[1])
      .filter(Boolean)
  } catch {
    return []
  }
}

function globTpl(dir) {
  try {
    return fs.globSync('**/*.tpl', { cwd: dir }).map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

// --- EXEC COM REDACAO -----------------------------------------------------------------
/**
 * O REDATOR: um buffer ROLANTE do tamanho do MAIOR valor conhecido. Sem ele, um valor partido
 * entre dois `data` do pipe passaria inteiro — cada metade, sozinha, nao casa com nada. A
 * regra e' nunca emitir um valor COMPLETO: o que sai e' o trecho ANTES do primeiro valor que
 * terminaria dentro do corte, e o resto espera o proximo pedaco. O tamanho minimo de 8
 * caracteres e' o mesmo piso do resto do modulo: abaixo disso nao ha' entropia, e mascarar
 * toda ocorrencia de `x` mutilaria a saida sem esconder segredo nenhum.
 */
export function redator(valores = []) {
  const alvos = [...new Set(valores.map(String).filter((v) => v.length >= 8))].sort((a, b) => b.length - a.length)
  const segura = alvos.length ? Math.max(...alvos.map((v) => v.length)) - 1 : 0
  let buf = ''
  const mascara = (t) => {
    let out = t
    for (const v of alvos) out = out.split(v).join('***')
    return out
  }
  return {
    empurra(pedaco) {
      buf += pedaco
      let saida = ''
      for (;;) {
        const corte = buf.length - segura
        if (corte <= 0) break
        // A conta e' sobre o FLUXO, nao sobre o pedaco: um valor cujo comeco saiu num pedaco e
        // o fim no seguinte continua inteiro na concatenacao do que o dono ve'. Por isso o
        // que manda nao e' "cabe no corte" e sim "COMECA antes dele" — quem comeca antes
        // manda o corte para tras, senao sairia um pedaco do valor.
        let achou = -1
        let achouLen = 0
        for (const v of alvos) {
          const i = buf.indexOf(v)
          if (i !== -1 && i < corte && (achou === -1 || i < achou)) {
            achou = i
            achouLen = v.length
          }
        }
        // Sem valor inteiro no buffer: o prefixo seguro sai e o rabo (menor que o MAIOR valor)
        // espera — e' o que costura o valor partido entre dois pedacos.
        if (achou === -1) {
          saida += mascara(buf.slice(0, corte))
          buf = buf.slice(corte)
          break
        }
        // Com o valor inteiro em maos nao ha' o que esperar: mascara e CONSOME o trecho dele,
        // senao o buffer ficaria preso nele e cresceria sem nunca mais emitir nada.
        saida += `${mascara(buf.slice(0, achou))}***`
        buf = buf.slice(achou + achouLen)
      }
      return saida
    },
    fim() {
      const saida = mascara(buf)
      buf = ''
      return saida
    },
  }
}

/**
 * `exec` com redacao. TTY de saida SEM `--redact` herda como sempre (o dono esta' olhando, o
 * terminal e' dele). Fora disso — pipe, CI, ou `--redact` pedido — a saida do filho passa por
 * um pipe e todo valor do cache vira `***`.
 */
export function execRedigido(cfg, argv, { env = process.env, redact = false, ttySaida = process.stdout.isTTY, spawnFn = spawn, saida = process.stdout, erro = process.stderr } = {}) {
  if (!argv.length) throw new ErroConfig('uso: tars secrets exec -- <cmd> [args]')
  if (!fs.existsSync(cfg.cache_file)) {
    throw new ErroConfig(`[secrets] cache ausente em ${cfg.cache_file} — rode \`tars secrets refresh\``)
  }
  const mapa = decifraMapa(cfg)
  if (ttySaida && !redact) return exec(cfg, argv, { env })
  return new Promise((resolve, reject) => {
    const filho = spawnFn(argv[0], argv.slice(1), { stdio: ['inherit', 'pipe', 'pipe'], env: envDoFilho(mapa, { env, cfg }), shell: false })
    const rOut = redator(Object.values(mapa))
    const rErr = redator(Object.values(mapa))
    filho.stdout.setEncoding('utf8')
    filho.stderr.setEncoding('utf8')
    filho.stdout.on('data', (c) => {
      const s = rOut.empurra(c)
      if (s) saida.write(s)
    })
    filho.stderr.on('data', (c) => {
      const s = rErr.empurra(c)
      if (s) erro.write(s)
    })
    filho.on('error', (e) => reject(new ErroConfig(`[secrets] nao consegui executar '${argv[0]}': ${e.message}`)))
    filho.on('close', (code) => {
      const s1 = rOut.fim()
      if (s1) saida.write(s1)
      const s2 = rErr.fim()
      if (s2) erro.write(s2)
      resolve({ status: code ?? 1 })
    })
  })
}

function cmdExec(rest, ctx) {
  const redact = rest.includes('--redact')
  const argv = rest.filter((a) => a !== '--redact')
  const limpo = argv[0] === '--' ? argv.slice(1) : argv
  return execRedigido(ctx.cfg, limpo, { env: ctx.env, redact, saida: ctx.saida, erro: ctx.erro })
}

// --- AUDITORIA ------------------------------------------------------------------------
/**
 * A trilha da operacao em `<dir>/audit.log` (JSONL 0600). O que entra e' o que NAO e' segredo:
 * quando, quem (ator), qual comando, quais enderecos/nomes e o resultado. Valor nunca — nem
 * fingerprint, que seria um oraculo de conferencia do segredo em cima de um arquivo que o
 * usuario talvez commite por engano.
 */
export function audit(ctx, { comando, enderecos = [], nomes = [], resultado }) {
  const f = path.join(ctx.cfg.dir, 'audit.log')
  const novo = !fs.existsSync(f)
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 })
  // O ator vem do ENV de quem chama (`ctx.env`). `actor({})` responderia 'human' sempre — e a
  // trilha diria que o dono fez o que o agente fez, mentindo justamente onde ela existe para
  // dizer quem agiu.
  fs.appendFileSync(f, `${JSON.stringify({ ts: new Date().toISOString(), ator: actor({ env: ctx.env }), comando, enderecos, nomes, resultado })}\n`, { mode: 0o600 })
  if (novo) protegeArquivo(f)
}

// --- COLAS ----------------------------------------------------------------------------
/** `--nome <v>` (repetivel). */
function valoresDe(list, nome) {
  const out = []
  for (let i = 0; i < list.length; i++) if (list[i] === nome && list[i + 1]) out.push(list[i + 1])
  return out
}

/** `--nome <v>` (o primeiro). */
const valorDe = (list, nome) => valoresDe(list, nome)[0] ?? null

/** `set`/`import` sao do DONO: `source=owner`, TTY e mao humana (o agente nao escreve no cofre). */
function exigeDono(cfg, ctx) {
  if (cfg.source !== 'owner') {
    throw new ErroConfig(`[secrets] comando do dono: \`source=owner\` (esta' '${cfg.source}') — a automacao le', nao escreve`)
  }
  podeAbrirCofre(cfg, { env: ctx.env, tty: ctx.tty })
}

/** Todo valor que passou por aqui entra na redacao de stderr/erro (`registra`, do dono). */
function registraEmMemoria(valor) {
  registra(valor)
  return valor
}

/** Os subcomandos DESTE modulo — o despachante do CLI consulta esta lista, nao um `if` solto. */
export const SUBCOMANDOS = ['compare', 'fingerprint', 'set', 'copy', 'move', 'rm', 'scan', 'import', 'exec']

/**
 * Modulo DONO do subcomando: o CLI so' chama; o julgamento fica aqui. A funcao NAO e' `async`
 * de proposito: so' `scan` e `exec` devolvem promessa (os dois esperam I/O de verdade), e
 * envolver os outros num `async` faria um `run().saida` — como o CLI e os testes leem —
 * virar `undefined` sem que ninguem percebesse.
 */
export function run({
  sub,
  rest = [],
  cfg,
  env = process.env,
  tty = process.stdin.isTTY,
  confirma = perguntaTty,
  le = leOculto,
  cwd = process.cwd(),
  home = os.homedir(),
  em = null,
  saida = process.stdout,
  erro = process.stderr,
} = {}) {
  const ctx = { cfg, env, tty, confirma, le, cwd, home, em, saida, erro }
  if (sub === 'compare') return cmdCompare(rest, ctx)
  if (sub === 'fingerprint') return cmdFingerprint(rest, ctx)
  if (sub === 'set') return cmdSet(rest, ctx)
  if (sub === 'copy') return cmdCopy(rest, ctx)
  if (sub === 'move') return cmdMove(rest, ctx)
  if (sub === 'rm') return cmdRm(rest, ctx)
  if (sub === 'scan') return cmdScan(rest, ctx)
  if (sub === 'import') return cmdImport(rest, ctx)
  if (sub === 'exec') return cmdExec(rest, ctx)
  throw new ErroConfig(`uso: tars secrets <${SUBCOMANDOS.join('|')}> (recebi '${sub ?? ''}')`)
}
