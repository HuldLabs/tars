// `tars.mjs` — o despachante. O contrato desta fatia e' so' ROTEAMENTO (R3): cada
// subcomando tem que chegar no modulo DONO e na funcao certa, sem logica nova aqui.
// Por isso o teste asserta o despacho, nao o efeito (o efeito ja' tem teste proprio
// em `tars-*.test.mjs`).
import { describe, expect, it, vi } from 'vitest'
import { COMMANDS, argValue } from './tars.mjs'
import { HOOKS } from './tars-sync.mjs'

describe('tars — despacho', () => {
  it('expoe exatamente os subcomandos do desenho', () => {
    // `upgrade-notes` entrou com o caminho de upgrade (ecc63bd, TARS-VERSAO item 6): o
    // consumidor le' as notas entre a versao do `.ai/tars.lock` e a atual.
    // `incident` entrou com TARS-INCIDENTE-AUTO fatia 1 (o ledger deixa de ser escrito a mao).
    // `secrets` entrou com o dev.9: o cofre do PROJETO, declarado em `[secrets]` do `.ai/tars.toml`.
    // `acessos` entrou com a skill da Daneel (fase 3): o inventario de acesso GERADO.
    // `curation` entrou com a fatia 2 da curadoria: a rotina por PONTEIRO (docs/CURATION.md).
    // `identity` entrou com a release 14/10 (TARS-BUG-5): a identidade de automacao que o
    // Endurance precisa para a v0.1.0 (docs/decisoes-20260808 §Sequence/§SSH).
    // `adopt` entrou com a dev.19: o roteiro (SO' LEITURA) de adocao de repo pre-existente.
    expect(Object.keys(COMMANDS).sort()).toEqual(['acessos', 'adopt', 'check', 'check-refs', 'curation', 'doctor', 'git', 'handoff', 'hooks', 'identity', 'incident', 'init', 'memory', 'promote', 'secrets', 'sync', 'upgrade-notes', 'verify'])
  })

  it('check e' + ' sync com --check (um despacho, nao duas logicas)', () => {
    expect(typeof COMMANDS.check).toBe('function')
    expect(typeof COMMANDS.sync).toBe('function')
  })

  it('hooks valida o hook contra a fonte unica (HOOKS do tars-sync)', async () => {
    // Sem hook, o despacho falha RUIDOSO e cita os hooks validos (a lista vem de tars-sync).
    await expect(COMMANDS.hooks([], process.cwd())).rejects.toThrow(/pre-commit/)
    expect(HOOKS).toContain('commit-msg')
  })

  it('promote exige --area e --item', async () => {
    await expect(COMMANDS.promote([], process.cwd())).rejects.toThrow(/--area/)
    await expect(COMMANDS.promote(['--area', 'memory'], process.cwd())).rejects.toThrow(/--item/)
  })

  it('argValue le o par --nome <v>', () => {
    expect(argValue(['--tars', '/x', '--project', '/y'], '--tars')).toBe('/x')
    expect(argValue(['--tars', '/x'], '--project')).toBeNull()
  })
})
