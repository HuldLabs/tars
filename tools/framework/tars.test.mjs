// `tars.mjs` — o despachante. O contrato desta fatia e' so' ROTEAMENTO (R3): cada
// subcomando tem que chegar no modulo DONO e na funcao certa, sem logica nova aqui.
// Por isso o teste asserta o despacho, nao o efeito (o efeito ja' tem teste proprio
// em `tars-*.test.mjs`).
import { describe, expect, it, vi } from 'vitest'
import { COMMANDS, argValue } from './tars.mjs'
import { HOOKS } from './tars-sync.mjs'

describe('tars — despacho', () => {
  it('expoe exatamente os subcomandos do desenho', () => {
    expect(Object.keys(COMMANDS).sort()).toEqual(['check', 'doctor', 'git', 'hooks', 'init', 'memory', 'promote', 'sync', 'verify'])
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
