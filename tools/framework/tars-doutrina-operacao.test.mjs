// `doutrina-operacao` (B1.1 layout / B1.2 compose): a regra julga CAMINHO e NOME — o teste
// roda o julgamento puro, nao le' arquivo. As duas provas do `.ai/doctrines.toml`
// (`--str /data`, `--name local`) tem de REPROVAR: se passarem, o doctor acusa PHANTOM.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AMBIENTES, julgaCompose, julgaLayout, parseArgs } from '../../.ai/gates/doutrina-operacao.mjs'

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.ai', 'gates', 'doutrina-operacao.mjs')

describe('julgaLayout — B1.1 /srv/<amb>/<app>', () => {
  it('aceita o layout do host e nomeia o ambiente e o app', () => {
    expect(julgaLayout('/srv/prod/nuc/data')).toMatchObject({ ok: true, amb: 'prod', app: 'nuc' })
    expect(julgaLayout('/srv/dev/kipp/conf')).toMatchObject({ ok: true, amb: 'dev', app: 'kipp' })
  })

  it('reprova o que esta fora de /srv — a prova do catalogo e o caso arquetipico', () => {
    for (const p of ['/data', '/mnt/d/app', '/opt/nuc', 'srv/prod/nuc', '/srv/prod'])
      expect(julgaLayout(p).ok).toBe(false)
  })

  it('reprova ambiente apelido (o `local` do exemplo) e app fora do padrao', () => {
    expect(julgaLayout('/srv/local/nuc/data').porque).toMatch(/ambiente 'local' desconhecido/)
    expect(julgaLayout('/srv/prod/Nuc_1/data').ok).toBe(false)
  })

  it('a lista de ambientes e o dado que o `--amb` troca', () => {
    expect(AMBIENTES).toEqual(['dev', 'stg', 'prod'])
    expect(julgaLayout('/srv/homolog/nuc/data', { ambientes: ['homolog'] }).ok).toBe(true)
  })
})

describe('julgaCompose — B1.2 ambiente e projeto compose', () => {
  it('aceita `name: <app>-<amb>` e os binds no layout', () => {
    const r = julgaCompose({ nome: 'nuc-prod', binds: [{ servico: 'db', source: '/srv/prod/nuc/data' }] })
    expect(r).toMatchObject({ ok: true, app: 'nuc', amb: 'prod' })
  })

  it('reprova nome sem ambiente (a prova literal --name local) e o profile disfarcado', () => {
    expect(julgaCompose({ nome: 'local' }).porque).toMatch(/<app>-<amb>/)
    expect(julgaCompose({ nome: 'nuc-homolog' }).ok).toBe(false)
    expect(julgaCompose({}).porque).toMatch(/nao declara/)
  })

  it('bind SEM source e volume anonimo — o dado fica invisivel', () => {
    const r = julgaCompose({ nome: 'nuc-prod', binds: [{ servico: 'db' }] })
    expect(r.ok).toBe(false)
    expect(r.porque).toMatch(/bind sem 'source:'/)
  })

  it('bind com source FORA do layout reprova, nomeando o servico', () => {
    const r = julgaCompose({ nome: 'nuc-prod', binds: [{ servico: 'db', source: '/mnt/d/nuc' }] })
    expect(r.ok).toBe(false)
    expect(r.porque).toMatch(/db: .*fora de \/srv/)
  })
})

describe('parseArgs — o guard exige fonte (nunca varre sozinho)', () => {
  it('le cada modo', () => {
    expect(parseArgs(['--str', '/data']).str).toBe('/data')
    expect(parseArgs(['--name', 'nuc-prod']).nome).toBe('nuc-prod')
    expect(parseArgs(['--path', '/srv', '--amb', 'prod'])).toMatchObject({ raiz: '/srv', ambientes: ['prod'] })
  })
})

describe('CLI — as provas do .ai/doctrines.toml reprovam de verdade', () => {
  const roda = (args) => {
    try {
      execFileSync('node', [GATE, ...args], { stdio: 'pipe' })
      return 0
    } catch (e) {
      return e.status ?? 1
    }
  }

  it('`--str /data` e `--name local` reprovam; o caminho valido passa', () => {
    expect(roda(['--str', '/data'])).toBe(1)
    expect(roda(['--name', 'local'])).toBe(1)
    expect(roda(['--str', '/srv/dev/kipp/data'])).toBe(0)
  })
})
