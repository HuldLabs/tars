import { describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import setup from './vitest-tmpdir.mjs'

describe('TMPDIR da suite (01/11: ~12 mil pastas deixadas no /tmp)', () => {
  it('cria um TMPDIR proprio e o teardown apaga tudo, ate arquivo sem escrita', () => {
    const antes = process.env.TMPDIR
    try {
      const teardown = setup()
      const raiz = process.env.TMPDIR
      expect(raiz).toMatch(/tars-suite-/)
      mkdirSync(join(raiz, 'a', 'b'), { recursive: true })
      writeFileSync(join(raiz, 'a', 'b', 'x'), 'x')
      chmodSync(join(raiz, 'a', 'b', 'x'), 0o444)
      chmodSync(join(raiz, 'a', 'b'), 0o555)
      teardown()
      expect(existsSync(raiz)).toBe(false)
    } finally {
      process.env.TMPDIR = antes
    }
  })
})
