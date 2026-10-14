// FATIA 2A, item 2 — "binario sem checkout": o `dist/tars` compilado tem de funcionar num
// diretorio SEM o repo do Tars e SEM `TARS_HOME`, para onde ele for publicado (asset da
// release / imagem `FROM scratch` com so' `/tars`). A prova e' rodar o BINARIO de verdade
// num tmpdir — nao uma funcao isolada.
//
// O que dependia do checkout (`--version`, `doctor`, `sync --check`) era BUG: a correcao e'
// EMBUTIR o catalogo no binario em build (`tars-embed-catalog.mjs` -> `tars-embedded.mjs`) e
// materializa-lo num cache no primeiro uso (`tars-embedded-runtime.mjs`).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { ARQUIVOS, VERSION } from './tars-embedded.mjs'
import { materializar, raizCache } from './tars-embedded-runtime.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TARS = resolve(HERE, '..', '..')
const BIN = join(TARS, 'dist', 'tars')

const tmp = () => mkdtempSync(join(tmpdir(), 'tars-embed-'))

describe('catalogo embutido — geracao', () => {
  it('traz a versao do catalogo e os assets que o binario precisa', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    // Os arquivos que `sync`/`doctor`/`hooks` leem: o manifesto, a versao e os gates.
    expect(Object.keys(ARQUIVOS)).toContain('.ai/VERSION')
    expect(Object.keys(ARQUIVOS)).toContain('.ai/tars.toml')
    expect(Object.keys(ARQUIVOS).some((p) => p.startsWith('.ai/gates/'))).toBe(true)
    expect(Object.keys(ARQUIVOS).some((p) => p.startsWith('.ai/guards/'))).toBe(true)
  })

  it('NAO embute cache nem segredo (so asset)', () => {
    expect(Object.keys(ARQUIVOS).some((p) => p.endsWith('.sops'))).toBe(false)
    expect(Object.keys(ARQUIVOS).some((p) => p.includes('.cache/'))).toBe(false)
  })
})

describe('materializar — o catalogo embutido vira um TARS_HOME', () => {
  it('escreve a arvore no cache e devolve a raiz (idempotente)', () => {
    const cache = join(tmp(), 'catalog')
    const env = { TARS_EMBED_CACHE: cache }
    const raiz = materializar({ env })
    expect(raiz).toBe(raizCache(env))
    expect(existsSync(join(raiz, '.ai', 'VERSION'))).toBe(true)
    // Roda de novo: nao reescreve (a sentinela ja' esta' la') e devolve a MESMA raiz.
    expect(materializar({ env })).toBe(raiz)
  })
})

// O binario: compila UMA vez (o `bun build --compile` gasta ~3s) e os testes rodam contra ele.
describe('binario compilado SEM checkout (fatia 2a, item 2)', () => {
  let dir // tmpdir onde o binario e' COPIADO (fora do repo) e o cache embutido e' isolado

  beforeAll(() => {
    dir = tmp()
    // Regenera o modulo embutido a partir do catalogo corrente e compila — a prova usa o
    // binario que a release publica, nao um `dist/tars` velho.
    execFileSync('node', [join(TARS, 'tools', 'framework', 'tars-embed-catalog.mjs'), '--tars', TARS, '--out', join(TARS, 'tools', 'framework', 'tars-embedded.mjs')], { stdio: 'ignore' })
    execFileSync('bun', ['build', '--compile', join(TARS, 'tools', 'framework', 'tars.mjs'), '--outfile', BIN], { stdio: 'ignore' })
  }, 60_000)

  /** Roda o binario COPIADO para fora do repo, sem TARS_HOME, com o cache embutido isolado. */
  const rodarBin = (args, cwd = dir) => {
    const bin = join(dir, 'tars')
    if (!existsSync(bin)) execFileSync('cp', [BIN, bin])
    return spawnSync(bin, args, {
      cwd,
      encoding: 'utf8',
      // `TARS_HOME` AUSENTE de proposito (o cenario do bug); o cache embutido fica em `dir`.
      env: { PATH: process.env.PATH, TARS_EMBED_CACHE: join(dir, 'cache') },
    })
  }

  it('--version responde a versao do catalogo (nao "nao achei a raiz do Tars")', () => {
    const r = rodarBin(['--version'])
    expect(r.stderr).not.toMatch(/nao achei a raiz do Tars/)
    expect(r.stdout.trim()).toBe(VERSION)
    expect(r.status).toBe(0)
  })

  it('doctor resolve as doutrinas a partir do catalogo embutido', () => {
    const r = rodarBin(['doctor', '--project', dir, '--json'])
    expect(r.stderr).not.toMatch(/nao achei a raiz do Tars/)
    expect(r.stdout).toMatch(/catalogo /)
    // O CATALOGO veio do binario: as doutrinas do catalogo foram carregadas e NENHUMA ficou
    // PHANTOM (a prova roda contra a raiz materializada). O exit != 0 aqui e' so' o projeto
    // tmpdir sem `.claude/settings.json` (wiring) — nao e' o defeito do "sem checkout".
    const r2 = rodarBin(['doctor', '--project', dir])
    const catalogo = (r2.stdout.match(/catalogo (.+)/) ?? [])[1]
    expect(catalogo).toBeTruthy()
    expect(r2.stdout).toMatch(/PHANTOM 0/)
    expect(r2.stdout).not.toMatch(/nao achei a raiz do Tars/)
  })

  it('sync --check julga a base contra o catalogo embutido', () => {
    const proj = join(dir, 'proj')
    mkdirSync(join(proj, '.ai'), { recursive: true })
    writeFileSync(join(proj, '.ai', 'tars.toml'), '[tars]\nversion = "0.0.1-dev.17"\n')
    const r = rodarBin(['sync', '--check', '--project', proj], proj)
    expect(r.stderr).not.toMatch(/nao achei a raiz do Tars/)
    expect(r.stdout).toMatch(/base do Tars ok/)
    expect(r.status).toBe(0)
  })

  it('identity show le a identidade do projeto (sem checkout)', () => {
    const proj = join(dir, 'proj2')
    mkdirSync(join(proj, '.ai'), { recursive: true })
    writeFileSync(join(proj, '.ai', 'tars.toml'), '[identity]\nactor = "daneel"\n')
    const r = rodarBin(['identity', 'show', '--project', proj], proj)
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/daneel/)
  })
})
