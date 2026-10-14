// `tars secrets git-credential` (dev.19) — o contrato do helper que o `git` chama.
//
// O que se prova aqui, e SO' isso: o PAT sai do CACHE (nunca do `op` em tempo real), a
// entrega e' SO' para os hosts DECLARADOS (host fora da lista = resposta vazia), `store` e
// `erase` sao no-op (o `erase` de um 401 NAO derruba o cache) e o protocolo do git
// (stdin `chave=valor`, stdout `username=`/`password=`) esta' respeitado.
//
// Nada toca `~/.config` de verdade (TARS_SECRETS_DIR no tmpfs) nem o 1Password: o mapa do
// cache entra por injecao (`mapaLeitor`), que e' exatamente a costura do modulo dono.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lerConfig, respostaCredential, run } from './tars-secrets.mjs'

const bases = []
const tmp = (p = 'tars-cred-') => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p))
  bases.push(d)
  return d
}
afterEach(() => {
  for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** Config resolvida no tmpfs do teste — `lerConfig` valida source/refs como em producao. */
const cfgDe = (secrets, dir) => lerConfig(secrets, { project: dir, env: { ...process.env, TARS_SECRETS_DIR: path.dirname(dir) } })

/** Cria o cache (o arquivo precisa EXISTIR: o helper recusa cache ausente). */
function comCache(dir, { git_credential = 'GITHUB_PAT', git_hosts = 'github.com' } = {}) {
  const cfg = cfgDe({ key_scope: 'project', source: 'automation', age_key_ref: 'op://tars/age/ref', git_credential, git_hosts }, dir)
  fs.mkdirSync(path.dirname(cfg.cache_file), { recursive: true })
  fs.writeFileSync(cfg.cache_file, 'cifrado-no-teste')
  return cfg
}

const leitor = (m) => () => m

describe('git-credential — protocolo do git', () => {
  it('entrega username/password do CACHE para o host declarado', () => {
    const cfg = comCache(tmp())
    const r = respostaCredential(cfg, 'protocol=https\nhost=github.com\n\n', { mapaLeitor: leitor({ GITHUB_PAT: 'ghp_segredo' }) })
    expect(r.entregue).toBe(true)
    expect(r.saida).toBe('username=x-access-token\npassword=ghp_segredo\n\n')
  })

  it('host FORA de `git_hosts` = resposta VAZIA (nunca erro): o git decide', () => {
    const cfg = comCache(tmp(), { git_hosts: 'github.com' })
    const r = respostaCredential(cfg, 'protocol=https\nhost=gitlab.com\n\n', { mapaLeitor: leitor({ GITHUB_PAT: 'x' }) })
    expect(r.entregue).toBe(false)
    expect(r.saida).toBe('')
  })

  it('pedido SEM host = resposta vazia, sem chamar o cache', () => {
    const cfg = comCache(tmp())
    let chamou = false
    const r = respostaCredential(cfg, 'protocol=https\n\n', {
      mapaLeitor: () => {
        chamou = true
        return {}
      },
    })
    expect(r.saida).toBe('')
    expect(chamou).toBe(false)
  })

  it('a comparacao de host IGNORA caixa (GitHub.com casa com github.com)', () => {
    const cfg = comCache(tmp(), { git_hosts: 'GitHub.com' })
    const r = respostaCredential(cfg, 'host=github.com\n', { mapaLeitor: leitor({ GITHUB_PAT: 'p' }) })
    expect(r.entregue).toBe(true)
  })

  it('a lista aceita VARIOS hosts separados por virgula', () => {
    const cfg = comCache(tmp(), { git_hosts: 'github.com, gitlab.com' })
    expect(respostaCredential(cfg, 'host=gitlab.com\n', { mapaLeitor: leitor({ GITHUB_PAT: 'p' }) }).entregue).toBe(true)
    expect(respostaCredential(cfg, 'host=bitbucket.org\n', { mapaLeitor: leitor({ GITHUB_PAT: 'p' }) }).saida).toBe('')
  })

  it('CRLF do git no Windows nao cola no valor', () => {
    const cfg = comCache(tmp())
    const r = respostaCredential(cfg, 'protocol=https\r\nhost=github.com\r\n\r\n', { mapaLeitor: leitor({ GITHUB_PAT: 'p' }) })
    expect(r.entregue).toBe(true)
  })

  it('chave ausente no cache GRITA nomeando-a', () => {
    const cfg = comCache(tmp(), { git_credential: 'GITHUB_PAT' })
    expect(() => respostaCredential(cfg, 'host=github.com\n', { mapaLeitor: leitor({ OUTRA: 'x' }) })).toThrow(/`GITHUB_PAT` nao esta' no cache/)
  })

  it('`git_hosts` declarado SEM `git_credential` grita (nao ha o que ler)', () => {
    const cfg = comCache(tmp(), { git_credential: '', git_hosts: 'github.com' })
    expect(() => respostaCredential(cfg, 'host=github.com\n', { mapaLeitor: leitor({}) })).toThrow(/`git_hosts` declarado mas `git_credential`/)
  })

  it('cache ausente grita dizendo o comando que o cria', () => {
    const dir = tmp()
    const cfg = cfgDe({ key_scope: 'project', source: 'automation', age_key_ref: 'op://tars/age/ref', git_credential: 'GITHUB_PAT', git_hosts: 'github.com' }, dir)
    fs.rmSync(cfg.cache_file, { force: true })
    expect(() => respostaCredential(cfg, 'host=github.com\n', { mapaLeitor: leitor({ GITHUB_PAT: 'p' }) })).toThrow(/cache ausente.*tars secrets refresh/)
  })

  it('nome de chave invalido e recusado SEM ecoar o valor', () => {
    const invalido = 'op://cofre/item/pat-no-lugar-errado'
    const cfg = comCache(tmp(), { git_credential: invalido, git_hosts: 'github.com' })
    // A mensagem NAO pode conter o valor do campo — so' a regra, nunca o conteudo.
    let msg = ''
    try {
      respostaCredential(cfg, 'host=github.com\n', { mapaLeitor: leitor({}) })
    } catch (e) {
      msg = e.message
    }
    expect(msg).toMatch(/NAO ecoado/)
    expect(msg).not.toContain(invalido)
  })
})

describe('git-credential — store/erase sao no-op', () => {
  it('store e erase nao tocam o cache e saem com 0', () => {
    const dir = tmp()
    const cfg = comCache(dir)
    const antes = fs.readFileSync(cfg.cache_file, 'utf8')
    // O despacho do subcomando: nao ha valor nenhum a gravar; o contrato e' sair 0 sem tocar.
    for (const verbo of ['store', 'erase']) {
      const r = run({ sub: 'git-credential', rest: [verbo], cfg })
      expect(r.status).toBe(0)
      expect(r.saida).toBe('')
    }
    expect(fs.readFileSync(cfg.cache_file, 'utf8')).toBe(antes)
  })

  it('um verbo desconhecido grita nomeando os tres validos', () => {
    const cfg = comCache(tmp())
    expect(() => run({ sub: 'git-credential', rest: ['inventado'], cfg })).toThrow(/get\|store\|erase/)
  })
})
