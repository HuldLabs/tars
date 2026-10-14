import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KNOWLEDGE_PATHS, deltaOf, headOf, readState, siblingRepos, curate, writeState } from './tars-curation.mjs'

// Um repo git de verdade num tmp: a curadoria e' medida por `git log/diff`, entao um mock de
// fs nao serviria — o teste prova contra o mesmo mecanismo que roda em producao.
function gitInit(dir) {
  const g = (args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
  g(['init', '-q'])
  g(['config', 'user.email', 't@t.local'])
  g(['config', 'user.name', 'T'])
}

function commit(dir, files, msg) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), body)
    execFileSync('git', ['-C', dir, 'add', rel], { stdio: 'ignore' })
  }
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { stdio: 'ignore' })
}

let root
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tars-cur-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('tars curation — delta por ponteiro', () => {
  it('sem ponteiro: nao inventa delta, entrega o HEAD inicial', () => {
    const repo = join(root, 'r')
    mkdirSync(repo)
    gitInit(repo)
    commit(repo, { 'docs/estudos/a.md': 'x' }, 'estudo')
    const d = deltaOf(repo, null)
    expect(d.head.sha).toBeTruthy()
    expect(d.novel).toBe(false)
    expect(d.reason).toMatch(/sem ponteiro/)
  })

  it('ponteiro = HEAD: idempotente (nada andou)', () => {
    const repo = join(root, 'r')
    mkdirSync(repo)
    gitInit(repo)
    commit(repo, { 'docs/estudos/a.md': 'x' }, 'estudo')
    const head = headOf(repo)
    const d = deltaOf(repo, head.sha)
    expect(d.novel).toBe(false)
    expect(d.reason).toMatch(/sem commit novo/)
  })

  it('commit novo em caminho de conhecimento -> novel; codigo puro -> nao', () => {
    const repo = join(root, 'r')
    mkdirSync(repo)
    gitInit(repo)
    commit(repo, { 'docs/estudos/a.md': 'x' }, 'estudo')
    const before = headOf(repo)
    // codigo de produto (nao e' caminho de conhecimento): nao conta
    commit(repo, { 'src/app.js': 'x' }, 'feat codigo')
    expect(deltaOf(repo, before.sha).novel).toBe(false)
    // agora conhecimento: conta
    commit(repo, { 'docs/estudos/b.md': 'y' }, 'estudo novo')
    const d = deltaOf(repo, before.sha)
    expect(d.novel).toBe(true)
    expect(d.commits.join('\n')).toMatch(/estudo novo/)
    expect(d.files).toContain('docs/estudos/b.md')
  })

  it('ponteiro inexistente (force-push) -> novel com motivo, sem quebrar', () => {
    const repo = join(root, 'r')
    mkdirSync(repo)
    gitInit(repo)
    commit(repo, { 'docs/estudos/a.md': 'x' }, 'estudo')
    const d = deltaOf(repo, 'deadbee')
    expect(d.novel).toBe(true)
    expect(d.reason).toMatch(/nao existe/)
  })

  it('siblingRepos devolve so pastas que sao repo git, ordenadas', () => {
    const a = join(root, 'zeta')
    const b = join(root, 'alpha')
    mkdirSync(a); mkdirSync(b)
    gitInit(a); gitInit(b)
    mkdirSync(join(root, 'nao-repo'))
    expect(siblingRepos(root).map((p) => p.slice(root.length + 1))).toEqual(['alpha', 'zeta'])
  })

  it('avanca o ponteiro so de quem andou, e o estado e ordenado (diff limpo)', () => {
    const a = join(root, 'aa')
    const b = join(root, 'bb')
    mkdirSync(a); mkdirSync(b)
    gitInit(a); gitInit(b)
    commit(a, { 'docs/estudos/a.md': 'x' }, 'estudo a')
    commit(b, { 'BACKLOG.md': '# b' }, 'backlog b')
    const stateFile = join(root, 'state.json')
    writeState(stateFile, { repos: { aa: { sha: headOf(a).sha, iso: '2026-01-01' } } })
    // bb nunca teve ponteiro: ganha o inicial; aa nao andou mas ja' tinha ponteiro -> nao muda.
    curate({ reposDir: root, stateFile, advance: true })
    const st = readState(stateFile).repos
    expect(Object.keys(st)).toEqual(['aa', 'bb'])
    expect(st.aa.iso).toBe('2026-01-01')
    expect(st.bb.sha).toBe(headOf(b).sha)
  })

  it('os caminhos de conhecimento cobrem os dois padroes de estudo (docs/ e raiz)', () => {
    expect(KNOWLEDGE_PATHS).toContain('docs/estudos')
    expect(KNOWLEDGE_PATHS).toContain('estudos')
    expect(KNOWLEDGE_PATHS).toContain('HANDOFF*')
    expect(KNOWLEDGE_PATHS).toContain('.ai/memory')
  })
})
