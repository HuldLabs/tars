import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  BASELINE_FILE,
  chaveDe,
  consolidar,
  filtrarPorBase,
  gravarBaseline,
  hashTrecho,
  lerBaseline,
  podar,
} from './tars-gates-baseline.mjs'

// A linha de base separa o que o gate REPROVA (novo) do que ele ISENTA (esta' na base, com o
// mesmo conteudo). Prova-se pela funcao pura + pelos dois lados do ratchet, nao pela leitura.

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-base-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const trechoDe = (mapa) => (key) => mapa[key] ?? ''
const achado = (key) => [key]

describe('chaveDe', () => {
  it('normaliza `arquivo:linha` e ignora a coluna', () => {
    expect(chaveDe('a.mjs:12')).toBe('a.mjs:12')
    expect(chaveDe('a.mjs:12:5')).toBe('a.mjs:12')
    expect(chaveDe('  a.mjs:12  ')).toBe('a.mjs:12')
  })
})

describe('filtrarPorBase — o que o gate reprova x o que ele isenta', () => {
  const base = [{ key: 'a.mjs:3', hash: hashTrecho('catch {}') }]

  it('achado NOVO (nao esta na base) REPROVA', () => {
    const r = filtrarPorBase(achado('b.mjs:1'), [], { trechoDe: trechoDe({ 'b.mjs:1': 'x' }) })
    expect(r.novos).toEqual(['b.mjs:1'])
    expect(r.isentos).toEqual([])
  })

  it('achado na base com o MESMO trecho e isento', () => {
    const r = filtrarPorBase(achado('a.mjs:3'), base, { trechoDe: trechoDe({ 'a.mjs:3': 'catch {}' }) })
    expect(r.novos).toEqual([])
    expect(r.isentos).toEqual(['a.mjs:3'])
  })

  it('o trecho MUDOU: a isencao cai e o gate cobra de novo (o hash amarra o conteudo)', () => {
    const r = filtrarPorBase(achado('a.mjs:3'), base, { trechoDe: trechoDe({ 'a.mjs:3': 'catch (e) { throw e }' }) })
    expect(r.novos).toEqual(['a.mjs:3'])
    expect(r.isentos).toEqual([])
  })
})

describe('ratchet — a base so encolhe', () => {
  it('consolidar grava chave + hash do trecho', () => {
    const base = consolidar({ 'lint-swallow': { achados: ['a.mjs:1'], trechoDe: trechoDe({ 'a.mjs:1': 'catch {}' }) } })
    expect(base.gates['lint-swallow']).toEqual([{ key: 'a.mjs:1', hash: hashTrecho('catch {}') }])
  })

  it('podar tira da base o que JA nao reprova (conserto nao reabre)', () => {
    const base = { versao: 1, gates: { g: [{ key: 'a.mjs:1', hash: 'h' }, { key: 'b.mjs:2', hash: 'h' }] } }
    const r = podar(base, { g: { achados: ['a.mjs:1'] } })
    expect(r.gates.g).toEqual([{ key: 'a.mjs:1', hash: 'h' }])
  })

  it('conserto vai a ZERO: o gate sai da base', () => {
    const base = { versao: 1, gates: { g: [{ key: 'a.mjs:1', hash: 'h' }] } }
    expect(podar(base, { g: { achados: [] } }).gates.g).toBeUndefined()
  })
})

describe('arquivo — versionado, deterministico, fail-closed', () => {
  it('grava e le de volta, com gates/chaves ordenados (diff revisavel)', () => {
    const base = { versao: 1, gates: { z: [{ key: 'b:2', hash: 'h' }], a: [{ key: 'b:1', hash: 'h' }, { key: 'a:1', hash: 'h' }] } }
    gravarBaseline(dir, base)
    const lido = lerBaseline(dir)
    expect(Object.keys(lido.gates)).toEqual(['a', 'z'])
    expect(lido.gates.a.map((i) => i.key)).toEqual(['a:1', 'b:1'])
    expect(fs.existsSync(path.join(dir, BASELINE_FILE))).toBe(true)
  })

  it('base AUSENTE = base vazia (o gate cobra tudo, nunca isenta)', () => {
    expect(lerBaseline(dir)).toEqual({ versao: 1, gates: {} })
  })

  it('base CORROMPIDA = base vazia (ilegivel que isenta seria verde falso)', () => {
    fs.mkdirSync(path.join(dir, '.ai'), { recursive: true })
    fs.writeFileSync(path.join(dir, BASELINE_FILE), '{ nao e json')
    expect(lerBaseline(dir)).toEqual({ versao: 1, gates: {} })
  })
})
