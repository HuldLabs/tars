// `tars doctor` — o contrato desta fatia: doutrina e' DADO, e a prova que PASSA denuncia
// PHANTOM (a regra nao esta sendo cobrada). Cada caso e' uma fixture com fonte real em disco
// e uma prova que o teste controla — nao se le o codigo, roda-se a classificacao.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { classify, doctor, fonteIrmaOk, loadDoctrines, parseRef } from './tars-doctrines.mjs'
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
    expect(parseRef('docs/GIT.md:44-54')).toEqual({ arquivo: 'docs/GIT.md', linha: 44, fim: 54, externo: false, doProjeto: false, repo: null })
    expect(parseRef('docs/GIT.md')).toEqual({ arquivo: 'docs/GIT.md', externo: false, doProjeto: false, repo: null })
    expect(parseRef('segtools:docs/GIT.md:1').externo).toBe(true)
  })

  it('`<repo>:<relativo>` aponta a raiz de um repo IRMAO (nada de caminho absoluto)', () => {
    expect(parseRef('huldlabs:adr/0002-x.md:16')).toEqual({ arquivo: 'adr/0002-x.md', linha: 16, fim: 16, externo: true, doProjeto: false, repo: 'huldlabs' })
    // Caminho absoluto segue relativo (nao ganha repo): `/projects/...` continua lido como arquivo.
    expect(parseRef('/projects/huldlabs/adr/x.md').repo).toBe(null)
  })
})

describe('fonteIrmaOk — doutrina cuja fonte mora em repo irmao', () => {
  it('repo irmao montado com a linha viva = ok', () => {
    const r = fonteIrmaOk('/proj/tars/.worktrees/a4a', 'huldlabs:adr/0002-x.md:2', {
      exists: (p) => p === '/proj/huldlabs' || p === '/proj/huldlabs/adr/0002-x.md',
      read: () => 'a\nb\nc\n',
    })
    expect(r.ok).toBe(true)
  })

  it('repo ausente = DRIFT alto e nomeado (nunca silencio)', () => {
    const r = fonteIrmaOk('/proj/tars/.worktrees/a4a', 'huldlabs:adr/0002-x.md:2', { exists: () => false })
    expect(r.status).toBe('DRIFT')
    expect(r.porque).toContain('REPO AUSENTE: huldlabs')
    // Nomeia a PASTA onde o irmao deveria estar (a mesma que o `tars curation` varre).
    expect(r.porque).toContain('nao esta\' em /proj')
  })

  it('linha que saiu do texto = DRIFT (o punho mudou)', () => {
    const r = fonteIrmaOk('/proj/tars/.worktrees/a4a', 'huldlabs:adr/0002-x.md:9', {
      exists: () => true,
      read: () => 'a\nb\n',
    })
    expect(r.status).toBe('DRIFT')
    expect(r.porque).toContain('linha 9 de 3')
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

  it('GIT_TERMINAL_PROMPT ausente sozinho ja e FALHA — o wiring nomeia a chave exata', () => {
    // O caso mais traicoeiro e' o env PARCIAL: copiaram 2 das 3 chaves e o `git fetch`
    // continua pendurando. O doctor aponta QUAL falta; senao o dono reescreve o mesmo
    // bloco, o defeito volta e a classe fica aberta.
    const tars = fixture(d())
    fs.writeFileSync(
      path.join(tars, '.claude', 'settings.json'),
      JSON.stringify({
        env: { GCM_INTERACTIVE: NONINTERACTIVE_ENV.GCM_INTERACTIVE, GIT_SSH_COMMAND: NONINTERACTIVE_ENV.GIT_SSH_COMMAND },
        hooks: {},
      }),
    )
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(false)
    expect(r.wiring.avisos).toEqual(["GIT_TERMINAL_PROMPT (esperado '0')"])
    expect(r.wiring.detalhe).toMatch(/GIT_TERMINAL_PROMPT/)
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
    expect(r.wiring.orfa).toEqual(['SessionStart: .ai/guards/nao-existe.sh'])
    expect(r.faltando.map((i) => i.id)).toContain('wiring/settings')
  })

  it('wiring em dia nao derruba (o caso feliz)', () => {
    const tars = fixture(d())
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(true)
    expect(r.faltando).toHaveLength(0)
  })

  it('hook que cita arquivo ausente em QUALQUER evento = FALHA (nao so o caminho `.ai/guards/`)', () => {
    // O doctor antigo so' casava o regex `.ai/guards/...` e deixava passar um PreCompact
    // apontando para qualquer outro arquivo — o `bash: no such file` sujava a sessao (seo-brain).
    const tars = fixture(d())
    fs.writeFileSync(
      path.join(tars, '.claude', 'settings.json'),
      JSON.stringify({
        env: NONINTERACTIVE_ENV,
        hooks: {
          PreCompact: [{ matcher: 'auto', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/sumiu.sh"' }] }],
        },
      }),
    )
    const r = doctor({ tars, project: tars })
    expect(r.wiring.orfa).toEqual(['PreCompact: .ai/base/guards/sumiu.sh'])
    expect(r.wiring.ok).toBe(false)
  })

  it('hook que cita arquivo EXISTENTE nao acusa (o caminho achado pelo sync)', () => {
    const tars = fixture(d())
    fs.mkdirSync(path.join(tars, '.ai', 'base', 'guards'), { recursive: true })
    fs.writeFileSync(path.join(tars, '.ai', 'base', 'guards', 'ok.sh'), '#!/usr/bin/env bash\nexit 0\n')
    fs.writeFileSync(
      path.join(tars, '.claude', 'settings.json'),
      JSON.stringify({
        env: NONINTERACTIVE_ENV,
        hooks: { PreCompact: [{ matcher: 'auto', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/ok.sh"' }] }] },
      }),
    )
    const r = doctor({ tars, project: tars })
    expect(r.wiring.orfa).toEqual([])
    expect(r.wiring.ok).toBe(true)
  })
})

describe('doctor — hooks do git (core.hooksPath)', () => {
  const d = () => [{ id: 'a/b', fonte: 'REGRA.md:1', gate: 'g', prova: 'false' }]
  /** Fixture com `.githooks/` declarado (o sinal de que o consumidor usa hooks proprios). */
  const comGitHooks = () => {
    const dir = fixture(d())
    fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true })
    return dir
  }

  it('`core.hooksPath` declarado apontando pasta INEXISTENTE = HOOKS MORTOS (R4)', () => {
    const tars = fixture(d())
    execFileSync('git', ['-C', tars, 'init', '-q'])
    execFileSync('git', ['-C', tars, 'config', 'core.hooksPath', '.githooks'])
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(false)
    expect(r.wiring.git.ok).toBe(false)
    expect(r.wiring.git.detalhe).toMatch(/HOOKS MORTOS: core\.hooksPath=\.githooks nao existe/)
    expect(r.faltando.map((i) => i.id)).toContain('wiring/settings')
  })

  it('`core.hooksPath` declarado com a pasta OK = sem FALHA', () => {
    const tars = fixture(d())
    execFileSync('git', ['-C', tars, 'init', '-q'])
    execFileSync('git', ['-C', tars, 'config', 'core.hooksPath', '.githooks'])
    fs.mkdirSync(path.join(tars, '.githooks'), { recursive: true })
    for (const h of ['pre-commit', 'commit-msg', 'pre-push'])
      fs.writeFileSync(path.join(tars, '.githooks', h), '#!/usr/bin/env sh\n', { mode: 0o755 })
    const r = doctor({ tars, project: tars })
    expect(r.wiring.git.ok).toBe(true)
  })

  it('pasta `.githooks/` sem os hooks = FALHA (o git engole o commit calado)', () => {
    const tars = comGitHooks()
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(false)
    expect(r.wiring.git.detalhe).toMatch(/pre-commit.*tars sync/)
    expect(r.faltando.map((i) => i.id)).toContain('wiring/settings')
  })

  it('hook presente mas NAO executavel (sem shebang/bit) = FALHA (o git nao roda o que nao executa)', () => {
    const tars = comGitHooks()
    // Sem `#!` E sem bit: e' o unico estado que reprova nas DUAS plataformas — no win32 o
    // `mode` nao guarda bit nenhum e a testemunha e' o shebang (docs do `hookVivo`).
    for (const h of ['pre-commit', 'commit-msg', 'pre-push'])
      fs.writeFileSync(path.join(tars, '.githooks', h), 'tars gate pre-commit\n', { mode: 0o644 })
    const r = doctor({ tars, project: tars })
    expect(r.wiring.ok).toBe(false)
    expect(r.wiring.git.detalhe).toMatch(/nao executavel\/sem shebang/)
  })

  it('os 3 hooks executaveis = OK', () => {
    const tars = comGitHooks()
    for (const h of ['pre-commit', 'commit-msg', 'pre-push'])
      fs.writeFileSync(path.join(tars, '.githooks', h), '#!/usr/bin/env sh\n', { mode: 0o755 })
    const r = doctor({ tars, project: tars })
    expect(r.wiring.git.ok).toBe(true)
    expect(r.wiring.ok).toBe(true)
  })

  it('consumidor SEM hooks proprios nao e cobrado (nada a exigir)', () => {
    const tars = fixture(d())
    const r = doctor({ tars, project: tars })
    expect(r.wiring.git.ok).toBe(true)
    expect(r.wiring.git.detalhe).toMatch(/sem hooks proprios/)
  })

  it('cobra SO os hooks DECLARADOS no [gates] (declarar um nao exige os tres)', () => {
    const tars = comGitHooks()
    // O manifesto declara so' pre-commit: exigir commit-msg/pre-push reprovaria quem esta' certo.
    fs.writeFileSync(path.join(tars, '.ai', 'tars.toml'), '[tars]\nversion = "1.0.0"\n\n[gates]\npre-commit = ["x"]\n')
    fs.writeFileSync(path.join(tars, '.githooks', 'pre-commit'), '#!/usr/bin/env sh\n', { mode: 0o755 })
    const r = doctor({ tars, project: tars })
    expect(r.wiring.git.ok).toBe(true)
  })

  it('hook declarado que FALTA reprova (pasta existe mas o hook nao)', () => {
    const tars = comGitHooks()
    fs.writeFileSync(path.join(tars, '.ai', 'tars.toml'), '[tars]\nversion = "1.0.0"\n\n[gates]\npre-commit = ["x"]\n')
    const r = doctor({ tars, project: tars })
    expect(r.wiring.git.ok).toBe(false)
    expect(r.wiring.git.detalhe).toMatch(/pre-commit/)
  })
})

// TARS-REC-1: o doctor cobra a CLASSE que repetiu no ledger de incidentes do projeto.
describe('doctor — recorrencia vira FALHA (X = 2)', () => {
  const d = () => [{ id: 'x/y', titulo: 't', fonte: 'REGRA.md', gate: 'pre-commit', prova: 'false', onde: 'ci' }]
  const led = (linhas) => {
    const dir = fixture(d())
    fs.mkdirSync(path.join(dir, '.ai', 'memory'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.ai', 'memory', 'incident-ledger.jsonl'), linhas)
    return dir
  }
  const inc = (over = {}) =>
    JSON.stringify({ id: 'inc-x', data: '2026-10-03', titulo: 'um incidente suficientemente longo', o_que: 'fato', causa: 'causa', correcao: 'correcao', recorrencia: 1, fonte: ['HANDOFF.md'], tags: ['t'], ...over })

  it('classe com 2 ocorrencias sem destino derruba o doctor', () => {
    const tars = led(`${inc({ id: 'inc-a', classe: 'gate/sem-teste', recorrencia: 2 })}\n`)
    const r = doctor({ tars, project: tars })
    expect(r.faltando.map((i) => i.id)).toContain('recorrencia/gate/sem-teste')
    expect(r.faltando.find((i) => i.id === 'recorrencia/gate/sem-teste').detalhe).toMatch(/2x sem 'destino'/)
  })

  it('classe recorrente COM destino nao derruba', () => {
    const tars = led(`${inc({ id: 'inc-a', classe: 'gate/sem-teste', recorrencia: 3, destino: 'TARS-99' })}\n`)
    const r = doctor({ tars, project: tars })
    expect(r.faltando).toHaveLength(0)
    expect(r.classes[0]).toMatchObject({ classe: 'gate/sem-teste', ocorrencias: 3, destino: 'TARS-99' })
  })

  it('ledger ausente nao quebra o doctor (catalogo nasce sem incidentes)', () => {
    const tars = fixture(d())
    const r = doctor({ tars, project: tars })
    expect(r.faltando).toHaveLength(0)
    expect(r.classes).toEqual([])
  })
})
