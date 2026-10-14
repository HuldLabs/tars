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
import { claudeSettings, readManifest } from './tars-sync.mjs'

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
    // Em dia = o settings do repo e' exatamente o que o sync geraria. Calculado EM MEMORIA:
    // chamar o `sync` aqui ESCREVIA no repo real quando ele divergia (TEST-MUTA-REPO, 14/10 —
    // derrubava o `prod-guard` a cada `vitest run`). Teste reprova; nao conserta calado.
    const file = path.join(TARS, '.claude', 'settings.json')
    const atual = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(claudeSettings(await readManifest(TARS), TARS, atual)).toEqual(atual)
    expect(fs.existsSync(path.join(TARS, '.githooks', 'commit-msg'))).toBe(true)
  })
})
