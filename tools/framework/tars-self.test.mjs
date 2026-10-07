// O Tars e' o seu PRIMEIRO consumidor (a doutrina vale para ele primeiro). Este teste roda
// sobre o PROPRIO repo do catalogo — nao uma fixture — e exige o estado vivo: `.ai/tars.toml`
// declarado, `.githooks/` gerado pelo motor do sync e os hooks executaveis.
//
// Nasceu do incidente de 07/10: `.githooks/` nao existia, o git engolia os commits sem gate
// (a2f7731/cd860d1 sairam sem emoji nem trailer) e nada acusava. Um teste que roda o doctor
// sobre o catalogo real fecha essa classe: se a pasta morrer de novo, o CI reprova.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitHooksCheck } from './tars-doctrines.mjs'
import { readManifest, sync } from './tars-sync.mjs'

const TARS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('Tars — dogfood: o catalogo consome a si mesmo', () => {
  it('tem `.ai/tars.toml` com [gates] declarado', async () => {
    const manifest = await readManifest(TARS)
    expect(Object.keys(manifest.gates).length).toBeGreaterThan(0)
  })

  it('`.githooks/` existe com os hooks do git LIVEIS (nao pasta morta)', () => {
    const r = gitHooksCheck(TARS)
    expect(r.detalhe).not.toMatch(/pasta inexistente/)
    expect(r.ok).toBe(true)
  })

  it('o sync roda sobre o proprio catalogo sem copiar base nem travar lock', async () => {
    // Modo self: nada de `.ai/base/` (a base e' o `.ai/` do catalogo) nem `.ai/tars.lock`.
    expect(fs.existsSync(path.join(TARS, '.ai', 'base'))).toBe(false)
    expect(fs.existsSync(path.join(TARS, '.ai', 'tars.lock'))).toBe(false)
    // Idempotente: rodar de novo nao escreve nada (o repo esta' em dia apos o commit).
    const r = await sync({ tars: TARS, project: TARS, log: () => {} })
    expect(r.hooks).toEqual([])
    expect(fs.existsSync(path.join(TARS, '.githooks', 'commit-msg'))).toBe(true)
  })
})
