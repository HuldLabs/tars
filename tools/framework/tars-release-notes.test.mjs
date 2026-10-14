// `tars release-notes` — notas de release geradas do CHANGELOG + artefatos (dono, 14/10).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assets, destaques, gerar, secao } from './tars-release-notes.mjs'

const CHANGELOG = `# CHANGELOG

## 0.0.1-dev.2

### O que mudou
- **Coisa nova.** Detalhe da coisa.
- **Outra coisa** com texto.
- linha sem negrito

### Por que
Porque sim.

## 0.0.1-dev.1

### O que mudou
- **Primeira.**
`

const dist = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-rn-'))
  fs.writeFileSync(path.join(d, 'tars-linux-arm64'), 'b')
  fs.writeFileSync(path.join(d, 'tars-linux-amd64'), 'a')
  fs.writeFileSync(path.join(d, 'tars-extra'), 'c')
  fs.writeFileSync(path.join(d, 'sha256sums'), 'x')
  return d
}

describe('tars release-notes', () => {
  it('sem a secao da versao no CHANGELOG, falha alto (release sem notas nao sai)', () => {
    expect(() => secao(CHANGELOG, '0.0.1-dev.9')).toThrow(/sem a secao "## 0.0.1-dev.9"/)
  })

  it('cabecalho com data no titulo falha alto em vez de juntar secoes (Endurance)', () => {
    expect(() => secao(CHANGELOG.replace('## 0.0.1-dev.1', '## 0.0.1-dev.1 — 13/10/2026'), '0.0.1-dev.2')).toThrow(/fora do formato/)
  })

  it('destaques vem do negrito de "O que mudou"', () => {
    expect(destaques(secao(CHANGELOG, '0.0.1-dev.2'))).toEqual(['Coisa nova', 'Outra coisa'])
  })

  it('assets: ordem por publico, sha256 real, sha256sums fora e asset desconhecido NAO some', () => {
    const a = assets(dist())
    expect(a.map((x) => x.nome)).toEqual(['tars-linux-amd64', 'tars-linux-arm64', 'tars-extra'])
    expect(a[0].sha256).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb')
  })

  it('as notas trazem pre-release, downloads, imagem por digest, instalar, CHANGELOG, verificacao e comparacao', () => {
    const md = gerar({
      version: '0.0.1-dev.2',
      changelog: CHANGELOG,
      dist: dist(),
      image: 'ghcr.io/o/tars@sha256:abc',
      repo: 'O/tars',
      run: 'https://x/run/1',
      prev: 'v0.0.1-dev.1',
    })
    for (const parte of ['Pré-release', '## Downloads', '`tars-linux-amd64` | Ubuntu, WSL',
      'COPY --from=ghcr.io/o/tars@sha256:abc', '## Instalar', 'gh release download v$V -R O/tars', '## O que mudou (CHANGELOG)',
      'Detalhe da coisa', '### Por que', 'https://x/run/1', 'v0.0.1-dev.1...v0.0.1-dev.2'])
      expect(md).toContain(parte)
    expect(md).not.toContain('Primeira') // so' a secao da versao
  })

  it('fora do Tars: o nome vem do --repo; imagem so por digest (Kipp, 14/10)', () => {
    const md = gerar({ version: '0.0.1-dev.2', changelog: CHANGELOG, image: 'ghcr.io/o/kipp@sha256:abc', repo: 'O/kipp' })
    expect(md).toMatch(/^# kipp 0\.0\.1-dev\.2/)
    expect(md).not.toContain('ghcr.io/o/kipp:')
    expect(md).toContain('binário em `/kipp`')
  })

  it('--kind image: sem binario/COPY, com docker pull e verificacao da imagem (Endurance, 14/10)', () => {
    const md = gerar({ version: '0.0.1-dev.2', changelog: CHANGELOG, image: 'ghcr.io/o/base@sha256:abc', repo: 'O/endurance', run: 'https://x/run/1', kind: 'image' })
    expect(md).not.toMatch(/binário em|COPY --from/)
    expect(md).toContain('docker pull ghcr.io/o/base@sha256:abc')
    expect(md).toContain('a imagem foi publicada')
  })

  it('release estavel nao leva o aviso de pre-release; sem dist nao inventa tabela', () => {
    const md = gerar({ version: '0.0.1-dev.2'.replace('-dev.2', ''), changelog: CHANGELOG.replace('0.0.1-dev.2', '0.0.1') })
    expect(md).not.toContain('Pré-release')
    expect(md).not.toContain('## Downloads')
  })
})
