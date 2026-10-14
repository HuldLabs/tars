import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarBase, baseDoGate, chaveDe, hashTrecho } from '../../.ai/gates/lib-baseline.mjs'

// O aplicador da linha de base: o gate reprova so' o NOVO. Prova-se pelos quatro casos que
// importam — sem base tudo reprova; com base o adotado isenta; o trecho mudou e volta a
// cobrar; e o fail-closed (base ilegivel NAO isenta).

const HERE = path.dirname(fileURLToPath(import.meta.url))
let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-libbase-'))
  fs.mkdirSync(path.join(dir, '.ai'), { recursive: true })
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const grava = (gates) => fs.writeFileSync(path.join(dir, '.ai', 'gates-baseline.json'), JSON.stringify({ versao: 1, gates }))

describe('aplicarBase', () => {
  it('sem base, TUDO reprova (nao ha isencao silenciosa)', () => {
    const r = aplicarBase(['a.mjs:1'], { project: dir, gate: 'g' })
    expect(r.novos).toEqual(['a.mjs:1'])
    expect(r.isentos).toEqual([])
  })

  it('com base e MESMO trecho, o achado isenta', () => {
    grava({ g: [{ key: 'a.mjs:1', hash: hashTrecho('catch {}') }] })
    const r = aplicarBase(['a.mjs:1'], { project: dir, gate: 'g', trechoDe: () => 'catch {}' })
    expect(r.novos).toEqual([])
    expect(r.isentos).toEqual(['a.mjs:1'])
  })

  it('o trecho mudou: a isencao cai e o gate cobra de novo', () => {
    grava({ g: [{ key: 'a.mjs:1', hash: hashTrecho('catch {}') }] })
    const r = aplicarBase(['a.mjs:1'], { project: dir, gate: 'g', trechoDe: () => 'catch (e) { throw e }' })
    expect(r.novos).toEqual(['a.mjs:1'])
  })

  it('base ILEGIVEL nao isenta nada (fail-closed)', () => {
    fs.writeFileSync(path.join(dir, '.ai', 'gates-baseline.json'), '{ nao e json')
    expect(baseDoGate(dir, 'g')).toEqual([])
    const r = aplicarBase(['a.mjs:1'], { project: dir, gate: 'g' })
    expect(r.novos).toEqual(['a.mjs:1'])
  })

  it('base de OUTRO gate nao isenta este', () => {
    grava({ outro: [{ key: 'a.mjs:1', hash: hashTrecho('catch {}') }] })
    expect(aplicarBase(['a.mjs:1'], { project: dir, gate: 'g' }).novos).toEqual(['a.mjs:1'])
  })
})

describe('chaveDe', () => {
  it('normaliza e ignora a coluna', () => {
    expect(chaveDe('a.mjs:12')).toBe('a.mjs:12')
    expect(chaveDe('a.mjs:12:5')).toBe('a.mjs:12')
  })
})
