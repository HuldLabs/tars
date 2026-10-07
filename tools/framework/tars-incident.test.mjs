// TARS-INCIDENTE-AUTO fatia 1: o ledger deixa de ser escrito a mao.
// O que estes testes PROVAM: campo vazio e' recusado NOMEANDO o campo; id/data/repo sao
// derivados; a entrada passa no MESMO esquema do pre-commit (`validateLedgerEntry`); a
// recorrencia (mesma tag + >= 50% das palavras) marca `recorrencia` e imprime RECORRENTE; e a
// 2a ocorrencia imprime o lembrete de harness-postmortem.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateLedgerEntry } from './ai-memory.mjs'
import {
  chaveDaFlag,
  incidentAdd,
  palavrasIguais,
  recorrenciaDe,
  slugify,
} from './tars-incident.mjs'
// Os dois helpers do doctor moram no modulo DONO da `tars doctor` (a linha INCIDENTES e' de la').
import { citaGuarda, incidentesSemGuarda } from './tars-doctrines.mjs'

const BASE = { titulo: 'Queda do MCP durante a sessao', o_que: 'o MCP caiu', causa: 'sem supervisao', correcao: 'vigiar o MCP', fonte: 'sessao:abc123' }

/** Roda o add contra um arquivo temporario e devolve o resultado + as linhas gravadas. */
function add(over = {}, existentes = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inc-'))
  const file = path.join(dir, 'incident-ledger.jsonl')
  if (existentes.length) fs.writeFileSync(file, existentes.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const r = incidentAdd({ ...BASE, ...over, file, hoje: '2026-10-07' })
  const linhas = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  return { r, linhas, file, dir }
}

describe('tars incident add', () => {
  it('gera id (slug do titulo), data e repo; o `+` de --o-que vira `o_que`', () => {
    const { r, linhas } = add({ repo: 'meu-projeto' })
    expect(r.entrada.id).toBe('inc-queda-do-mcp-durante-a-sessao')
    expect(r.entrada.data).toBe('2026-10-07')
    expect(r.entrada.repo).toBe('meu_projeto')
    expect(r.entrada.o_que).toBe('o MCP caiu')
    expect(chaveDaFlag('--o-que')).toBe('o_que')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].id).toBe(r.entrada.id)
  })

  it('a entrada gravada passa no esquema do pre-commit (fonte unica: validateLedgerEntry)', () => {
    const { linhas } = add({ tags: 'mcp, coordenacao' })
    expect(validateLedgerEntry(linhas[0])).toEqual([])
    expect(linhas[0].recorrencia).toBe(1)
    expect(linhas[0].tags).toEqual(['mcp', 'coordenacao'])
  })

  it('recusa campo vazio NOMEANDO o campo (e nao grava nada)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inc-'))
    const file = path.join(dir, 'l.jsonl')
    expect(() => incidentAdd({ ...BASE, causa: '   ', file })).toThrow(/--causa/)
    expect(() => incidentAdd({ titulo: '', o_que: 'x', causa: 'y', correcao: 'z', file })).toThrow(/--titulo/)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('recusa fonte vazia (o esquema exige prova) e segredo em texto puro', () => {
    expect(() => add({ fonte: '' })).toThrow(/fonte vazio/)
    expect(() => add({ o_que: 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' })).toThrow(/segredo/)
  })

  it('recusa dois incidentes de conteudo IDENTICO (mesma prova)', () => {
    const { r } = add()
    // Mesmo esquema de prova (a `fonte`) + mesma identidade: o `addEntry` do ai-memory recusa.
    expect(() => incidentAdd({ ...r.entrada, file: r.file })).toThrow(/duplicata exata/)
  })

  it('id slug colide: ganha sufixo -2 e nunca repete', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inc-'))
    const file = path.join(dir, 'incident-ledger.jsonl')
    const t = 'Falha de rede no despacho'
    const r1 = incidentAdd({ ...BASE, titulo: t, file, hoje: '2026-10-07' })
    // O 2o difere no CONTEUDO (o id nao entra na identidade): mesmo assunto, id novo.
    const r2 = incidentAdd({ ...BASE, titulo: t, o_que: 'o mesmo tema, outra medicao', file, hoje: '2026-10-07' })
    expect(r1.entrada.id).toBe('inc-falha-de-rede-no-despacho')
    expect(r2.entrada.id).toBe('inc-falha-de-rede-no-despacho-2')
  })
})

describe('tars incident — recorrencia', () => {
  it('mesma tag + >= 50% das palavras marca recorrencia 2 e imprime RECORRENTE', () => {
    const antigo = { id: 'inc-x', data: '2026-10-01', titulo: 'Queda do MCP durante a sessao', o_que: 'a', causa: 'b', correcao: 'c', recorrencia: 1, fonte: ['s'], tags: ['mcp'] }
    const { r, linhas } = add({ tags: 'mcp' }, [antigo])
    expect(r.ids).toEqual(['inc-x'])
    expect(r.recorrencia).toBe(2)
    expect(linhas.at(-1).recorrencia).toBe(2)
    expect(r.saida).toContain('RECORRENTE: inc-x')
    expect(r.saida).toContain('harness-postmortem: proponha mudanca de guarda/hook (1-5 linhas)')
  })

  it('tag diferente NAO e recorrencia (mesmo titulo)', () => {
    const antigo = { id: 'inc-x', data: '2026-10-01', titulo: 'Queda do MCP durante a sessao', o_que: 'a', causa: 'b', correcao: 'c', recorrencia: 1, fonte: ['s'], tags: ['docker'] }
    const { r } = add({ tags: 'mcp' }, [antigo])
    expect(r.ids).toEqual([])
    expect(r.recorrencia).toBe(1)
    expect(r.saida).not.toContain('RECORRENTE')
  })

  it('titulo com menos de 50% das palavras nao conta', () => {
    expect(palavrasIguais('Queda do MCP durante a sessao', 'Outra coisa totalmente diferente aqui')).toBeLessThan(0.5)
    const ent = { titulo: 'Queda do MCP durante a sessao', tags: ['mcp'] }
    expect(recorrenciaDe(ent, [{ id: 'inc-y', titulo: 'Outra coisa', tags: ['mcp'] }]).recorrencia).toBe(1)
  })

  it('a 3a ocorrencia conta 3 (recorrencia e numero, nao booleano)', () => {
    const a = { id: 'inc-a', titulo: 'Queda do MCP durante a sessao', tags: ['mcp'], recorrencia: 2 }
    const b = { id: 'inc-b', titulo: 'Queda do MCP durante a sessao', tags: ['mcp'], recorrencia: 1 }
    expect(recorrenciaDe({ titulo: 'Queda do MCP durante a sessao', tags: ['mcp'] }, [a, b]).recorrencia).toBe(3)
  })
})

describe('tars doctor — incidentes recorrentes sem guarda', () => {
  it('citaGuarda aceita sha, arquivo com extensao e regra BR-*/ADR-*/SEG-*', () => {
    expect(citaGuarda('8120aeb6 (sem fallback literal)')).toBe(true)
    expect(citaGuarda('tools/framework/ai-memory.mjs:115')).toBe(true)
    expect(citaGuarda('BR-12 proibe default literal')).toBe(true)
    expect(citaGuarda('o agente vai lembrar na proxima vez')).toBe(false)
    expect(citaGuarda('')).toBe(false)
  })

  it('lista so os recorrentes sem guarda (booleano legado true e numero >= 2)', () => {
    const inc = (over) => ({ id: 'inc-x', correcao: 'nada citado aqui', ...over })
    const sem = incidentesSemGuarda([
      inc({ id: 'inc-bool', recorrencia: true }),
      inc({ id: 'inc-num', recorrencia: 3 }),
      inc({ id: 'inc-com-guarda', recorrencia: 2, correcao: 'commit deadbee mais o hook tools/x.mjs' }),
      inc({ id: 'inc-primeira', recorrencia: 1 }),
      inc({ id: 'inc-false', recorrencia: false }),
    ]).map((e) => e.id)
    expect(sem).toEqual(['inc-bool', 'inc-num'])
  })

  it('slugify: acento, espaco e simbolo viram o mesmo slug', () => {
    expect(slugify('Queda do MCP — sessão')).toBe('queda-do-mcp-sessao')
  })
})
