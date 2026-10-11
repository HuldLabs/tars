import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Testes do gate `daneel-acoes` — as 3 condicoes de parada da Daneel viram prova que
// REPROVA (exit 2). Mesmo contrato do `no-add-all`: payload do PreToolUse no stdin;
// exit 2 = bloqueia, exit 0 = deixa passar. Julga-se pelo EXIT CODE e pela mensagem,
// nunca pela leitura do codigo (a prova tem de valer pelo comportamento).
const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(HERE, '..', '..', '.ai', 'gates', 'daneel-acoes', 'daneel-acoes.mjs')

/** Roda o gate com o payload de PreToolUse; devolve `{ status, stderr }`. */
function puxar(command) {
  const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
  const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', input: payload })
  return { status: r.status, stderr: r.stderr }
}

describe('gate daneel-acoes — condicoes de parada', () => {
  it('bloqueia force-push (as tres formas)', () => {
    for (const c of ['git push --force origin main', 'git push -f', 'git push --force-with-lease']) {
      expect(puxar(c).status, c).toBe(2)
    }
  })

  it('bloqueia publicar/tornar repo PUBLICO', () => {
    expect(puxar('gh repo create x --public').status).toBe(2)
    expect(puxar('gh repo edit x --visibility public').status).toBe(2)
  })

  it('bloqueia escrita no cofre (op item edit/create/delete, tars secrets set)', () => {
    expect(puxar('op item edit foo').status).toBe(2)
    expect(puxar('tars secrets set K').status).toBe(2)
  })

  it('deixa passar o push normal e a LEITURA do cofre', () => {
    expect(puxar('git push origin main').status).toBe(0)
    expect(puxar('op read op://v/i/f').status).toBe(0)
    expect(puxar('gh repo create x --private').status).toBe(0)
  })

  it('bloqueia nomeando a condicao de parada e o override do OPERADOR', () => {
    const r = puxar('git push --force origin main')
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/force-push|ORDEM/i)
    expect(r.stderr).toMatch(/DANEEL_ALLOW/)
  })

  it('aceita o override do OPERADOR (DANEEL_ALLOW=1) por invocacao', () => {
    expect(puxar('DANEEL_ALLOW=1 git push --force origin main').status).toBe(0)
  })

  it('falha ABERTA em payload ruim (guarda-corpo, nao barreira)', () => {
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', input: 'nao-e-json' })
    expect(r.status).toBe(0)
  })

  it('ignora tool que nao seja Bash/PowerShell', () => {
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { command: 'git push --force' } })
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', input: payload })
    expect(r.status).toBe(0)
  })
})
