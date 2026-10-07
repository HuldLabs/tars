#!/usr/bin/env node
// `tars memory audit` — a FONTE de cada fato da memoria operacional vira dado e o
// audit cobra os tres modos de a prova morrer (TARS-CONSUME fatia 4, item 1; fonte
// `/workspace/.cache/tars-fabber/RELATORIO.md` item 10 e memoria do farmega.v2
// `.ai/scripts/memory_integrity.py` + `memory_runtime.audit_memory_integrity`, HEAD 617239d).
//
// PORQUE EXISTE: `source_refs` ja' e' campo do schema, mas o gate so' confere que o
// CAMINHO existe. Um fato pode apontar para `arquivo.md:12`, o arquivo ser reescrito e a
// linha 12 virar outra coisa — o fato fica VERDADEIRO no texto e MENTIRA na prova. Os tres
// modos de falha que este audit nomeia:
//   MISSING — o arquivo sumiu (ref morta);
//   ANCHOR  — a ancora (`#ancora`) nao existe mais no arquivo;
//   DRIFT   — o trecho mudou: o hash curto gravado nao casa o hash do trecho atual.
//
// FORMATO DA REF (SchemaKey `source_refs`, cada item uma string):
//   `arquivo.md:12`                       — linha 12 (o hash cobre essa linha);
//   `arquivo.md:12-15`                    — intervalo de linhas;
//   `arquivo.md#ancora`                   — ancora markdown (`## Ancora`);
//   `arquivo.md:12#SHA`                   — linha 12 + hash curto do trecho (prova);
//   `repo:caminho.md:12`                  — fato FEDERADO: a prova mora no repo de origem
//                                           (nao ha' arquivo local para conferir -> NAO julgado).
//
// MIGRACAO GRADUAL (decisao do dono): entrada sem hash em NENHUMA ref = AVISO (conta no
// report, nao reprova); com hash, o trecho tem de casar — se nao casar, e' DRIFT e reprova.
// Assim a memoria antiga entra aos poucos, e a nova nasce provada.
//
// Uso:
//   node tools/framework/tars-memory.mjs audit [--file <jsonl>] [--json] [--root <dir>]
//   tars memory audit [--file <jsonl>] [--json]
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/** Quantos caracteres do hash sha256 entram na ref (`arquivo.md:12#a1b2c3d4`). */
export const HASH_LEN = 8

/** Hash curto de um trecho: sha256 dos bytes normalizados (sem `\r`, sem espaco nas pontas). */
export function trechoHash(texto) {
  return crypto.createHash('sha256').update(String(texto ?? '').replace(/\r/g, '').trim()).digest('hex').slice(0, HASH_LEN)
}

/**
 * Parse de UMA ref. Devolve `{ repo, file, linha, fim, ancora, hash }` — campos ausentes
 * como undefined. Nunca lanca: ref malformada volta com `erro` (o audit a reporta).
 */
export function parseRef(ref) {
  const s = String(ref ?? '').trim()
  if (!s) return { erro: 'ref vazia' }
  // `repo:caminho` — o `:` do repo nao tem `/` nem extensao antes dele. Um caminho
  // LOCAL nunca tem `:` antes da primeira `/` (nao ha' drive letter aqui).
  let repo
  let resto = s
  const mRepo = /^([a-z0-9_.-]+):(.*)$/i.exec(s)
  if (mRepo) {
    repo = mRepo[1]
    resto = mRepo[2]
  }
  // `#ancora` ou `#hash`: o ultimo `#` separa. Ancora comeca com letra; hash e' hex de HASH_LEN.
  let ancora
  let hash
  const iHash = resto.lastIndexOf('#')
  if (iHash !== -1) {
    const sufixo = resto.slice(iHash + 1)
    resto = resto.slice(0, iHash)
    if (new RegExp(`^[0-9a-f]{${HASH_LEN}}$`).test(sufixo)) hash = sufixo
    else ancora = sufixo
  }
  // `:linha` ou `:linha-fim`: o ULTIMO `:` que precede so' digitos (e opcional `-digitos`).
  let linha
  let fim
  const mLin = /:(\d+)(?:-(\d+))?$/.exec(resto)
  if (mLin) {
    linha = Number(mLin[1])
    fim = mLin[2] ? Number(mLin[2]) : undefined
    resto = resto.slice(0, mLin.index)
  }
  if (repo && !resto) return { erro: `ref de repo sem caminho: '${s}'` }
  return { repo, file: resto, linha, fim, ancora, hash }
}

/**
 * Linhas de 1..n do texto. `fim` ausente = so' a linha. O TRECHO e' o texto dessas linhas
 * (o hash cobre exatamente o que se citou — mudar o alvo muda o hash).
 */
export function trechoDe(texto, linha, fim) {
  const linhas = String(texto).split(/\r?\n/)
  if (!Number.isFinite(linha)) return null
  const de = linha - 1
  const ate = Number.isFinite(fim) ? fim : linha
  if (de < 0 || de >= linhas.length) return null
  return linhas.slice(de, ate).join('\n')
}

/**
 * A ancora existe? Aceita cabecalho markdown cujo slug casa a ancora: minusculas, sem
 * acento, espacos -> `-`. (`## Fechamento de sessao` -> `fechamento-de-sessao`).
 */
export function temAncora(texto, ancora) {
  const alvo = String(ancora ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  for (const l of String(texto).split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.*)$/.exec(l)
    if (!m) continue
    const slug = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (slug === alvo) return true
  }
  return false
}

/**
 * Julga UMA ref contra o repo. Devolve `{ ref, status, motivo }` com status
 * `ok` | `aviso` | `missing` | `anchor` | `drift` | `ignorada` (federada).
 * `ler(rel)` injetavel para o teste nao tocar o FS.
 */
export function julgaRef(ref, { root, ler } = {}) {
  const p = parseRef(ref)
  if (p.erro) return { ref, status: 'malformada', motivo: p.erro }
  // Fato FEDERADO: a prova mora no repo de origem — sem arquivo local, nao ha' o que julgar.
  if (p.repo) return { ref, status: 'ignorada', motivo: `fato federado (prova em '${p.repo}')` }
  if (!p.file) return { ref, status: 'malformada', motivo: 'ref sem caminho' }
  if (path.isAbsolute(p.file)) return { ref, status: 'ignorada', motivo: 'caminho absoluto' }
  const abs = path.join(root ?? process.cwd(), p.file)
  const texto = ler ? ler(p.file) : fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
  if (texto === null) return { ref, status: 'missing', motivo: `arquivo ausente: '${p.file}'` }
  if (p.ancora !== undefined) {
    return temAncora(texto, p.ancora)
      ? { ref, status: p.hash ? 'ok' : 'aviso', motivo: p.hash ? undefined : 'sem hash do trecho (migracao)' }
      : { ref, status: 'anchor', motivo: `ancora '#${p.ancora}' nao existe em '${p.file}'` }
  }
  if (p.linha !== undefined) {
    const trecho = trechoDe(texto, p.linha, p.fim)
    if (trecho === null) return { ref, status: 'missing', motivo: `linha ${p.linha} fora de '${p.file}'` }
    if (!p.hash) return { ref, status: 'aviso', motivo: 'sem hash do trecho (migracao)' }
    const atual = trechoHash(trecho)
    return atual === p.hash
      ? { ref, status: 'ok' }
      : { ref, status: 'drift', motivo: `DRIFT em '${p.file}:${p.linha}': hash gravado ${p.hash}, atual ${atual}` }
  }
  // Sem linha e sem ancora: so' o caminho — o gate basico (`source_ref existe`) ja' cobre.
  return { ref, status: 'aviso', motivo: 'ref sem linha/ancora (so o caminho)' }
}

/**
 * O audit: le o jsonl, julga cada ref de cada entrada e agrega. Reprova (exit != 0) quando
 * ha' `missing`/`anchor`/`drift`/`malformada`; entrada sem hash e' AVISO, nunca erro.
 */
export function auditMemory(file, { root = process.cwd(), ler } = {}) {
  const linhas = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()) : []
  const refs = []
  const porStatus = { ok: 0, aviso: 0, missing: 0, anchor: 0, drift: 0, ignorada: 0, malformada: 0 }
  let semHash = 0
  let entradas = 0
  linhas.forEach((l, i) => {
    let e
    try { e = JSON.parse(l) } catch { porStatus.malformada++; refs.push({ linha: i + 1, id: 'sem id', ref: `<linha ${i + 1} nao e' JSON>`, status: 'malformada', motivo: 'JSON invalido' }); return }
    if (!e || typeof e !== 'object' || Array.isArray(e)) return
    entradas++
    const lista = Array.isArray(e.source_refs) ? e.source_refs : []
    const comHash = lista.some((r) => parseRef(r).hash)
    if (!comHash) semHash++
    for (const r of lista) {
      const j = julgaRef(r, { root, ler })
      porStatus[j.status]++
      refs.push({ linha: i + 1, id: e.id ?? 'sem id', ...j })
    }
  })
  const falhas = refs.filter((r) => ['missing', 'anchor', 'drift', 'malformada'].includes(r.status))
  return { file, entradas, refs, porStatus, semHash, falhas, ok: falhas.length === 0 }
}

/** Texto curto do report: os numeros primeiro, o que revisar depois. */
export function format(r) {
  const c = r.porStatus
  const l = [`tars memory audit: ${r.entradas} entradas, ${r.refs.length} refs — ok ${c.ok}, missing ${c.missing}, anchor ${c.anchor}, drift ${c.drift}, malformada ${c.malformada}, federada ${c.ignorada}`]
  if (r.semHash) l.push(`  aviso: ${r.semHash} entrada(s) sem hash de trecho (migracao gradual: adicione '#<hash>')`)
  if (r.falhas.length) {
    l.push(`  ${r.falhas.length} ref(s) a revisar:`)
    for (const f of r.falhas) l.push(`    ${f.status.toUpperCase()} linha ${f.linha} (${f.id}): ${f.motivo ?? f.ref}`)
  }
  return l.join('\n')
}
