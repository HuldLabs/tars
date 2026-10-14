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
    // `gates` entrou com a curadoria a1 (item B3.3): a LINHA DE BASE da adocao
    // (`tars gates baseline [--prune]`) — o gate reprova so' o que nao esta' na base.
    expect(Object.keys(COMMANDS).sort()).toEqual(['acessos', 'adopt', 'check', 'check-refs', 'curation', 'doctor', 'gates', 'git', 'handoff', 'hooks', 'identity', 'incident', 'init', 'memory', 'promote', 'secrets', 'sync', 'upgrade-notes', 'verify'])
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

  // `curation` sem `--tars`/TARS_HOME caia no `findTars` do modulo ERRADO (o da curadoria nao o
  // exporta): "mod.findTars is not a function". O catalogo se acha pelo sync, como nos outros.
  it('curation pelo CLI: acha o catalogo sem --tars e imprime o relatorio', async () => {
    const antes = process.env.TARS_HOME
    delete process.env.TARS_HOME
    const log = console.log
    console.log = () => {}
    const linhas = []
    try {
      console.log = (x) => linhas.push(String(x))
      await COMMANDS.curation([], process.cwd()) // o relatorio em texto (report) e' o caminho do dono
      expect(linhas.join('\n')).toMatch(/# curadoria/)
    } finally {
      console.log = log
      if (antes !== undefined) process.env.TARS_HOME = antes
    }
  })

  it('argValue le o par --nome <v>', () => {
    expect(argValue(['--tars', '/x', '--project', '/y'], '--tars')).toBe('/x')
    expect(argValue(['--tars', '/x'], '--project')).toBeNull()
  })
})
