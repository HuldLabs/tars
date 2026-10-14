// `tars upgrade-notes` — o consumidor precisa de notas ACIONAVEIS, nao de decifrar o diff
// (foi o que custou turnos ao seo-brain, 07/10). O contrato: compara a versao do lock com a
// atual e imprime SO' as notas entre elas, lidas do CHANGELOG.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compareVersions, format, notesBetween, parseChangelog, upgradeNotes, versionKey } from './tars-upgrade.mjs'

const CHANGELOG = `# CHANGELOG — Tars

## 0.0.1-dev.3

### O que mudou
- terceira

## 0.0.1-dev.2

### O que mudou
- segunda

## 0.0.1-dev.1

### O que mudou
- primeira
`

describe('tars-upgrade — comparacao de versao', () => {
  it('ordena dev.N pela fracao, e a release fica acima de todo dev', () => {
    expect(versionKey('0.0.1-dev.1')).toBeLessThan(versionKey('0.0.1-dev.2'))
    expect(versionKey('0.0.1-dev.9')).toBeLessThan(versionKey('0.0.1'))
    expect(compareVersions('0.0.1-dev.3', '0.0.1-dev.1')).toBeGreaterThan(0)
    expect(compareVersions('0.0.1-dev.1', '0.0.1-dev.3')).toBeLessThan(0)
  })

  it('versao ilegivel nao se compara (null, nao um chute)', () => {
    expect(versionKey('v0.3')).toBeNull()
    expect(compareVersions('v0.3', '0.0.1-dev.1')).toBeNull()
  })
})

describe('tars-upgrade — parser do CHANGELOG', () => {
  const blocos = parseChangelog(CHANGELOG)

  it('separa por versao, preservando o corpo', () => {
    expect(blocos.map((b) => b.version)).toEqual(['0.0.1-dev.3', '0.0.1-dev.2', '0.0.1-dev.1'])
    expect(blocos[0].corpo).toContain('terceira')
  })

  it('notas entre (from, to] sao so as do intervalo, mais novas primeiro', () => {
    expect(notesBetween(blocos, '0.0.1-dev.1', '0.0.1-dev.3').map((b) => b.version)).toEqual([
      '0.0.1-dev.3',
      '0.0.1-dev.2',
    ])
  })

  it('ja em dia nao imprime nada', () => {
    expect(notesBetween(blocos, '0.0.1-dev.3', '0.0.1-dev.3')).toEqual([])
  })
})

describe('tars-upgrade — o comando contra a fixture', () => {
  function fixture({ lockVersion = '0.0.1-dev.1', changelog = CHANGELOG } = {}) {
    const tars = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-up-'))
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-up-p-'))
    fs.mkdirSync(path.join(project, '.ai'), { recursive: true })
    fs.writeFileSync(path.join(tars, 'package.json'), JSON.stringify({ name: 'tars', version: '0.0.1-dev.3' }))
    if (changelog) fs.writeFileSync(path.join(tars, 'CHANGELOG.md'), changelog)
    if (lockVersion)
      fs.writeFileSync(
        path.join(project, '.ai', 'tars.lock'),
        JSON.stringify({ lockfileVersion: 1, tars: { version: lockVersion, commit: 'abc' }, files: {} }),
      )
    return { tars, project }
  }

  it('lock antigo imprime so as notas entre o lock e a atual', () => {
    const { tars, project } = fixture()
    const r = upgradeNotes({ tars, project })
    expect(r.version).toBe('0.0.1-dev.3')
    expect(r.from).toBe('0.0.1-dev.1')
    expect(r.notas.map((n) => n.version)).toEqual(['0.0.1-dev.3', '0.0.1-dev.2'])
    const saida = []
    format(r, (l) => saida.push(l))
    expect(saida.join('\n')).toContain('terceira')
    expect(saida.join('\n')).not.toContain('primeira')
  })

  it('lock em versao que o CHANGELOG nao conhece (esquema antigo `1.0.0`): mostra TUDO e avisa', () => {
    // seo-brain, 14/10: lock `1.0.0` x motor `0.0.1-dev.19` dizia "ja' em dia" e escondia tudo.
    const { tars, project } = fixture({ lockVersion: '1.0.0' })
    const r = upgradeNotes({ tars, project })
    expect(r.notas.map((n) => n.version)).toEqual(['0.0.1-dev.3', '0.0.1-dev.2', '0.0.1-dev.1'])
    const saida = []
    format(r, (l) => saida.push(l))
    expect(saida.join('\n')).toMatch(/nao consta do CHANGELOG/)
    expect(saida.join('\n')).not.toMatch(/ja' em dia/)
  })

  it('lock na versao atual: nada entre elas', () => {
    const { tars, project } = fixture({ lockVersion: '0.0.1-dev.3' })
    const r = upgradeNotes({ tars, project })
    expect(r.notas).toEqual([])
  })

  it('CHANGELOG ausente nao explode: devolve `faltando`', () => {
    const { tars, project } = fixture({ changelog: null })
    const r = upgradeNotes({ tars, project })
    expect(r.faltando).toMatch(/CHANGELOG/)
  })

  it('lock com versao ilegivel avisa em vez de imprimir tudo', () => {
    const { tars, project } = fixture({ lockVersion: 'v0.3' })
    const r = upgradeNotes({ tars, project })
    expect(r.faltando).toMatch(/ilegivel/)
    expect(r.notas).toEqual([])
  })
})
