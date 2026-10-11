#!/usr/bin/env node
// `tars acessos daneel` — GERA o inventario de acessos da Daneel (`acessos/daneel.md`).
// Fase 3 da tarefa "Daneel como agente de verdade" (fonte: /workspace/.cache/daneel-arquitetura.md
// secao 4). O padrao vem do mercado (Steampipe/nhi-scan `diff` de inventario): o inventario e'
// GERADO, nunca escrito a mao, e a divergencia entre duas geracoes e' o DRIFT.
//
// PORQUE EXISTE: a skill `.ai/skills/daneel/SKILL.md` APONTA para o inventario; se o inventario
// fosse lista mantida a mao, viraria uma segunda fonte de verdade sobre acesso (morre por drift).
//
// GARANTIAS (o que torna o script seguro para rodar contra o cofre):
//   1. READ-ONLY: so' GET/list/read. Nunca cria, edita ou apaga nada em GitHub/1Password/host.
//   2. NUNCA imprime VALOR de segredo: GitHub usa a API (nao mostra token); 1Password lista
//      cofres/itens/campos por NOME (nunca `op read`); a saida passa por `assertSemSegredo`.
//   3. Falta credencial = seccao vira "(indisponivel: <motivo>)", nunca um inventario mentiroso.
//
// Uso:
//   tars acessos daneel [--out <arquivo.md>] [--json]   GERA o inventario
//   tars acessos check  [--out <arquivo.md>]            testa cada acesso e compara com o
//                                                       commitado (drift); != 0 quando diverge
//   node tools/framework/tars-acessos.mjs daneel --out /tmp/acessos/daneel.md
//
// Testes rodam SEM REDE: os coletores recebem `run`/`gh`/`op` injetados (o default fala com o
// mundo de verdade). Ver `tars-acessos.test.mjs`.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { findSecrets } from './secrets-patterns.mjs'

/** Orgs que a Daneel atende hoje (fonte: `.cache/gh-daneel-push.sh`). Configuravel pelo caller. */
export const ORGS_PADRAO = ['HuldLabs', 'growthsbr', 'FabberLabs']
/** Hosts SSH do homelab (fonte: `.cache/hi/hosts/nuc.py`). Configuravel pelo caller. */
export const HOSTS_PADRAO = ['nuc.czul.net']
/** Ferramentas cuja versao entra no inventario. */
export const FERRAMENTAS_PADRAO = ['op', 'gh', 'git', 'docker', 'uv']

/**
 * O commando default: roda um processo e devolve `{ ok, out }` trimado (nunca lanca).
 * `env` extra permite injetar `OP_SERVICE_ACCOUNT_TOKEN` sem tocar no ambiente global.
 */
function runnerDefault(cmd, args, { env, input, timeout = 20000 } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout,
    input,
    env: env ? { ...process.env, ...env } : process.env,
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  return { ok: r.status === 0, out }
}

/**
 * Guarda de conteudo: a saida NUNCA pode casar padrao de segredo. Reusa a lista unica do Tars
 * (`secrets-patterns.mjs`, R3) — o mesmo arquivo que o pre-commit usa. Reprova ALTO se casar.
 */
export function assertSemSegredo(texto) {
  const hits = findSecrets(texto)
  if (hits.length) throw new Error(`inventario contem padrao de SEGREDO (${hits.join(', ')}): recusado antes de gravar`)
}

/** `gh api <rota>` -> JSON parseado; `null` quando falha (a secao reporta "(indisponivel)"). */
function ghJson(gh, rota) {
  const r = gh(['api', rota, '--paginate'])
  if (!r.ok) return null
  // `--paginate` concatena arrays; quando a API devolve um objeto unico, nao ha' o que juntar.
  try {
    return JSON.parse(r.out)
  } catch {
    return null
  }
}

/** Contas/orgs/repos visiveis + convites pendentes. Nunca imprime token (a API autentica sozinha). */
export function coletarGitHub({ gh }) {
  const eu = gh(['api', 'user', '--jq', '.login'])
  const login = eu.ok ? eu.out.trim() : null
  if (!login) return { ok: false, motivo: 'sem credencial do gh (rode como Daneel)' }

  const orgs = (ghJson(gh, 'user/orgs') ?? []).map((o) => o.login)
  const repos = []
  for (const org of orgs) {
    const lista = ghJson(gh, `orgs/${org}/repos?per_page=100&type=all`) ?? []
    for (const r of lista) {
      const p = r.permissions ?? {}
      repos.push({
        org,
        nome: r.full_name,
        visibilidade: r.private ? 'privado' : 'publico',
        nivel: p.admin ? 'admin' : p.push ? 'push' : p.pull ? 'pull' : 'nenhum',
      })
    }
  }
  // Repos de usuario (nao-org) entram com o login como "org".
  const meus = ghJson(gh, 'user/repos?per_page=100&affiliation=owner') ?? []
  for (const r of meus) {
    if (repos.some((x) => x.nome === r.full_name)) continue
    const p = r.permissions ?? {}
    repos.push({ org: login, nome: r.full_name, visibilidade: r.private ? 'privado' : 'publico', nivel: p.admin ? 'admin' : p.push ? 'push' : 'pull' })
  }
  const convites = (ghJson(gh, 'user/repository_invitations') ?? []).map((i) => ({ repo: i.repository?.full_name ?? '?', expira: i.expires_at?.slice(0, 10) ?? '-' }))
  const convitesOrg = (ghJson(gh, 'user/memberships/orgs') ?? []).filter((m) => m.state === 'pending').map((m) => ({ org: m.organization?.login ?? '?' }))
  return { ok: true, login, orgs, repos, convites, convitesOrg }
}

/**
 * Cofres e NOMES de itens/campos que a SA enxerga (`op vault list`, `op item list`, `op item get
 * --format=json`). NUNCA `op read`/`--reveal`: nenhum valor sai do cofre. Falha em um item nao
 * derruba o resto.
 */
export function coletar1Password({ op }) {
  const vaults = op(['vault', 'list', '--format=json'])
  if (!vaults.ok) return { ok: false, motivo: 'sem service account do 1Password' }
  let lista
  try {
    lista = JSON.parse(vaults.out)
  } catch {
    return { ok: false, motivo: 'resposta ilegivel do op vault list' }
  }
  const cofres = []
  for (const v of lista) {
    const itens = op(['item', 'list', '--vault', v.id, '--format=json'])
    let arr = []
    try {
      arr = itens.ok ? JSON.parse(itens.out) : []
    } catch {
      arr = []
    }
    const comCampos = []
    for (const it of arr) {
      const det = op(['item', 'get', it.id, '--format=json', '--fields', 'label'])
      let campos = []
      try {
        const obj = det.ok ? JSON.parse(det.out) : null
        if (Array.isArray(obj)) campos = obj.map((f) => f.label).filter(Boolean)
        else if (obj?.fields) campos = obj.fields.map((f) => f.label).filter(Boolean)
      } catch {
        campos = []
      }
      comCampos.push({ titulo: it.title, campos })
    }
    cofres.push({ nome: v.name, itens: comCampos })
  }
  return { ok: true, cofres }
}

/** Hosts SSH: entra? sudo sem senha? — testado com `true` e `sudo -n true`, nunca com segredo. */
export function coletarHosts({ ssh, hosts = HOSTS_PADRAO }) {
  const lista = []
  for (const host of hosts) {
    const entra = ssh(host, ['true'])
    if (!entra.ok) {
      lista.push({ host, entra: false, sudo: null, motivo: 'sem acesso com a chave da Daneel' })
      continue
    }
    const sudo = ssh(host, ['sudo', '-n', 'true'])
    lista.push({ host, entra: true, sudo: sudo.ok })
  }
  return { ok: true, hosts: lista }
}

/** Versoes das ferramentas (uma linha cada). Ferramenta ausente nao derruba a secao. */
export function coletarFerramentas({ run, ferramentas = FERRAMENTAS_PADRAO }) {
  return {
    ok: true,
    ferramentas: ferramentas.map((f) => {
      const r = run(f, ['--version'])
      return { nome: f, versao: r.ok ? r.out.split('\n')[0].trim() : '(ausente)' }
    }),
  }
}

/**
 * Monta o inventario como DADOS (nao markdown) — o markdown e' so' a projecao. Assim o mesmo
 * resultado serve para `--json` e para o `diff` de drift entre duas geracoes.
 */
export function montarInventario({ gh, op, ssh, run, orgs = ORGS_PADRAO, hosts = HOSTS_PADRAO, ferramentas = FERRAMENTAS_PADRAO } = {}) {
  return {
    gerado_em: new Date().toISOString().slice(0, 10),
    github: coletarGitHub({ gh }),
    onepassword: coletar1Password({ op }),
    hosts: coletarHosts({ ssh, hosts }),
    ferramentas: coletarFerramentas({ run, ferramentas }),
    orgs_consultadas: orgs,
  }
}

/** Projecao do inventario em markdown. Ordena repos para o `diff` de drift ser estavel. */
export function renderInventario(inv) {
  const L = ['# Acessos da Daneel', '', `Gerado em ${inv.gerado_em} — NAO editar a mao (rode \`tars acessos daneel\`).`, '']

  L.push('## GitHub')
  if (!inv.github.ok) L.push(`- _(indisponivel: ${inv.github.motivo})_`)
  else {
    L.push(`- Conta: \`${inv.github.login}\``)
    L.push(`- Orgs: ${inv.github.orgs.join(', ') || '-'}`)
    L.push('', '| Repo | Visibilidade | Permissao |', '|---|---|---|')
    for (const r of [...inv.github.repos].sort((a, b) => a.nome.localeCompare(b.nome))) {
      L.push(`| \`${r.nome}\` | ${r.visibilidade} | ${r.nivel} |`)
    }
    L.push('', `- Convites pendentes (repo): ${inv.github.convites.map((c) => c.repo).join(', ') || '-'}`)
    L.push(`- Convites pendentes (org): ${inv.github.convitesOrg.map((c) => c.org).join(', ') || '-'}`)
  }

  L.push('', '## 1Password')
  if (!inv.onepassword.ok) L.push(`- _(indisponivel: ${inv.onepassword.motivo})_`)
  else {
    for (const v of inv.onepassword.cofres) {
      L.push(`- **\`${v.nome}\`** (${v.itens.length} itens)`)
      for (const it of v.itens) L.push(`  - \`${it.titulo}\` — campos: ${it.campos.join(', ') || '-'}`)
    }
    L.push('', '_Somente nomes: nenhum valor de campo e lido ou registrado._')
  }

  L.push('', '## Hosts SSH')
  if (!inv.hosts.ok) L.push('- _(indisponivel)_')
  else {
    L.push('| Host | Entra | sudo (NOPASSWD) |', '|---|---|---|')
    for (const h of inv.hosts.hosts) L.push(`| ${h.host} | ${h.entra ? 'sim' : 'nao'} | ${h.sudo === null ? '-' : h.sudo ? 'sim' : 'nao'} |`)
  }

  L.push('', '## Ferramentas')
  for (const f of inv.ferramentas.ferramentas) L.push(`- \`${f.nome}\`: ${f.versao}`)
  L.push('')
  return L.join('\n')
}

/**
 * Fluxo completo: coleta -> monta -> RENDERIZA -> GUARDA contra segredo -> grava.
 * A guarda roda no TEXTO FINAL (o artefato), nao na entrada — e' o que de fato vai para o disco.
 */
export function gerarAcessos({ gh, op, ssh, run, hosts, ferramentas, out, log = console.log } = {}) {
  const inv = montarInventario({ gh, op, ssh, run, hosts, ferramentas })
  const md = renderInventario(inv)
  assertSemSegredo(md)
  if (out) {
    const alvo = resolve(out)
    mkdirSync(dirname(alvo), { recursive: true })
    writeFileSync(alvo, md)
    log(`inventario escrito em ${alvo}`)
  }
  return { inv, md }
}

/** As dependencias de verdade (falam com o mundo) — os testes injetam as suas. */
export function depsReais(env = process.env) {
  const opEnv = env.OP_SERVICE_ACCOUNT_TOKEN ? { OP_SERVICE_ACCOUNT_TOKEN: env.OP_SERVICE_ACCOUNT_TOKEN } : undefined
  return {
    gh: (args) => runnerDefault('gh', args),
    op: (args) => runnerDefault('op', args, { env: opEnv }),
    ssh: (host, cmd) => runnerDefault('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', `daneel@${host}`, ...cmd]),
    run: (cmd, args) => runnerDefault(cmd, args),
  }
}

/**
 * DRIFT: a geracao nova contra a COMMITADA. A DATA de geracao e' ruido (muda toda vez) e sai
 * da comparacao — o que importa e' a lista de acessos. Devolve `null` quando nao ha' o que
 * comparar (arquivo commitado ausente = primeiro commit, nao e' drift), senao a lista de
 * linhas que divergem (com o sinal `+`/`-`), na ordem do arquivo novo.
 */
export function compararDrift({ commitado, novo }) {
  if (commitado == null) return null
  const limpa = (s) => String(s).split('\n').filter((l) => !/^Gerado em /.test(l))
  const a = limpa(commitado)
  const b = limpa(novo)
  if (a.join('\n') === b.join('\n')) return []
  const setA = new Set(a)
  const setB = new Set(b)
  const divergentes = []
  for (const l of a) if (!setB.has(l)) divergentes.push(`- ${l}`)
  for (const l of b) if (!setA.has(l)) divergentes.push(`+ ${l}`)
  return divergentes
}

/** Le o inventario commitado no caminho dado (ou `null` quando o arquivo ainda nao existe). */
export function lerCommitado(arquivo) {
  if (!arquivo || !existsSync(resolve(arquivo))) return null
  return readFileSync(resolve(arquivo), 'utf8')
}

/**
 * `tars acessos check [--out <arquivo.md>]` — TESTA cada acesso de verdade (mesma coleta do
 * `daneel`) e compara com o inventario COMMITADO. Divergencia = drift: alguem mudou acesso
 * (org/repo/host/cofre) sem regenerar. Saida != 0 quando ha' drift (R4 — falha alta).
 * Sem arquivo commitado, o check nao inventa drift: reporta "nada a comparar".
 */
export function checarDrift({ commitado, novo } = {}) {
  const divergentes = compararDrift({ commitado, novo })
  if (divergentes === null) return { ok: true, motivo: 'sem inventario commitado para comparar (rode `tars acessos daneel --out <arquivo>`)', divergentes: [] }
  return { ok: divergentes.length === 0, motivo: divergentes.length ? `${divergentes.length} linha(s) divergem do commitado` : 'inventario em dia (nenhum drift)', divergentes }
}

/** `tars acessos <sub>` — despacho fino; o julgamento mora nas funcoes acima. */
export function runAcessos({ sub, rest = [], env = process.env, log = console.log } = {}) {
  const i = rest.indexOf('--out')
  const out = i === -1 ? null : rest[i + 1]
  if (sub === 'daneel') {
    const { md } = gerarAcessos({ ...depsReais(env), out, log })
    if (!out || rest.includes('--json')) log(md)
    return { md }
  }
  if (sub === 'check') {
    const { md } = gerarAcessos({ ...depsReais(env) })
    const commitado = out ? lerCommitado(out) : null
    const r = checarDrift({ commitado, novo: md })
    log(`tars acessos check — ${r.motivo}`)
    for (const d of r.divergentes) log(`  ${d}`)
    if (!r.ok) process.exitCode = 1
    return r
  }
  throw new Error(`use \`tars acessos daneel|check [--out <arquivo.md>]\` (recebi '${sub ?? ''}')`)
}
