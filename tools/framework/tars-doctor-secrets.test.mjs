// `tars doctor` de segredos (S3, dev.9) — o contrato: o que o `check` ja' julga entra
// INTACTO, e so' o que o ATOR e o TEMPO explicam e' acrescentado (idade do cache, transporte
// e push por ator, scan rapido). Um caso VERDE e um VERMELHO por item; nenhum abre o cofre.
//
// Segredo falso e' montado em RUNTIME (`['AKIA','IOSF...'].join('')`): um literal no FONTE
// seria barrado pelo proprio guard de conteudo do pre-commit.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  check,
  commitsNaoEmpurrados,
  doctor,
  doctorDoProjeto,
  idadeCache,
  lerConfig,
  pushPorAtor,
  scanRapido,
  transportePorAtor,
} from './tars-secrets.mjs'

const bases = []
const tmp = (p = 'tars-doctor-') => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p))
  bases.push(d)
  return d
}
afterEach(() => {
  for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** A config do projeto de teste: `TARS_SECRETS_DIR` isola perfil e caminhos no tmp. */
const cfgDe = (secrets, dir) =>
  lerConfig(
    { age_key_ref: 'op://tars/age-key/ref', source: 'owner', ...secrets },
    { project: dir, env: { ...process.env, TARS_SECRETS_DIR: path.dirname(dir) } },
  )

const ENV_LIMPO = {}
/** `git` falso: responde so' o que o caso pergunta. */
const gitFalso = (mapa) => (bin, args) => ({ status: mapa[args.join(' ')] === undefined ? 1 : 0, stdout: mapa[args.join(' ')] ?? '' })

describe('S3/1 — o doctor herda TUDO do check', () => {
  it('VERDE: as primeiras linhas sao as mesmas do check (uma fonte so, R3)', () => {
    const dir = tmp()
    const cfg = cfgDe({}, dir)
    const c = check(cfg, { env: ENV_LIMPO })
    const d = doctor(cfg, { env: ENV_LIMPO, ator: 'human', remote: null, commits: { semUpstream: false, n: 0 }, gh: false })
    expect(d.linhas.slice(0, c.linhas.length)).toEqual(c.linhas)
  })

  it('VERMELHO: chave age ausente reprova no doctor igual reprova no check', () => {
    const dir = tmp()
    const cfg = cfgDe({}, dir)
    const d = doctor(cfg, { env: ENV_LIMPO, ator: 'human', remote: null, commits: { semUpstream: false, n: 0 }, gh: false })
    expect(d.ok).toBe(false)
    expect(d.linhas.find((l) => l.nome === 'chave')).toMatchObject({ ok: false })
  })
})

describe('S3/2 — idade do cache', () => {
  it('VERDE: cache recem-escrito fica dentro do max e nao avisa', () => {
    const dir = tmp()
    const cfg = cfgDe({}, dir)
    fs.writeFileSync(cfg.cache_file, '{}')
    const d = doctor(cfg, { env: ENV_LIMPO, ator: 'human', remote: null, commits: { semUpstream: false, n: 0 }, gh: false })
    const linha = d.linhas.find((l) => l.nome === 'cache_idade')
    expect(idadeCache(cfg)).toBe(0)
    expect(linha.detalhe).toContain(`(max 30)`)
    expect(linha.detalhe).not.toContain('AVISO')
  })

  it('VERMELHO: cache de 60 dias avisa "rode refresh"', () => {
    const dir = tmp()
    const cfg = cfgDe({}, dir)
    fs.writeFileSync(cfg.cache_file, '{}')
    const velho = new Date(Date.now() - 60 * 86400000)
    fs.utimesSync(cfg.cache_file, velho, velho)
    const d = doctor(cfg, { env: ENV_LIMPO, ator: 'human', remote: null, commits: { semUpstream: false, n: 0 }, gh: false })
    expect(idadeCache(cfg)).toBe(60)
    expect(d.linhas.find((l) => l.nome === 'cache_idade').detalhe).toContain('tars secrets refresh')
  })

  it('o projeto pode declarar outro max via cache_max_dias', () => {
    const dir = tmp()
    const cfg = cfgDe({ cache_max_dias: 1 }, dir)
    fs.writeFileSync(cfg.cache_file, '{}')
    const ontem = new Date(Date.now() - 3 * 86400000)
    fs.utimesSync(cfg.cache_file, ontem, ontem)
    expect(cfg.cache_max_dias).toBe(1)
  })
})

describe('S3/3 — transporte por ator (licao 7)', () => {
  it('VERDE: humano nao e julgado; agente em HTTPS passa', () => {
    expect(transportePorAtor({ ator: 'human', remote: 'git@github.com:x/y.git' }).ok).toBe(true)
    expect(transportePorAtor({ ator: 'agent', remote: 'https://github.com/x/y.git' }).ok).toBe(true)
  })

  it('VERMELHO: agente com remote SSH, com o socket do 1Password, ou gh em texto', () => {
    expect(transportePorAtor({ ator: 'agent', remote: 'git@github.com:x/y.git' })).toMatchObject({ ok: false })
    expect(transportePorAtor({ ator: 'agent', remote: 'ssh://git@host/x' })).toMatchObject({ ok: false })
    expect(transportePorAtor({ ator: 'agent', env: { SSH_AUTH_SOCK: '/home/u/.1password/agent.sock' } })).toMatchObject({ ok: false })
    expect(transportePorAtor({ ator: 'agent', ghTexto: true })).toMatchObject({ ok: false })
  })
})

describe('S3/4 — push por ator (licao 9)', () => {
  it('VERDE: humano nao acusa; agente sem pendencia passa', () => {
    expect(pushPorAtor({ ator: 'human', commits: { semUpstream: true, n: null } }).ok).toBe(true)
    expect(pushPorAtor({ ator: 'agent', commits: { semUpstream: false, n: 0 } }).ok).toBe(true)
  })

  it('VERMELHO: agente com commit local nao empurrado ou sem upstream', () => {
    expect(pushPorAtor({ ator: 'agent', commits: { semUpstream: false, n: 3 } })).toMatchObject({ ok: false })
    expect(pushPorAtor({ ator: 'agent', commits: { semUpstream: true, n: null } })).toMatchObject({ ok: false })
  })

  it('commitsNaoEmpurrados le o git: upstream com 2 commits e branch sem upstream', () => {
    const comUp = gitFalso({ 'rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/x\n', 'rev-list --count @{u}..HEAD': '2\n' })
    expect(commitsNaoEmpurrados({ git: comUp })).toEqual({ semUpstream: false, n: 2 })
    expect(commitsNaoEmpurrados({ git: gitFalso({}) })).toEqual({ semUpstream: true, n: null })
  })
})

describe('S3/5 — scan rapido (so env e rc)', () => {
  const fsSemRc = { existsSync: () => false, readFileSync: () => '' }

  it('VERDE: env e rc limpos', () => {
    expect(scanRapido({ env: { PATH: '/usr/bin' }, fs: fsSemRc })).toMatchObject({ ok: true })
  })

  it('VERMELHO: valor de segredo no env acusa o NOME, nunca o valor', () => {
    const falso = ['AKIA', 'IOSFODNN7EXAMPLE'].join('')
    const r = scanRapido({ env: { MINHA_CHAVE: falso }, fs: fsSemRc })
    expect(r.ok).toBe(false)
    expect(r.detalhe).toContain('MINHA_CHAVE')
    expect(r.detalhe).not.toContain(falso)
  })
})

describe('S3 — doctorDoProjeto so age com opt-in', () => {
  it('projeto sem [secrets]/[identity] devolve null (o doctor nao inventa checagem)', () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, '.ai'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.ai', 'tars.toml'), '[tars]\nversion = "1.0.0"\n')
    expect(doctorDoProjeto(dir)).toBeNull()
  })

  it('com [secrets] devolve as linhas; config invalida vira FALHA, nao excecao', () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, '.ai'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.ai', 'tars.toml'), '[secrets]\nage_key_ref = "op://tars/age-key/ref"\n')
    const r = doctorDoProjeto(dir, { env: { ...process.env, TARS_SECRETS_DIR: path.dirname(dir) } })
    expect(Array.isArray(r.linhas)).toBe(true)
    // Sem `source` o `lerConfig` GRITA — o doctor transforma isso na linha `secrets`.
    expect(r.ok).toBe(false)
    expect(r.linhas[0].nome).toBe('secrets')
  })
})
