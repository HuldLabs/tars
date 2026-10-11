// `tars acessos daneel` — o contrato. Os dois casos que importam sao NEGATIVOS:
//   1. nenhuma saida pode conter padrao de segredo (o inventario e' read-only sobre o cofre);
//   2. falta de credencial NAO pode virar um inventario mentiroso (vira "(indisponivel)").
// Tudo roda SEM REDE: os coletores recebem `gh`/`op`/`ssh`/`run` falsos.
import { describe, expect, it } from 'vitest'
import { assertSemSegredo, checarDrift, coletar1Password, coletarGitHub, coletarHosts, compararDrift, gerarAcessos, montarInventario, renderInventario } from './tars-acessos.mjs'

/** `gh` falso: responde por rota da API; rota fora do mapa = falha (o que o caso negativo quer). */
const ghFalso = (rotas) => (args) => {
  const rota = args.slice(1).filter((a) => a !== '--paginate' && !a.startsWith('--jq')).join(' ')
  // `gh api user --jq .login` imprime TEXTO puro; as demais rotas, JSON.
  const v = Object.entries(rotas).find(([k]) => rota === k || rota.startsWith(`${k}?`) || rota.startsWith(`${k} `))?.[1]
  if (v === undefined) return { ok: true, out: 'null' }
  return { ok: true, out: args.includes('--jq') ? String(v.login ?? v) : JSON.stringify(v) }
}
/** `gh` que so' responde `user` (sem orgs) — o caso "auth ok, nada visivel". */
const ghSemCredencial = () => () => ({ ok: false, out: '' })

const GH_OK = {
  'user': { login: 'daneel-bot' },
  'user/orgs': [{ login: 'HuldLabs' }],
  'orgs/HuldLabs/repos': [
    { full_name: 'HuldLabs/tars', private: true, permissions: { push: true } },
    { full_name: 'HuldLabs/.github', private: false, permissions: { admin: true } },
    { full_name: 'HuldLabs/leitura', private: false, permissions: { pull: true } },
  ],
  'user/repos': [],
  'user/repository_invitations': [{ repository: { full_name: 'HuldLabs/novo' }, expires_at: '2026-11-01T00:00:00Z' }],
  'user/memberships/orgs': [{ state: 'pending', organization: { login: 'growthsbr' } }],
}
const ghOk = ghFalso(GH_OK)

const opFalso = (cofres, itens, detalhe) => (args) => {
  const k = args.join(' ')
  if (k.startsWith('vault list')) return { ok: true, out: JSON.stringify(cofres) }
  if (k.startsWith('item list')) return { ok: true, out: JSON.stringify(itens) }
  if (k.startsWith('item get')) return { ok: true, out: JSON.stringify(detalhe) }
  return { ok: false, out: '' }
}
const opOk = opFalso(
  [{ id: 'v1', name: 'secrets' }],
  [{ id: 'i1', title: 'daneel-bot' }],
  [{ label: 'github/pat' }, { label: 'homelab/auth-ssh-key-private' }],
)

const sshFalso = (acesso, sudo) => (host, cmd) => {
  if (cmd[0] === 'sudo') return { ok: sudo, out: '' }
  return { ok: acesso, out: '' }
}
const runFalso = () => (cmd) => ({ ok: true, out: `${cmd} versao 1.2.3` })

const montarOk = () => montarInventario({ gh: ghOk, op: opOk, ssh: sshFalso(true, true), run: runFalso() })

describe('guarda de segredo — o caso que reprova', () => {
  it('recusa texto com chave PEM', () => {
    expect(() => assertSemSegredo('-----BEGIN OPENSSH PRIVATE KEY-----')).toThrow(/SEGREDO/)
  })
  it('recusa texto com token do GitHub', () => {
    expect(() => assertSemSegredo(`token=${'ghp_'}${'a'.repeat(36)}`)).toThrow(/SEGREDO/)
  })
  it('aceita o inventario limpo', () => {
    expect(() => assertSemSegredo(renderInventario(montarOk()))).not.toThrow()
  })
  it('recusa token com prefixo ghp_x', () => {
    expect(() => assertSemSegredo(`token ghp_x${'c'.repeat(36)}`)).toThrow(/SEGREDO/)
  })
  it('o fluxo inteiro para ANTES de gravar se a saida casar segredo', () => {
    const envenenado = (args) => (args.join(' ').startsWith('item list')
      ? { ok: true, out: JSON.stringify([{ id: 'i1', title: `ghp_x${'b'.repeat(36)}` }]) }
      : opOk(args))
    expect(() => gerarAcessos({ gh: ghOk, op: envenenado, ssh: sshFalso(true, true), run: runFalso() })).toThrow(/SEGREDO/)
  })
})

describe('GitHub — read-only, sem token na saida', () => {
  it('lista repos com visibilidade e nivel de permissao', () => {
    const g = coletarGitHub({ gh: ghOk })
    expect(g.login).toBe('daneel-bot')
    expect(g.orgs).toEqual(['HuldLabs'])
    expect(g.repos.find((r) => r.nome === 'HuldLabs/tars')).toMatchObject({ visibilidade: 'privado', nivel: 'push' })
    expect(g.repos.find((r) => r.nome === 'HuldLabs/.github')).toMatchObject({ visibilidade: 'publico', nivel: 'admin' })
  })
  it('lista convites pendentes de repo e de org', () => {
    const g = coletarGitHub({ gh: ghOk })
    expect(g.convites.map((c) => c.repo)).toContain('HuldLabs/novo')
    expect(g.convitesOrg.map((c) => c.org)).toContain('growthsbr')
  })
  it('sem credencial vira indisponivel, nunca inventario vazio passando por bom', () => {
    expect(coletarGitHub({ gh: ghSemCredencial() })).toMatchObject({ ok: false })
  })
})

describe('1Password — so nomes, nunca valores', () => {
  it('lista cofre, item e nomes de campo', () => {
    const op = coletar1Password({ op: opOk })
    expect(op.ok).toBe(true)
    expect(op.cofres[0].nome).toBe('secrets')
    expect(op.cofres[0].itens[0]).toMatchObject({ titulo: 'daneel-bot' })
    expect(op.cofres[0].itens[0].campos).toContain('github/pat')
  })
  it('sem service account vira indisponivel', () => {
    expect(coletar1Password({ op: () => ({ ok: false, out: '' }) })).toMatchObject({ ok: false })
  })
  it('o markdown nunca chama `op read` (nenhum valor pode ser buscado)', () => {
    const chamadas = []
    const espiao = (args) => { chamadas.push(args.join(' ')); return opOk(args) }
    renderInventario(montarInventario({ gh: ghOk, op: espiao, ssh: sshFalso(true, true), run: runFalso() }))
    expect(chamadas.some((c) => c.startsWith('read'))).toBe(false)
  })
})

describe('Hosts SSH e ferramentas', () => {
  it('reporta entra/sudo por host', () => {
    expect(coletarHosts({ ssh: sshFalso(true, false), hosts: ['h1'] }).hosts[0]).toMatchObject({ entra: true, sudo: false })
  })
  it('host inacessivel nao derruba a coleta', () => {
    expect(coletarHosts({ ssh: sshFalso(false, false), hosts: ['h1'] }).hosts[0]).toMatchObject({ entra: false, motivo: expect.any(String) })
  })
})

describe('render — estavel para o diff de drift', () => {
  it('ordena os repos por nome (duas geracoes iguais dao markdown igual)', () => {
    const md = renderInventario(montarOk())
    const nomes = [...md.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1])
    expect(nomes).toEqual([...nomes].sort())
  })
  it('falta de credencial aparece como indisponivel na secao', () => {
    const md = renderInventario(montarInventario({ gh: ghSemCredencial(), op: () => ({ ok: false, out: '' }), ssh: sshFalso(false, false), run: runFalso() }))
    expect(md).toContain('indisponivel')
  })
})

describe('check — drift (gerado x commitado)', () => {
  const mdOk = () => renderInventario(montarOk())

  it('a DATA de geracao nao conta como drift', () => {
    const a = mdOk().replace(/^Gerado em .*/m, 'Gerado em 2026-01-01 — x')
    const b = mdOk().replace(/^Gerado em .*/m, 'Gerado em 2026-12-31 — y')
    expect(compararDrift({ commitado: a, novo: b })).toEqual([])
  })

  it('repo novo visivel = drift (nomeado com +)', () => {
    const commitado = mdOk()
    const novo = commitado.replace('| `HuldLabs/tars` |', '| `HuldLabs/novo-repo` | privado | admin |\n| `HuldLabs/tars` |')
    const d = compararDrift({ commitado, novo })
    expect(d.some((l) => l.startsWith('+') && l.includes('novo-repo'))).toBe(true)
  })

  it('sem commitado = nao inventa drift (ok, "nada a comparar")', () => {
    const r = checarDrift({ commitado: null, novo: mdOk() })
    expect(r.ok).toBe(true)
    expect(r.motivo).toMatch(/sem inventario commitado/)
  })

  it('commitado igual = em dia', () => {
    expect(checarDrift({ commitado: mdOk(), novo: mdOk() }).ok).toBe(true)
  })

  it('commitado divergente = ok:false com as linhas', () => {
    const r = checarDrift({ commitado: mdOk().replace('HuldLabs/tars', 'HuldLabs/removido'), novo: mdOk() })
    expect(r.ok).toBe(false)
    expect(r.divergentes.length).toBeGreaterThan(0)
  })
})
