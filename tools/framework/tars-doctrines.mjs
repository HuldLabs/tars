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
// declara so' o que e' dele, com caminho proprio). Fonte que mora em repo IRMAO usa
// `<repo>:<relativo>` (ex.: `huldlabs:adr/0002-…`), resolvido pela raiz dos vizinhos.
//
// Uso (dentro do projeto consumidor):
//   node <tars>/tools/framework/tars-doctrines.mjs [--tars <dir>] [--project <dir>] [--json]
//
// Saida: uma linha por doutrina, `STATUS id  fonte  gate`, e exit != 0 quando ha PHANTOM ou
// DRIFT (`--ci` e' o mesmo exit, explicito para o leitor do pipeline). SEM GATE e' aviso:
// doutrina orfa declarada e' divida nomeada, nao esquecimento — nao derruba o build.
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTars, parseToml, NONINTERACTIVE_ENV, effectiveHooksPath, usesGitHooks, GIT_HOOKS, hookVivo } from './tars-sync.mjs'
// TARS-REC-1: a classe que repetiu no ledger e' cobrada pelo doctor (a camada "acusa o estado
// errado" da doutrina incidente-vira-prevencao). A CONTAGEM mora no ai-memory — aqui so' se le'.
import { classesRecorrentes, readJsonl } from './ai-memory.mjs'
// S3 (dev.9): o doctor de SEGREDOS mora no modulo dono (`tars-secrets.mjs`) — aqui so' se
// anexa o que ele julga quando o projeto declara `[secrets]`/`[identity]` (R3).
import { doctorDoProjeto } from './tars-secrets.mjs'
// B3.3: o doctor mostra o TAMANHO DA DIVIDA da linha de base (quantas violacoes adotadas o
// projeto carrega). A leitura mora no modulo dono da base (R3); aqui so' a linha do relatorio.
import { divida as dividaBaseline } from './tars-gates-baseline.mjs'

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
 * `arquivo:linha` ou `arquivo:120-140`; sem linha, o arquivo inteiro. Dois prefixos de
 * repositorio: `segtools:` marca doutrina que so' o PROJETO consumidor tem (a fonte e'
 * conferida la'); `<repo>:` (ex.: `huldlabs:adr/0002-…`) marca arquivo que mora na raiz de um
 * repo IRMAO — o catalogo descreve o par sem cravar caminho ABSOLUTO, que so' existe numa
 * maquina. Os dois saem `externo` (nem a fonte nem a prova rodam aqui), mas o modo muda o que
 * o doctor DIZ quando o repo nao esta' montado.
 */
export function parseRef(ref) {
  const doProjeto = ref.startsWith('segtools:')
  const irmao = doProjeto ? null : (ref.match(/^([a-z][a-z0-9-]*):(?=[\w./-])/) ?? [])[1] ?? null
  const corpo = doProjeto ? ref.slice('segtools:'.length) : irmao ? ref.slice(irmao.length + 1) : ref
  const m = corpo.match(/^(.*?):(\d+)(?:-(\d+))?$/)
  const base = m ? { arquivo: m[1], linha: Number(m[2]), fim: m[3] ? Number(m[3]) : Number(m[2]) } : { arquivo: corpo }
  return { ...base, externo: doProjeto || irmao !== null, doProjeto, repo: irmao }
}

/** A raiz dos repos VIZINHOS e' o PAI do catalogo (mesma base do `tars curation`, que usa
 * `join(tars, '..')`). Num worktree (`.worktrees/<slot>`), o pai e' o pai do REPO — os irmaos
 * nao moram dentro do repo. */
export function siblingRoot(tars) {
  const base = resolve(tars)
  const repo = /^(.*)\/\.worktrees\/[^/]+$/.exec(base)?.[1] ?? base
  return resolve(repo, '..')
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

/**
 * A doutrina de OUTRO repo (irmao): o texto EXISTE fora do catalogo, entao a checagem muda de
 * "arquivo:linha cabem no arquivo?" para "o repo esta' montado e o nao-vazio do texto segue
 * la'?". Repo ausente = FALHA ALTA e nomeada (`REPO AUSENTE … — clone-o ao lado`), nunca
 * silencio: doutrina que nao da' para conferir nao pode passar por conferida (R4).
 */
export function fonteIrmaOk(tars, ref, { exists = existsSync, read = (f) => readFileSync(f, 'utf8') } = {}) {
  const { repo, arquivo, linha, fim } = parseRef(ref)
  const raiz = join(siblingRoot(tars), repo)
  if (!exists(raiz)) {
    return {
      ok: false,
      status: 'DRIFT',
      porque: `REPO AUSENTE: ${repo} nao esta' em ${siblingRoot(tars)} — clone-o ao lado (tars curation acha os vizinhos ali)`,
    }
  }
  const full = join(raiz, arquivo)
  if (!exists(full)) {
    return { ok: false, status: 'DRIFT', porque: `fonte nao existe: ${repo}:${arquivo} (em ${raiz})` }
  }
  const total = read(full).split('\n').length
  if (fim > total) {
    return { ok: false, status: 'DRIFT', porque: `fonte ${repo}:${arquivo}:${linha} aponta linha ${fim} de ${total} — o texto mudou de lugar` }
  }
  return { ok: true, status: 'OK', porque: `${repo}:${arquivo}${linha ? `:${linha}` : ''} (repo irmao montado)` }
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
export function classify(d, base = process.cwd(), { spawn = rodaProva, tars = base, projeto = base } = {}) {
  const ref = parseRef(d.fonte)
  // Doutrina de OUTRO projeto (`segtools:`): nem a fonte nem a prova rodam aqui — o catalogo
  // so' descreve o par. Julgar aqui daria DRIFT falso (o arquivo mora no projeto, nao aqui).
  if (ref.doProjeto) return { ...d, status: 'PROJETO', detalhe: `descreve ${d.fonte} — o doctor roda no projeto consumidor` }
  // Doutrina cuja fonte mora num repo IRMAO (`huldlabs:adr/…`): aqui SIM da' para conferir — a
  // raiz dos vizinhos e' conhecida, entao repo ausente vira FALHA alta em vez de link quebrado.
  if (ref.repo) {
    const irmao = fonteIrmaOk(tars, d.fonte)
    // No CONSUMIDOR (base != catalogo) o repo da org nao esta' montado ao lado: quem confere a
    // doutrina da org e' o doctor do proprio Tars, no CI dele. Aqui ela so' e' descrita — DRIFT
    // nesse caso era falso e empurrava o consumidor a symlink a mao (Kipp, 14/10).
    if (!irmao.ok && resolve(projeto) !== resolve(tars)) {
      return { ...d, status: 'PROJETO', detalhe: `doutrina da org (${ref.repo}): conferida no doctor do Tars, nao aqui` }
    }
    return irmao.ok
      ? { ...d, status: 'SEM GATE', detalhe: `${d.motivo} (fonte ${irmao.porque})`, prova: d.prova }
      : { ...d, status: 'DRIFT', detalhe: irmao.porque }
  }
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

/**
 * TARS-INCIDENTE-AUTO: a `correcao` de um incidente diz com que ARQUIVO/COMMIT ela foi coberta?
 * A prova e' barata e declarada: um sha de 7-40 hex, um caminho com extensao, ou a ancora
 * `BR-`/`ADR-`/`SEG-` (id de regra). "o agente vai lembrar" nao casa — e' justamente o que
 * nao funciona. `correcao` vazia = sem guarda (nada citado).
 */
export function citaGuarda(correcao) {
  const s = String(correcao ?? '')
  return /\b[0-9a-f]{7,40}\b/i.test(s) || /[\w./-]+\.(mjs|js|ts|tsx|py|md|toml|json|sh|jsonl|sql)\b/i.test(s) || /\b(BR|ADR|SEG)-[\w-]+/i.test(s)
}

/**
 * Os incidentes RECORRENTES (`recorrencia: true`) cuja correcao nao cita commit nem arquivo
 * de guarda: repetiram e continuam sem quem os cubra. Booleano legado `true` conta como
 * recorrente; numero >= 2 idem (TARS-REC-1 tornou `recorrencia` contagem).
 */
export function incidentesSemGuarda(entries) {
  return (entries ?? []).filter((e) => e && typeof e === 'object' && !Array.isArray(e) && (e.recorrencia === true || (typeof e.recorrencia === 'number' && e.recorrencia >= 2)) && !citaGuarda(e.correcao))
}

/** A doutrina nao esta' sendo cobrada: o doctor sai != 0 (R4 — falha alta). */
export const FALHA = ['PHANTOM', 'DRIFT']

/**
 * A PONTA que faz o guard rodar: o `.claude/settings.json` do consumidor. Doutrina OK nao
 * basta se o harness nao roda nada. Duas checagens, ambas de CLASSE (07/10):
 *   - `env` nao interativo ausente: um comando de agente BLOQUEIA esperando senha (o `git fetch`
 *     de 8 min);
 *   - hook apontando arquivo AUSENTE: o harness roda `bash: no such file` em toda sessao.
 * Qualquer das duas = FALHA com o comando de correcao (`tars sync`).
 */
export function wiringCheck(project) {
  const file = join(project, '.claude', 'settings.json')
  if (!existsSync(file)) return { ok: false, detalhe: 'sem .claude/settings.json — rode `tars sync`', orfa: [], avisos: [] }
  let s
  try {
    s = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, detalhe: `settings.json ilegivel: ${err.message} — rode \`tars sync\``, orfa: [], avisos: [] }
  }
  const avisos = Object.entries(NONINTERACTIVE_ENV)
    .filter(([k, v]) => s.env?.[k] !== v)
    .map(([k, v]) => `${k} (esperado '${v}')`)
  // Hook apontando arquivo AUSENTE = FALHA, em TODOS os eventos (o doctor so' olhava o
  // caminho `.ai/guards/...` e deixava passar um comando que cita qualquer outro arquivo).
  // Um `bash: no such file` em PreCompact/SessionStart suja a sessao inteira.
  const orfa = []
  for (const [evento, entradas] of Object.entries(s.hooks ?? {}))
    for (const e of entradas ?? [])
      for (const h of e.hooks ?? []) {
        const cmd = h.command
        if (typeof cmd !== 'string') continue
        // Todo caminho do projeto citado por `$CLAUDE_PROJECT_DIR/<rel>` tem de existir.
        for (const m of cmd.matchAll(/\$\{?CLAUDE_PROJECT_DIR\}?\/([^"\s;)]+)/g)) {
          const rel = m[1]
          if (!existsSync(join(project, rel))) orfa.push(`${evento}: ${rel}`)
        }
      }
  const git = gitHooksCheck(project)
  return {
    ok: !orfa.length && !avisos.length && git.ok,
    detalhe: orfa.length
      ? `hook apontando arquivo ausente (${orfa.join('; ')}) — rode \`tars sync\``
      : !git.ok
        ? git.detalhe
        : avisos.length
          ? `sem ambiente nao interativo: ${avisos.join(', ')} — rode \`tars sync\``
          : 'env nao interativo presente; todo hook aponta arquivo existente',
    orfa,
    avisos,
    git,
  }
}

/**
 * Os hooks do git que o MANIFESTO declara: so' o declarado ganha hook (o sync nao escreve
 * os outros). Sem manifesto legivel, cai no catalogo inteiro — nao da' para cobrar menos.
 */
function declaredGitHooks(project) {
  const file = join(project, '.ai', 'tars.toml')
  if (!existsSync(file)) return GIT_HOOKS
  try {
    const cfg = parseToml(readFileSync(file, 'utf8'))
    const declarados = GIT_HOOKS.filter((h) => (cfg.gates?.[h] ?? []).length)
    return declarados.length ? declarados : GIT_HOOKS
  } catch {
    return GIT_HOOKS
  }
}

/**
 * `core.hooksPath` que aponta para pasta INEXISTENTE ou sem os hooks do manifesto = FALHA:
 * o git engole o commit sem rodar gate nenhum, calado. A checagem so' vale quando o
 * consumidor USA hooks proprios — quem nao usa nao tem o que cobrar. E cobra so' os hooks
 * DECLARADOS no `[gates]`: exigir os 3 de quem declarou um reprovaria quem esta' certo.
 */
export function gitHooksCheck(project) {
  if (!usesGitHooks(project)) return { ok: true, detalhe: 'consumidor sem hooks proprios do git' }
  const hooksPath = effectiveHooksPath(project)
  const dir = join(project, hooksPath)
  // A frase e' a do dono: `HOOKS MORTOS` nomeia o que esta' acontecendo (nenhum gate roda) e o
  // que fazer (`tars sync`). O git engole o commit calado — o erro tem de GRITAR (R4).
  if (!existsSync(dir)) return { ok: false, detalhe: `HOOKS MORTOS: core.hooksPath=${hooksPath} nao existe — nenhum gate roda (rode \`tars sync\`)` }
  const faltando = []
  for (const hook of declaredGitHooks(project)) {
    const f = join(dir, hook)
    if (!existsSync(f)) faltando.push(`${hooksPath}/${hook}`)
    // "Vivo" e' a mesma pergunta para o doctor e para o sync: bit de execucao no POSIX, e
    // `#!` no win32 (onde o NTFS nao guarda bit algum — ler `mode & 0o111` reprovava TODO
    // hook Windows). SSOT: a testemunha mora em `hookVivo` (tars-sync.mjs).
    else if (!hookVivo(f)) faltando.push(`${hooksPath}/${hook} (nao executavel/sem shebang)`)
  }
  return faltando.length
    ? { ok: false, detalhe: `HOOKS MORTOS: ${faltando.join('; ')} ausente/nao executavel — nenhum gate roda (rode \`tars sync\`)` }
    : { ok: true, detalhe: `${hooksPath}/ com os hooks do git` }
}

/** Carrega, classifica e resume. `faltando` e' o que derruba o exit code. */
export function doctor({ tars, project, env = process.env } = {}) {
  const catalogo = resolve(tars ?? findTars())
  const root = resolve(project ?? process.cwd())
  // A base de cada doutrina e' quem a DECLAROU: a do catalogo (`escopo = "catalogo"`) resolve
  // contra a raiz do Tars, a do projeto (`[[doctrine]]` no `.ai/tars.toml`) contra a raiz do
  // projeto. Sem isso a prova do consumidor rodaria contra os arquivos do catalogo.
  const itens = loadDoctrines({ tars: catalogo, project: root }).map((d) =>
    classify(d, d.escopo === 'catalogo' ? catalogo : root, { tars: catalogo, projeto: root }),
  )
  const porStatus = Object.fromEntries(
    ['OK', 'PHANTOM', 'SEM GATE', 'DRIFT', 'PROJETO'].map((s) => [s, itens.filter((i) => i.status === s).length]),
  )
  const wiring = wiringCheck(root)
  // TARS-REC-1: o ledger de incidentes do PROJETO e' julgado aqui — a classe com >= 2
  // ocorrencias sem `destino` e' FALHA (o "X = 2" do dono). O ledger e' lido da raiz do
  // projeto (nao do catalogo): e' o consumidor quem acumula os incidentes.
  const ledgerPath = join(root, '.ai', 'memory', 'incident-ledger.jsonl')
  const ledgerEntries = existsSync(ledgerPath)
    ? readJsonl(ledgerPath).entries.filter((e) => e && typeof e === 'object' && !Array.isArray(e))
    : []
  const recorrencia = classesRecorrentes(ledgerEntries)
  const semGuarda = incidentesSemGuarda(ledgerEntries)
  const classesFalha = recorrencia.falhas.map((c) => ({
    id: `recorrencia/${c.classe}`,
    status: 'FALHA',
    onde: 'ci',
    gate: 'doctor',
    detalhe: `classe repetiu ${c.ocorrencias}x sem 'destino' (id do item de backlog) — ${c.entradas.join(', ')}`,
  }))
  // S3: so' julga quando o projeto declara `[secrets]`/`[identity]` (senao `null`). Cada linha
  // reprovada vira uma FALHA nomeada — a mesma forma das doutrinas, para o exit code e o
  // `--json` nao precisarem de um caminho novo.
  let segredos = null
  try {
    segredos = doctorDoProjeto(root, { env })
  } catch (e) {
    segredos = { ok: false, linhas: [{ nome: 'secrets', ok: false, detalhe: e.message }] }
  }
  const segredosFalha = (segredos?.linhas ?? [])
    .filter((l) => !l.ok)
    .map((l) => ({ id: `segredos/${l.nome}`, status: 'FALHA', onde: 'ci', gate: 'doctor', detalhe: l.detalhe }))
  return {
    tars: catalogo,
    project: root,
    itens,
    porStatus,
    wiring,
    segredos,
    // O TAMANHO DA DIVIDA da linha de base (B3.3): quantas violacoes adotadas o projeto
    // carrega por gate. Nao derruba o exit (e' divida declarada, nao regressao) — mas fica
    // VISIVEL, senao a base vira o lugar onde a violacao some de vista.
    divida: dividaBaseline(root),
    classes: recorrencia.classes,
    incidentes: { total: ledgerEntries.length, recorrentesSemGuarda: semGuarda.map((e) => e.id) },
    faltando: [
      ...itens.filter((i) => FALHA.includes(i.status)),
      ...(wiring.ok ? [] : [{ id: 'wiring/settings', status: 'FALHA' }]),
      ...classesFalha,
      ...segredosFalha,
    ],
  }
}

/** Uma linha por doutrina: `STATUS  id  onde  gate`, com o detalhe abaixo quando ha' o que dizer. */
export function format({ itens, porStatus, tars, project, wiring, classes, incidentes, segredos, divida }, log = console.log) {
  log(`tars doctor — ${itens.length} doutrina(s) · catalogo ${tars} · projeto ${project}`)
  for (const i of itens) {
    log(`${i.status.padEnd(9)} ${i.id}  [${i.onde}]  gate=${i.gate}`)
    if (i.status !== 'OK') log(`          ${i.detalhe}`)
  }
  // TARS-REC-1: a recorrencia por classe vem ANTES do resumo — e' o sinal que promove a
  // backlog; a classe que REPETIU (>= 2) sem destino aparece com FALHA.
  for (const c of classes ?? []) {
    const faltaDestino = c.ocorrencias >= 2 && !c.destino
    log(
      `${(faltaDestino ? 'FALHA' : 'OK').padEnd(9)} recorrencia/${c.classe}  [ci]  gate=doctor` +
        `  ${c.ocorrencias} ocorrencia(s)${c.destino ? ` -> ${c.destino}` : faltaDestino ? " sem 'destino'" : ''}`,
    )
  }
  // TARS-INCIDENTE-AUTO: a linha que o dono pediu — `INCIDENTES: N recorrentes sem guarda`.
  // Zero recorrentes ainda IMPRIME: saida ausente nao distingue "nada repetiu" de "o doctor
  // nao olhou". Sem guarda = a correcao nao cita commit nem arquivo (`citaGuarda`).
  if (incidentes) log(`INCIDENTES: ${incidentes.recorrentesSemGuarda.length} recorrentes sem guarda${incidentes.recorrentesSemGuarda.length ? ` (${incidentes.recorrentesSemGuarda.join(', ')})` : ''}`)
  // S3: as linhas de segredo/identidade so' aparecem quando o projeto declarou a tabela — a
  // saida ausente continua distinguindo "nao declarou" de "declarou e esta' tudo certo".
  if (segredos) {
    log(`\nSEGREDOS/IDENTIDADE (${segredos.ok ? 'ok' : 'FALHA'}):`)
    for (const l of segredos.linhas) log(`  ${(l.ok ? 'OK    ' : 'FALHA ')}${l.nome.padEnd(12)}  ${l.detalhe}`)
  }
  // B3.3: o tamanho da divida da linha de base, por gate. Zero TAMBEM imprime — saida
  // ausente nao distingue "sem base" de "base vazia" (nao esconder o que se decidiu adotar).
  if (divida) {
    log(`\nLINHA DE BASE (divida adotada): ${divida.total}`)
    for (const l of divida.linhas) log(`  ${String(l.n).padStart(4)}  ${l.gate}`)
    if (!divida.total) log('  (nenhuma — o gate cobra tudo)')
  }
  if (wiring) log(`${(wiring.ok ? 'OK' : 'FALHA').padEnd(9)} wiring/settings  [session-start]  ${wiring.detalhe}`)
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
