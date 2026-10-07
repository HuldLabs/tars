#!/usr/bin/env node
// `tars incident add` — o LEDGER de incidentes deixa de ser editado a mao (TARS-INCIDENTE-AUTO
// fatia 1). Hoje o agente escreve o JSON a mao e esquece; aqui o proprio agente registra a
// falha no fim do item, com id/data/repo gerados e o MESMO esquema do gate.
//
// R3 (SSOT): a lista de campos e a validacao NAO moram aqui — vem de `ai-memory.mjs`
// (`validateLedgerEntry`/`LEDGER_KEYS`), que e' quem o `--check` do pre-commit usa. Duplicar a
// lista aqui daria duas verdades.
//
// A recorrencia e' porte da IDEIA do tokenhood (`.ai/workflows/harness-postmortem.md`, lido em
// /workspace/.cache/seg-33/incauto-pesq.md §C): defeito que RECORRE 2x exige mudanca no
// harness, nao mais um registro. Aqui o detector e' barato e declarado: mesma tag + titulo com
// >= 50% das palavras em comum (`palavrasIguais`), e a 2a ocorrencia imprime o lembrete.
//
// Uso:
//   node tools/framework/tars-incident.mjs add --titulo T --o-que X --causa C --correcao R \
//        [--tags a,b] [--fonte F] [--repo N] [--file <jsonl>] [--json]
//   tars incident add ... (o wrapper despacha para ca')
import fs from 'node:fs'
import path from 'node:path'
import { entryIdentity, LEDGER_FILE, readJsonl, validateLedgerEntry } from './ai-memory.mjs'

/** Os campos que o CLI preenche sozinho (nao vem por flag). */
export const CAMPOS_DERIVADOS = ['id', 'data', 'repo']

/** As flags obrigatorias de `add`, na ordem em que o erro as nomeia (R4: o erro diz o campo). */
export const CAMPOS_OBRIGATORIOS = ['titulo', 'o_que', 'causa', 'correcao']

/** `--o-que` virou chave do schema `o_que`; as demais trocam `-` por `_` sem mais nada. */
export function chaveDaFlag(flag) {
  return String(flag).replace(/^--/, '').trim().replace(/-/g, '_')
}

/** Slug do titulo: minusculas, sem acento, nao-alfanumerico vira `-`, cortado em 48. */
export function slugify(titulo) {
  const s = String(titulo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return s
}

/** `inc-<slug>`, unico contra os ids ja' no ledger (sufixo -2, -3... — sem numero ja' e' o 1o). */
export function idUnico(base, ids) {
  let id = `inc-${base}`
  let n = 1
  while (ids.has(id)) id = `inc-${base}-${++n}`
  return id
}

/** As palavras comparaveis de um texto: minusculas, sem acento, so' [a-z0-9], len > 2. */
export function palavras(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
}

/**
 * A fracao do titulo NOVO que ja' aparece no titulo antigo (0..1). Simetrica na pratica porque
 * o denominador e' o menor dos dois conjuntos: `>= 0.5` = o pedido da issue ("metade das
 * palavras"). Titulo sem palavra comparavel da 0 (nada a comparar nao vira recorrencia).
 */
export function palavrasIguais(a, b) {
  const A = new Set(palavras(a))
  const B = new Set(palavras(b))
  const menor = Math.min(A.size, B.size)
  if (!menor) return 0
  let comuns = 0
  for (const w of A) if (B.has(w)) comuns++
  return comuns / menor
}

/** `fonte` da flag: string -> [string]; lista -> lista. Vazio nao passa no schema do ledger. */
export function fontes(fonte) {
  const lista = Array.isArray(fonte) ? fonte : fonte ? [fonte] : []
  return lista.map(String).filter((s) => s.trim())
}

/** `tags` da flag: `a,b` ou lista; sem acento e sem espaco. */
export function normalizaTags(tags) {
  const lista = Array.isArray(tags) ? tags : tags ? String(tags).split(',') : []
  return lista.map((t) => slugify(t)).filter(Boolean)
}

/** Normaliza o `--repo`: sem ele, o nome da pasta do projeto (`slug-do-repo`). */
export function nomeRepo(repo) {
  return repo ? String(repo).trim().replace(/-/g, '_') : ''
}

/**
 * Monta a entrada do ledger. Puro: quem chama passa `hoje` e `repo`. Recusa campo vazio
 * NOMEANDO o campo (R4 — o erro grita qual falta, nunca "uso incorreto").
 */
export function montaEntrada({ titulo, o_que, causa, correcao, tags, fonte, repo, hoje, idsExistentes = new Set() }) {
  const vals = { titulo, o_que, causa, correcao }
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (typeof vals[campo] !== 'string' || !vals[campo].trim()) {
      throw new Error(`campo obrigatorio vazio: --${campo.replace(/_/g, '-')}`)
    }
  }
  const base = slugify(titulo)
  const e = {
    id: idUnico(base, idsExistentes),
    data: hoje,
    titulo: String(titulo).trim(),
    o_que: String(o_que).trim(),
    causa: String(causa).trim(),
    correcao: String(correcao).trim(),
    recorrencia: 1,
    fonte: fontes(fonte),
    tags: normalizaTags(tags),
  }
  const r = nomeRepo(repo)
  if (r) e.repo = r
  return e
}

/**
 * Julga a recorrencia contra as entradas JA' existentes. Regra: mesma tag + titulo com >= 50%
 * das palavras em comum. `recorrencia` vira a CONTAGEM (2 na 2a vez, 3 na 3a): e' o numero que
 * o `tars doctor` usa para acusar a classe que repetiu (TARS-REC-1).
 */
export function recorrenciaDe(entrada, existentes) {
  const tags = new Set(entrada.tags ?? [])
  const parecidas = existentes.filter(
    (x) => x && typeof x === 'object' && !Array.isArray(x) && (x.tags ?? []).some((t) => tags.has(t)) && palavrasIguais(entrada.titulo, x.titulo) >= 0.5,
  )
  const n = typeof entrada.recorrencia === 'number' && entrada.recorrencia > 1 ? entrada.recorrencia : 1 + parecidas.length
  return { ids: parecidas.map((x) => x.id), recorrencia: Math.max(1, n) }
}

/** Append ATOMICO: escreve o arquivo inteiro em `.tmp` e renomeia (crash nao deixa meia linha). */
export function appendAt(f, texto) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const tmp = `${f}.tmp`
  fs.writeFileSync(tmp, texto)
  fs.renameSync(tmp, f)
}

/**
 * `tars incident add`. `le`/`escreve` injetaveis (o teste roda em tmpdir sem tocar o repo).
 * Devolve a entrada gravada + a recorrencia + a saida que o CLI imprime.
 */
export function incidentAdd(
  { titulo, o_que, causa, correcao, tags, fonte, repo, file = LEDGER_FILE, hoje = new Date().toISOString().slice(0, 10) },
  { le = (f) => readJsonl(f).entries.filter((e) => e && typeof e === 'object' && !Array.isArray(e)), escreve = appendAt } = {},
) {
  const existentes = le(file)
  const entrada = montaEntrada({
    titulo,
    o_que,
    causa,
    correcao,
    tags,
    fonte,
    repo,
    hoje,
    idsExistentes: new Set(existentes.map((e) => e.id)),
  })
  // O gate julga a entrada BASE (com `recorrencia` decidido) e a identidade e' conferida ANTES
  // da recorrencia: registrar de novo o MESMO incidente (tudo igual, ate' a prova) tem de
  // RECUSAR, nao virar um "recorrente" — a identidade do ledger nao conta a contagem. E' o
  // mesmo `duplicata exata` do `addEntry` do ai-memory, agora alcancavel pelo CLI.
  const base = { ...entrada, recorrencia: 1 }
  const errs = validateLedgerEntry(base)
  if (errs.length) throw new Error(`incidente recusado: ${errs.join('; ')}`)
  const ident = entryIdentity(base)
  const dup = existentes.find((e) => entryIdentity(e) === ident)
  if (dup) throw new Error(`duplicata exata (id '${dup.id}') — o incidente ja esta no ledger`)
  const rec = recorrenciaDe(entrada, existentes)
  entrada.recorrencia = rec.recorrencia
  const texto = existentes.map((e) => JSON.stringify(e)).join('\n') + (existentes.length ? '\n' : '') + JSON.stringify(entrada) + '\n'
  escreve(file, texto)
  const saida = [`incidente registrado: ${entrada.id} (${entrada.data}) em ${file}`]
  if (rec.ids.length) saida.push(`RECORRENTE: ${rec.ids.join(', ')}`)
  if (rec.recorrencia >= 2) saida.push('harness-postmortem: proponha mudanca de guarda/hook (1-5 linhas)')
  return { entrada, ...rec, file, saida: saida.join('\n') }
}

/** Le `--nome valor` da lista de args (a mesma forma do `argValue` do tars.mjs). */
export function argValue(list, name) {
  const i = list.indexOf(name)
  return i === -1 ? null : list[i + 1]
}

export function format(r) {
  return r.saida
}
