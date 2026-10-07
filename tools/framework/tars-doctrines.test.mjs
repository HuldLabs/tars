// `tars doctor` — o contrato desta fatia: doutrina e' DADO, e a prova que PASSA denuncia
// PHANTOM (a regra nao esta sendo cobrada). Cada caso e' uma fixture com fonte real em disco
// e uma prova que o teste controla — nao se le o codigo, roda-se a classificacao.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classify, doctor, loadDoctrines, parseRef } from './tars-doctrines.mjs'
import { NONINTERACTIVE_ENV } from './tars-sync.mjs'

/** Projeto minimo: `.ai/tars.toml` + a fonte que as doutrinas declaram. */
function fixture(doctrines, { fonte = true, wiring = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-doc-'))
  fs.mkdirSync(path.join(dir, '.ai'), { recursive: true })
  if (fonte) fs.writeFileSync(path.join(dir, 'REGRA.md'), '# regra\nlinha 2\nlinha 3\n')
  // O doctor agora confere a PONTA (settings do harness). Fixture que testa SO' doutrina
  // nasce com wiring em dia; os casos de wiring pedem `wiring: false`.
  if (wiring) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.claude', 'settings.json'),
      JSON.stringify({ env: NONINTERACTIVE_ENV, hooks: { PreToolUse: [] } }),
    )
  }
  const linhas = doctrines
    .map((d) => `[[doctrine]]\n${Object.entries(d).map(([k, v]) => `${k} = "${v}"`).join('\n')}`)
    .join('\n\n')
  fs.writeFileSync(path.join(dir, '.ai', 'tars.toml'), `[tars]\nversion = "1.0.0"\n\n${linhas}\n`)
  return dir
}

/** Roda a classificacao com um `spawn` falso: a prova devolve o rc que o caso pede. */
const comRc = (rc) => (d, base) => classify(d, base, { spawn: () => ({ rc, out: '' }) })

describe('parseRef', () => {
  it('le arquivo, linha e intervalo; e marca o que e de outro projeto', () => {
    expect(parseRef('docs/GIT.md:44-54')).toEqual({ arquivo: 'docs/GIT.md', linha: 44, fim: 54, externo: false })
    expect(parseRef('docs/GIT.md')).toEqual({ arquivo: 'docs/GIT.md', externo: false })
    expect(parseRef('segtools:docs/GIT.md:1').externo).toBe(true)
  })
})

describe('classify — o que a prova diz', () => {
  const d = { id: 'x/y', fonte: 'REGRA.md:1-3', gate: 'g', prova: 'p', onde: 'ci' }

  it('prova que REPROVA (exit != 0) = OK: a doutrina e cobrada', () => {
    const dir = fixture([d])
    expect(comRc(1)(d, dir).status).toBe('OK')
  })

  it('prova que PASSA (exit 0) = PHANTOM: nada distingue quem segue de quem ignora', () => {
    const dir = fixture([d])
    expect(comRc(0)(d, dir).status).toBe('PHANTOM')
  })

  it('fonte cuja linha declarada saiu do arquivo = DRIFT', () => {
    const dir = fixture([{ ...d, fonte: 'REGRA.md:1-99' }], { fonte: true })
    expect(comRc(1)({ ...d, fonte: 'REGRA.md:1-99' }, dir).status).toBe('DRIFT')
  })

  it('fonte que nao existe = DRIFT, nomeando o arquivo', () => {
    const dir = fixture([{ ...d, fonte: 'SUMIDO.md:1' }])
    const r = comRc(1)({ ...d, fonte: 'SUMIDO.md:1' }, dir)
    expect(r.status).toBe('DRIFT')
    expect(r.detalhe).toMatch(/SUMIDO\.md/)
  })

  it('sem gate declarado = SEM GATE (aviso), com o motivo preservado', () => {
    const dir = fixture([d])
    const semGate = { ...d, gate: 'nenhum', motivo: 'nao ha artefato comparavel' }
    const r = comRc(1)(semGate, dir)
    expect(r.status).toBe('SEM GATE')
    expect(r.detalhe).toBe('nao ha artefato comparavel')
  })

  it('doutrina de outro projeto nao e julgada aqui (nao vira DRIFT falso)', () => {
    const dir = fixture([d])
    expect(comRc(1)({ ...d, fonte: 'segtools:docs/GIT.md:1' }, dir).status).toBe('PROJETO')
  })
})

describe('loadDoctrines — catalogo x projeto', () => {
  it('o projeto VENCE o catalogo pelo id (mesma regra da memoria em duas camadas)', () => {
    const tars = fixture([{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'g', prova: 'p' }])
    const project = fixture([{ id: 'a/b', fonte: 'REGRA.md:1-2', gate: 'outro', prova: 'q' }])
    const itens = loadDoctrines({ tars, project })
    expect(itens.filter((i) => i.id === 'a/b')).toHaveLength(1)
    expect(itens[0].gate).toBe('outro')
  })

  it('doutrina sem id ou sem prova e erro ALTO, nomeando o que falta', () => {
    const tars = fixture([{ id: 'sem-tema', fonte: 'REGRA.md:1', gate: 'g', prova: 'p' }])
    expect(() => loadDoctrines({ tars, project: tars })).toThrow(/id '<tema>\/<slug>'/)
    const semProva = fixture([{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'g' }])
    expect(() => loadDoctrines({ tars: semProva, project: semProva })).toThrow(/prova/)
  })

  it('gate nenhum sem motivo e recusado (orfao tem que ser nomeado)', () => {
    const tars = fixture([{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'nenhum', prova: 'p' }])
    expect(() => loadDoctrines({ tars, project: tars })).toThrow(/motivo/)
  })
})

describe('doctor — o exit code', () => {
  it('PHANTOM derruba (faltando != vazio)', () => {
    const tars = fixture([{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'g', prova: 'true' }])
    const r = doctor({ tars, project: tars })
    expect(r.porStatus.PHANTOM).toBe(1)
    expect(r.faltando).toHaveLength(1)
  })

  it('SEM GATE nao derruba: e divida nomeada, nao falha', () => {
    const tars = fixture([{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'nenhum', motivo: 'sem artefato', prova: 'false' }])
    const r = doctor({ tars, project: tars })
    expect(r.porStatus['SEM GATE']).toBe(1)
    expect(r.faltando).toHaveLength(0)
  })
})

describe('doctor — o wiring do harness (a ponta que faz o guard rodar)', () => {
  const d = () => [{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'g', prova: 'false' }]

  it('settings SEM o env nao interativo = FALHA (o comando bloquearia esperando senha)', () => {
    const tars = fixture(d())
    const file = path.join(tars, '.claude', 'settings.json')
    fs.writeFileSync(file, JSON.stringify({ env: {}, hooks: { PreToolUse: [] } }))
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(false)
    expect(r.wiring.detalhe).toMatch(/GIT_TERMINAL_PROMPT.*tars sync/)
    expect(r.faltando.map((i) => i.id)).toContain('wiring/settings')
  })

  it('projeto SEM .claude/settings.json = FALHA nomeando o conserto', () => {
    const tars = fixture(d(), { wiring: false })
    const r = doctor({ tars, project: tars })
    expect(r.wiring.detalhe).toContain('rode `tars sync`')
    expect(r.faltando.map((i) => i.id)).toContain('wiring/settings')
  })

  it('hook apontando arquivo AUSENTE = FALHA (o harness rodaria bash: no such file)', () => {
    const tars = fixture(d())
    fs.writeFileSync(
      path.join(tars, '.claude', 'settings.json'),
      JSON.stringify({
        env: NONINTERACTIVE_ENV,
        hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.ai/guards/nao-existe.sh"' }] }] },
      }),
    )
    const r = doctor({ tars, project: tars })
    expect(r.wiring.orfa).toEqual(['SessionStart: guards/nao-existe.sh'])
    expect(r.faltando.map((i) => i.id)).toContain('wiring/settings')
  })

  it('wiring em dia nao derruba (o caso feliz)', () => {
    const tars = fixture(d())
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(true)
    expect(r.faltando).toHaveLength(0)
  })
})
