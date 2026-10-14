import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isTracked, stagedPaths, touchesStaged, trackedPaths } from './tars-staged.mjs'

// O gate julga o INDICE, nao a arvore (regra do dono, 14/10; porte da SEG-236/245). Os casos
// abaixo provam as duas pontas: (a) o arquivo sujo-fora-do-stage NAO entra; (b) o staged entra.
// Prova-se pelo git de verdade (repo tmp), nao por leitura do codigo.

let repo
const sh = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const escreve = (rel, texto) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), texto)
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-staged-'))
  sh('init', '-q')
  sh('config', 'user.email', 't@t.local')
  sh('config', 'user.name', 'T')
})
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

describe('stagedPaths', () => {
  it('devolve SO o que esta no indice — o arquivo sujo da arvore nao aparece', () => {
    escreve('a.mjs', 'export const a = 1\n')
    sh('add', '--', 'a.mjs')
    // O rascunho de OUTRO worker: existe no disco, nao foi staged.
    escreve('b.mjs', 'export const b = 2\n')
    expect(stagedPaths(repo)).toEqual(['a.mjs'])
  })

  it('o DELETADO conta (a pergunta e "o commit toca a familia?")', () => {
    escreve('a.mjs', 'x\n')
    sh('add', '--', 'a.mjs')
    sh('commit', '-q', '-m', 'base')
    fs.rmSync(path.join(repo, 'a.mjs'))
    sh('add', '-A', '--', 'a.mjs')
    expect(stagedPaths(repo)).toEqual(['a.mjs'])
  })

  it('sem git devolve null (quem chama decide, nunca engole)', () => {
    const solto = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-nogit-'))
    try {
      expect(stagedPaths(solto)).toBeNull()
    } finally {
      fs.rmSync(solto, { recursive: true, force: true })
    }
  })
})

describe('touchesStaged — o portao de relevancia', () => {
  it('string casa por PREFIXO de caminho', () => {
    expect(touchesStaged(['tools/framework/x.mjs'], 'tools/framework/')).toBe(true)
    expect(touchesStaged(['docs/README.md'], 'tools/framework/')).toBe(false)
  })

  it('RegExp e funcao casam pela propria regua do gate', () => {
    expect(touchesStaged(['docs/REFERENCES.md'], [/^docs\/REFERENCES\.md$/])).toBe(true)
    expect(touchesStaged(['a.ts'], [(rel) => rel.endsWith('.ts')])).toBe(true)
    expect(touchesStaged(['a.md'], [(rel) => rel.endsWith('.ts')])).toBe(false)
  })

  it('staged null (sem git) RODA o gate — pular por nao saber seria green falso', () => {
    expect(touchesStaged(null, 'tools/framework/')).toBe(true)
  })
})

describe('trackedPaths / isTracked — so o rastreia', () => {
  it('arquivo gitignored NAO e superficie de gate', () => {
    fs.writeFileSync(path.join(repo, '.gitignore'), '.cache/\n')
    escreve('a.mjs', 'x\n')
    escreve('.cache/tmp.mjs', 'y\n')
    sh('add', '--', '.gitignore', 'a.mjs')
    const tracked = trackedPaths(repo)
    expect(isTracked(tracked, 'a.mjs')).toBe(true)
    expect(isTracked(tracked, '.cache/tmp.mjs')).toBe(false)
  })

  it('sem git devolve null e isTracked nao julga (true)', () => {
    const solto = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-nogit-'))
    try {
      const tracked = trackedPaths(solto)
      expect(tracked).toBeNull()
      expect(isTracked(tracked, 'qualquer.mjs')).toBe(true)
    } finally {
      fs.rmSync(solto, { recursive: true, force: true })
    }
  })
})
