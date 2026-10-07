// `tars memory audit` — o contrato desta fatia: a ref com hash casa o trecho ATUAL.
// O caso que importa e' o NEGATIVO: trecho que mudou tem de reprovar (DRIFT); sem ele, o
// audit seria um "existe?" que passa em qualquer prova podre (fabber INV-IAC-1).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditMemory, format, parseRef, temAncora, trechoDe, trechoHash } from './tars-memory.mjs'

const bases = []
const raiz = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-mem-'))
  bases.push(d)
  return d
}
afterEach(() => { for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

const escreve = (dir, rel, texto) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), texto)
}

describe('parseRef — a ref vira dado', () => {
  it('le arquivo:linha e intervalo', () => {
    expect(parseRef('docs/a.md:12')).toMatchObject({ file: 'docs/a.md', linha: 12 })
    expect(parseRef('docs/a.md:12-15')).toMatchObject({ file: 'docs/a.md', linha: 12, fim: 15 })
  })

  it('le ancora e hash curto', () => {
    expect(parseRef('docs/a.md#fechamento-de-sessao')).toMatchObject({ file: 'docs/a.md', ancora: 'fechamento-de-sessao' })
    expect(parseRef(`docs/a.md:12#${'a1b2c3d4'}`)).toMatchObject({ file: 'docs/a.md', linha: 12, hash: 'a1b2c3d4' })
  })

  it('separa o repo da ref federada (a prova mora no repo de origem)', () => {
    expect(parseRef('farmega.v2:.ai/memory/operational-memory.jsonl')).toMatchObject({ repo: 'farmega.v2', file: '.ai/memory/operational-memory.jsonl' })
  })
})

describe('trechoDe / trechoHash', () => {
  it('o trecho e a linha (ou o intervalo), e o hash muda quando o texto muda', () => {
    const t = 'a\nb\nc\nd\n'
    expect(trechoDe(t, 1)).toBe('a')
    expect(trechoDe(t, 1, 3)).toBe('a\nb\nc')
    expect(trechoHash(trechoDe(t, 1))).not.toBe(trechoHash('OUTRO'))
  })

  it('linha fora do arquivo = null', () => {
    expect(trechoDe('a\n', 9)).toBeNull()
  })
})

describe('temAncora', () => {
  it('casa o slug do cabecalho, ignorando acento e caixa', () => {
    expect(temAncora('## Fechamento de sessao\nx', 'fechamento-de-sessao')).toBe(true)
    expect(temAncora('## Outra\nx', 'fechamento-de-sessao')).toBe(false)
  })
})

describe('auditMemory — os tres modos de a prova morrer', () => {
  const entrada = (ref) => JSON.stringify({ id: 'mem-x', source_refs: [ref] })

  it('CASO POSITIVO: ref com hash que casa = ok', () => {
    const dir = raiz()
    escreve(dir, 'docs/a.md', 'linha um\nlinha dois\n')
    const h = trechoHash('linha um')
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada(`docs/a.md:1#${h}`) + '\n')
    const r = auditMemory(f, { root: dir })
    expect(r.ok).toBe(true)
    expect(r.porStatus.ok).toBe(1)
  })

  it('CASO NEGATIVO (DRIFT): o trecho mudou e o hash nao casa -> reprova', () => {
    const dir = raiz()
    const h = trechoHash('linha um')
    escreve(dir, 'docs/a.md', 'linha um REESCRITA\n')
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada(`docs/a.md:1#${h}`) + '\n')
    const r = auditMemory(f, { root: dir })
    expect(r.ok).toBe(false)
    expect(r.porStatus.drift).toBe(1)
    expect(r.falhas[0].motivo).toContain('DRIFT')
  })

  it('CASO NEGATIVO (MISSING): o arquivo sumiu -> reprova', () => {
    const dir = raiz()
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada('docs/nao-existe.md:1') + '\n')
    expect(auditMemory(f, { root: dir }).porStatus.missing).toBe(1)
  })

  it('CASO NEGATIVO (ANCHOR): a ancora nao existe mais -> reprova', () => {
    const dir = raiz()
    escreve(dir, 'docs/a.md', '# Titulo\n')
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada('docs/a.md#fechamento-de-sessao') + '\n')
    expect(auditMemory(f, { root: dir }).porStatus.anchor).toBe(1)
  })

  it('MIGRACAO: entrada sem hash = AVISO (conta, nao reprova)', () => {
    const dir = raiz()
    escreve(dir, 'docs/a.md', 'linha um\n')
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada('docs/a.md:1') + '\n')
    const r = auditMemory(f, { root: dir })
    expect(r.ok).toBe(true)
    expect(r.semHash).toBe(1)
    expect(r.porStatus.aviso).toBe(1)
  })

  it('federada nao e julgada localmente (a prova mora no repo de origem)', () => {
    const dir = raiz()
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada('farmega.v2:.ai/memory/operational-memory.jsonl') + '\n')
    const r = auditMemory(f, { root: dir })
    expect(r.ok).toBe(true)
    expect(r.porStatus.ignorada).toBe(1)
  })

  it('format traz os numeros e o que revisar', () => {
    const dir = raiz()
    const f = path.join(dir, 'm.jsonl')
    fs.writeFileSync(f, entrada('docs/nao-existe.md:1') + '\n')
    expect(format(auditMemory(f, { root: dir }))).toContain('missing 1')
  })
})
