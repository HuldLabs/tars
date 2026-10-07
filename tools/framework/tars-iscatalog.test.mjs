import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCatalog } from './tars-hooks.mjs'

// Incident 07/10: o segtools tem `.ai/VERSION` (heranca de quando o Tars nasceu dele) e o motor o
// tratou como catalogo — procurou o gate em `.ai/gates/` e todo commit falhou.
function repo({ version, lock }) {
  const dir = mkdtempSync(join(tmpdir(), 'iscatalog-'))
  mkdirSync(join(dir, '.ai'))
  if (version) writeFileSync(join(dir, '.ai', 'VERSION'), '1.0.0\n')
  if (lock) writeFileSync(join(dir, '.ai', 'tars.lock'), '{}\n')
  return dir
}

describe('isCatalog', () => {
  it('VERSION sem tars.lock = catalogo (o proprio Tars)', () => {
    expect(isCatalog(repo({ version: true, lock: false }))).toBe(true)
  })
  it('VERSION COM tars.lock = consumidor (o segtools)', () => {
    expect(isCatalog(repo({ version: true, lock: true }))).toBe(false)
  })
  it('sem VERSION = consumidor', () => {
    expect(isCatalog(repo({ version: false, lock: true }))).toBe(false)
  })
})
