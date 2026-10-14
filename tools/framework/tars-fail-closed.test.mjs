// dev.21: o que vigia nao pode aprovar quando falta a peca que vigia (14/10).
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..', '..')

describe('fail-closed (dev.21)', () => {
  for (const g of ['block-secret-dump', 'block-destructive-commands']) {
    it(`guard ${g} sem lib-json.sh BLOQUEIA (exit 2), nunca aprova`, () => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-fc-'))
      fs.copyFileSync(path.join(raiz, '.ai/guards', `${g}.sh`), path.join(d, `${g}.sh`))
      const r = spawnSync('bash', [path.join(d, `${g}.sh`)], { input: '{"tool_input":{"command":"ls"}}', encoding: 'utf8' })
      expect(r.status).toBe(2)
      expect(r.stderr).toMatch(/lib-json\.sh ausente/)
    })
  }

  it('doutrina gates/linha-de-base aponta arquivo que existe no catalogo (sem DRIFT no binario)', () => {
    const t = fs.readFileSync(path.join(raiz, '.ai/doctrines.toml'), 'utf8')
    const bloco = t.split('[[doctrine]]').find((b) => b.includes('id = "gates/linha-de-base"'))
    const gate = /gate = "([^"]+)"/.exec(bloco)[1]
    expect(gate.startsWith('../../.ai/')).toBe(true)
    expect(fs.existsSync(path.join(raiz, gate.replace('../../', '')))).toBe(true)
  })
})
