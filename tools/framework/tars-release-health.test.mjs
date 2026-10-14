// Saude das releases (dev.23): cobra o formato so' depois da primeira release.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { releaseHealth } from './tars-release-health.mjs'

const SEC = (v) => `## ${v}\n\n### O que mudou\n- x\n\n### Por que\ny\n\n### Arquivos impactados\nz\n\n### O que o consumidor faz\nw\n`
const proj = (changelog) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-rh-'))
  if (changelog !== null) fs.writeFileSync(path.join(d, 'CHANGELOG.md'), `# CHANGELOG\n\n${changelog}`)
  return d
}
const falhas = (r) => r.linhas.filter((l) => !l.ok).map((l) => l.nome)

describe('saude das releases', () => {
  it('sem release ainda: nada a cobrar, nem CHANGELOG (o dono, 14/10)', () => {
    const r = releaseHealth(proj(null), { tags: [] })
    expect(r).toEqual({ ativo: false, ultima: null, linhas: [] })
  })

  it('no formato: tudo OK', () => {
    const r = releaseHealth(proj(SEC('0.0.1-dev.2') + SEC('0.0.1-dev.1')), { tags: ['v0.0.1-dev.1', 'v0.0.1-dev.2'] })
    expect(r.ativo).toBe(true)
    expect(r.ultima).toBe('0.0.1-dev.2')
    expect(falhas(r)).toEqual([])
  })

  it('com release e sem CHANGELOG: falha', () => {
    expect(falhas(releaseHealth(proj(null), { tags: ['v0.0.1'] }))).toEqual(['changelog'])
  })

  it('data no titulo: falha alto (o release-notes juntava secoes — Endurance)', () => {
    const r = releaseHealth(proj(SEC('0.0.1-dev.2').replace('## 0.0.1-dev.2', '## 0.0.1-dev.2 — 13/10/2026')), { tags: ['v0.0.1-dev.2'] })
    expect(falhas(r)).toContain('cabecalho')
  })

  it('release sem secao e CHANGELOG atras da tag: falha (Kipp: v0.0.2 com o topo em dev.1)', () => {
    const r = releaseHealth(proj(SEC('0.0.1-dev.1')), { tags: ['v0.0.1-dev.1', 'v0.0.2'] })
    expect(falhas(r)).toEqual(['ultima-tag', 'topo'])
  })

  it('secao da ultima tag sem as 4 subsecoes: falha nomeando o que falta', () => {
    const r = releaseHealth(proj('## 0.0.1-dev.1\n\n### O que mudou\n- x\n'), { tags: ['v0.0.1-dev.1'] })
    expect(falhas(r)).toEqual(['subsecoes'])
    expect(r.linhas.find((l) => l.nome === 'subsecoes').detalhe).toMatch(/Por que/)
  })

  it('CHANGELOG adiantado (versao em preparo acima da ultima tag) nao reprova', () => {
    expect(falhas(releaseHealth(proj(SEC('0.0.1-dev.3') + SEC('0.0.1-dev.2')), { tags: ['v0.0.1-dev.2'] }))).toEqual([])
  })
})
