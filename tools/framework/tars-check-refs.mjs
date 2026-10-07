#!/usr/bin/env node
// `tars check-refs <prompt.md>` — a DECISAO citada no despacho tem de existir na arvore
// do worker. TARS-CONSUME fatia 4, item 2 (fonte `/workspace/.cache/tars-fabber/RELATORIO.md`
// item 10, incidente medido: a regra de DNS vivia so' no commit `4f8ad582` de um branch de
// feature; `git merge-base --is-ancestor 4f8ad582 HEAD` falhou; o worker despachado de `main`
// produziu o mapa de rename ERRADO porque a regra era inalcancavel).
//
// PORQUE EXISTE: o `precollect.py` acha ARQUIVOS, mas nada confere se a DECISAO que rege a
// fatia esta' visivel para quem vai executar. O prompt cita um sha ou um caminho; se o sha
// nao e' ancestral do HEAD do worker (ou o caminho nao existe na arvore), o worker vai
// decidir no escuro — e o defeito so' aparece na entrega.
//
// O QUE CONFERE (cada citação vira uma linha julgada):
//   sha7+     — `git merge-base --is-ancestor <sha> HEAD` (ancestral = visivel na arvore);
//   caminho   — existe? (`docs/a.md`, `src/x.mjs`); fora da arvore = nao visivel.
// REPROVA (exit != 0) quando ALGUMA citação nao esta' visivel — o despacho tem de portar a
// decisao ANTES de o worker comecar.
//
// Uso:
//   node tools/framework/tars-check-refs.mjs <prompt.md|-> [--cwd <dir>] [--json]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * Um sha citado no texto: hex de 7+ entre limites que nao sejam letra/numero. Exige tambem
 * um DIGITO junto de uma LETRA hex (a..f) — sem isso `20261007` (data) e `1234567` (numero)
 * entrariam como sha. Um sha real e' indistinguivel de um numero puro so' por 7+ digitos.
 */
const SHA_RE = /(?<![0-9a-zA-Z])[0-9a-f]{7,40}(?![0-9a-zA-Z])/gi
/** Tokens de um texto onde um caminho pode comecar (o `:` de `arquivo:12` NAO corta). */
const TOKEN_RE = /[\w.@/~-]+/g
/** Extensoes que fazem um token ser lido como arquivo (sem `/`). */
const EXT_RE = /\.(?:md|mjs|cjs|js|ts|tsx|json|jsonl|toml|yaml|yml|py|sh|sql|css|html|txt)$/i
/** Ruido que PARECE caminho mas nao e' alvo (url, versao, pacote). */
const IGNORA = [/^https?$/i, /^www\./i, /^node_modules\//, /^\d+\.\d+/, /\.min\.(js|css)$/]

/** Diretorios de topo de `cwd` (nao recursivo; ausente = lista vazia). */
function dirsDeTopo(cwd) {
  try {
    return readdirSync(cwd, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name)
  } catch { return [] }
}

/** SHAs únicos citados no texto (com a linha de origem, para o report apontar onde). */
export function achaShas(texto) {
  const out = new Map()
  for (const m of String(texto).matchAll(SHA_RE)) {
    const s = m[0]
    if (!/[0-9]/.test(s) || !/[a-f]/i.test(s)) continue // so' digitos ou so' letras = nao e' sha (data/numero/palavra)
    if (new Set(s).size === 1) continue // `0000000`/`1111111` = placeholder
    const linha = String(texto).slice(0, m.index).split('\n').length
    if (!out.has(s)) out.set(s, linha)
  }
  return [...out].map(([sha, linha]) => ({ sha, linha }))
}

/**
 * Caminhos unicos citados no texto. Tokeniza por linha (o `:` de `arquivo.md:12` fica FORA do
 * token, entao o caminho sai inteiro) e aceita so' o que PARECE um caminho do repo:
 *   (a) tem uma barra (`docs/a.md`, `tools/x/y.mjs`) E o PRIMEIRO segmento e' um diretorio
 *       real da arvore (`docs/`, `tools/`, `apps/`...), ou
 *   (b) tem extensao de arquivo conhecida e NAO e' o caso acima (fica como possivel arquivo).
 * Exigir a raiz real e' o que separa o alvo do ruido: sem isso a prosa entra como caminho
 * (`credenciais/bancos/dados/infra`, `P0/P1`, `26/09`) e um nome solto (`principles.md`) vira
 * citacao de um arquivo que o prompt nunca apontou. O prompt de despacho cita caminho do repo,
 * nao nome de arquivo avulso.
 * `dirs` e' a lista de diretorios de topo do repo (lida uma vez por `checkRefs`).
 */
export function achaCaminhos(texto, dirs = []) {
  const tops = new Set(dirs)
  const out = new Map()
  String(texto).split(/\r?\n/).forEach((linha, i) => {
    if (/^\s*[|>]/.test(linha)) return // tabela markdown / quote: nao e' citacao
    if (/https?:\/\//.test(linha)) return // a linha inteira e' url (nenhum alvo)
    for (const m of linha.matchAll(TOKEN_RE)) {
      const p = m[0].replace(/[.,;)]+$/, '')
      const raiz = p.split('/')[0]
      if (!tops.has(raiz)) continue // so' caminho com raiz real do repo
      if (p.startsWith('/') || p.includes('*') || p.includes('<') || p.includes('{') || p.includes('~')) continue
      if (IGNORA.some((r) => r.test(p))) continue
      if (!out.has(p)) out.set(p, i + 1)
    }
  })
  return [...out].map(([caminho, linha]) => ({ caminho, linha }))
}

/**
 * Julga as citacoes contra a arvore. `git` injetavel (o teste nao depende de um repo real).
 * Devolve `{ citacoes, naoVisiveis, ok }` — cada citacao com `tipo`, `alvo`, `linha`, `status`, `motivo`.
 */
export function checkRefs(texto, { cwd = process.cwd(), git } = {}) {
  const corre = git ?? ((args) => spawnSync('git', args, { cwd, encoding: 'utf8' }))
  const head = corre(['rev-parse', 'HEAD'])
  // Fora de repo git (ou repo sem commit): `sha` nao da' para julgar — caminho ainda da'.
  const temRepo = head.status === 0
  // Diretorios de topo do repo: e' o que distingue `docs/a.md` (caminho) de `P0/P1` (prosa).
  const dirs = dirsDeTopo(cwd)
  const citacoes = []
  for (const { sha, linha } of achaShas(texto)) {
    if (!temRepo) {
      citacoes.push({ tipo: 'sha', alvo: sha, linha, status: 'ignorada', motivo: 'sem repo git (HEAD indisponivel)' })
      continue
    }
    const r = corre(['merge-base', '--is-ancestor', sha, 'HEAD'])
    // exit 0 = ancestral (visivel); 1 = nao ancestral (INALCANCAVEL); outro = sha desconhecido.
    if (r.status === 0) citacoes.push({ tipo: 'sha', alvo: sha, linha, status: 'ok' })
    else if (r.status === 1) citacoes.push({ tipo: 'sha', alvo: sha, linha, status: 'inalcancavel', motivo: `'${sha}' nao e' ancestral de HEAD (regra inalcancavel do branch do worker)` })
    else citacoes.push({ tipo: 'sha', alvo: sha, linha, status: 'inexistente', motivo: `'${sha}' nao existe neste repo` })
  }
  for (const { caminho, linha } of achaCaminhos(texto, dirs)) {
    const abs = resolve(cwd, caminho)
    citacoes.push(existsSync(abs)
      ? { tipo: 'caminho', alvo: caminho, linha, status: 'ok' }
      : { tipo: 'caminho', alvo: caminho, linha, status: 'inexistente', motivo: `caminho ausente na arvore: '${caminho}'` })
  }
  const naoVisiveis = citacoes.filter((c) => ['inalcancavel', 'inexistente'].includes(c.status))
  return { citacoes, naoVisiveis, ok: naoVisiveis.length === 0, temRepo }
}

/** Texto curto: quantas citacoes, quantas invisiveis, e cada uma delas. */
export function format(r) {
  const l = [`tars check-refs: ${r.citacoes.length} citacao(oes) — ${r.ok ? 'todas visiveis' : `${r.naoVisiveis.length} NAO visivel(is)`}`]
  if (!r.ok) for (const c of r.naoVisiveis) l.push(`  ${c.status.toUpperCase()} linha ${c.linha} (${c.tipo} ${c.alvo}): ${c.motivo}`)
  return l.join('\n')
}
