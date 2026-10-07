// `tars verify` — o contrato desta fatia: a claim so' e' VERIFIED quando um TERCEIRO roda o
// `verify` e a saida casa o `expect`. Cada caso roda a classificacao com um `spawn` controlado
// (nao se le o codigo, roda-se o julgamento) — e um caso de ponta usa o `spawn` real.
import { describe, expect, it } from 'vitest'
import { classify, matchesExpect, parseClaims, verify } from './tars-verify.mjs'

const claim = (over = {}) => ({ claim: 'x', verify: 'echo ok', expect: 'ok', tag: 'VERIFIED', negativo: false, forte: false, ...over })
/** `spawn` falso: rc fixo ou por comando. */
const comRc = (rc) => () => ({ rc, out: rc === 0 ? 'ok' : 'falhou', ok: rc === 0 })

describe('parseClaims — o bloco vira dado', () => {
  it('le claim/verify/expect e a tag embutida', () => {
    const [c] = parseClaims('claim: o arquivo existe | verify: test -f x | expect: [VERIFIED] pronto')
    expect(c.claim).toBe('o arquivo existe')
    expect(c.verify).toBe('test -f x')
    expect(c.expect).toBe('pronto')
    expect(c.tag).toBe('VERIFIED')
  })

  it('sem tag = UNKNOWN (o default mais fraco, nunca confiavel por omissao)', () => {
    expect(parseClaims('claim: algo | verify: true | expect: x')[0].tag).toBe('UNKNOWN')
  })

  it('claim forte (corrigido/testado) e a prova negativa viram campo', () => {
    const [c] = parseClaims('claim: o bug foi corrigido | verify: echo ok | expect: ok | verify-negativo: false')
    expect(c.forte).toBe(true)
    expect(c.negativo).toBe(true)
    expect(c['verify-negativo']).toBe('false')
  })
})

describe('matchesExpect', () => {
  it('literal = substring; /re/ = regex', () => {
    expect(matchesExpect('rc=0', 'saiu rc=0 no fim')).toBe(true)
    expect(matchesExpect('rc=9', 'saiu rc=0')).toBe(false)
    expect(matchesExpect('/rc=\\d/', 'rc=7')).toBe(true)
  })
})

describe('classify — o que o verify disse', () => {
  it('verify ok e saida casa = VERIFIED', () => {
    expect(classify(claim(), { spawn: comRc(0) }).status).toBe('VERIFIED')
  })

  it('verify ok mas saida NAO casa = PHANTOM', () => {
    const c = classify(claim({ expect: 'nunca aparece' }), { spawn: () => ({ rc: 0, out: 'outra coisa', ok: true }) })
    expect(c.status).toBe('PHANTOM')
  })

  it('verify que FALHA = PHANTOM', () => {
    expect(classify(claim(), { spawn: comRc(1) }).status).toBe('PHANTOM')
  })

  it('sem `verify` (claim sem prova) = PHANTOM', () => {
    expect(classify(claim({ verify: null }), { spawn: comRc(0) }).status).toBe('PHANTOM')
  })

  it('`expect` presente e VAZIO = so o exit 0 (rc 0 passa, rc != 0 reprova)', () => {
    expect(classify(claim({ expect: '' }), { spawn: comRc(0) }).status).toBe('VERIFIED')
    expect(classify(claim({ expect: '' }), { spawn: comRc(1) }).status).toBe('PHANTOM')
  })

  it('`expect` AUSENTE (null) = PHANTOM, mesmo com o verify passando', () => {
    expect(classify(claim({ expect: null }), { spawn: comRc(0) }).status).toBe('PHANTOM')
  })
})

describe('verify — o exit code', () => {
  it('claim ok passa (falhas vazio)', () => {
    const r = verify({ texto: 'claim: o arquivo existe [VERIFIED] | verify: echo ok | expect: ok', spawn: comRc(0) })
    expect(r.falhas).toHaveLength(0)
  })

  it('PHANTOM derruba', () => {
    const r = verify({ texto: 'claim: algo | verify: echo ok | expect: ok', spawn: comRc(1) })
    expect(r.falhas).toHaveLength(1)
  })

  it('claim de "corrigido" SEM prova negativa = NEGATIVO', () => {
    const r = verify({ texto: 'claim: o bug foi corrigido | verify: echo ok | expect: ok', spawn: comRc(0) })
    expect(r.falhas[0].status).toBe('NEGATIVO')
  })

  it('claim de "corrigido" COM prova negativa que falha de verdade = VERIFIED', () => {
    const texto = 'claim: o bug foi corrigido [DERIVED] | verify: echo ok | expect: ok | verify-negativo: exit 1'
    // O `verify` casa (rc 0); a prova negativa FALHA (rc != 0) => convergencia comprovada.
    const spawn = (cmd) => (cmd === 'exit 1' ? { rc: 1, out: '', ok: false } : { rc: 0, out: 'ok', ok: true })
    expect(verify({ texto, spawn }).falhas).toHaveLength(0)
  })

  it('prova negativa que PASSA (deveria falhar) = PHANTOM', () => {
    const texto = 'claim: o bug foi corrigido | verify: echo ok | expect: ok | verify-negativo: true'
    expect(verify({ texto, spawn: comRc(0) }).falhas[0].status).toBe('PHANTOM')
  })

  it('mais de 3 [ASSUMED] auto-bloqueia (as excedentes reprovam)', () => {
    const linha = (i) => `claim: a${i} [ASSUMED] | verify: echo ok | expect: ok`
    const texto = [1, 2, 3, 4, 5].map(linha).join('\n')
    const r = verify({ texto, spawn: comRc(0) })
    expect(r.assumed).toBe(5)
    expect(r.falhas).toHaveLength(2)
    expect(r.falhas.every((c) => c.status === 'ASSUMED')).toBe(true)
  })

  it('ate 3 [ASSUMED] passa', () => {
    const texto = [1, 2, 3].map((i) => `claim: a${i} [ASSUMED] | verify: echo ok | expect: ok`).join('\n')
    expect(verify({ texto, spawn: comRc(0) }).falhas).toHaveLength(0)
  })

  it('claim sem tag = UNKNOWN e reprova', () => {
    const r = verify({ texto: 'claim: algo | verify: echo ok | expect: ok', spawn: comRc(0) })
    expect(r.falhas).toHaveLength(1)
  })
})
