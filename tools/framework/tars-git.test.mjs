// `tars git prune` — a poda de branches incorporadas. O contrato: a incorporada SOME,
// a nao incorporada FICA, `main` e a atual FICAM, `--dry-run` nao apaga, `--remote` so'
// toca o `origin`. Repo temporario real (git de verdade), nunca o repo da suite.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitPrune } from './tars-git.mjs'

/** `git <args>` no repo de teste (config minima: sem user global, sem hooks). */
function g(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** Cria um commit vazio na branch atual (nao depende de arquivos). */
function commit(cwd, msg) {
  g(cwd, 'commit', '--allow-empty', '-m', msg)
}

describe('tars git prune', () => {
  let repo
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'tars-git-'))
    g(repo, 'init', '-q', '-b', 'main')
    g(repo, 'config', 'user.email', 't@t.local')
    g(repo, 'config', 'user.name', 't')
    commit(repo, 'c0')
  })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('apaga a incorporada e preserva main, a atual e a nao incorporada', async () => {
    // `feita`: nasce de main e volta sem commit -> ancestral de main e da atual.
    g(repo, 'branch', 'feita')
    // A atual e' `trabalho`, feita a partir de main (deve ficar mesmo sem commit).
    g(repo, 'checkout', '-q', '-b', 'trabalho')
    // `pendente`: ramifica de MAIN (nao da atual) e ganha commit proprio — fica.
    g(repo, 'checkout', '-q', '-b', 'pendente', 'main')
    commit(repo, 'so-na-pendente')
    g(repo, 'checkout', '-q', 'trabalho')

    const logs = []
    await gitPrune({ project: repo, log: (l) => logs.push(l) })

    const rest = g(repo, 'branch', '--format=%(refname:short)').split('\n').filter(Boolean)
    expect(rest).toContain('main')
    expect(rest).toContain('trabalho')
    expect(rest).toContain('pendente')
    expect(rest).not.toContain('feita')
    expect(logs.join('\n')).toContain('feita') // sempre imprime o que apaga
  })

  it('--dry-run imprime e NAO apaga', async () => {
    g(repo, 'branch', 'feita')
    const logs = []
    await gitPrune({ project: repo, dryRun: true, log: (l) => logs.push(l) })
    expect(logs.join('\n')).toContain('feita')
    expect(g(repo, 'branch', '--format=%(refname:short)')).toContain('feita')
  })

  it('branch de main tambem e' + ' alvo da poda', async () => {
    // `velha`: incorporada em main, mas nao alcancavel da atual (a atual tem so' c0).
    g(repo, 'checkout', '-q', '-b', 'velha')
    commit(repo, 'so-na-velha')
    g(repo, 'checkout', '-q', 'main')
    g(repo, 'merge', '-q', '--ff-only', 'velha')
    g(repo, 'checkout', '-q', 'main')

    await gitPrune({ project: repo, log: () => {} })
    const rest = g(repo, 'branch', '--format=%(refname:short)')
    expect(rest).not.toContain('velha')
    expect(rest).toContain('main')
  })

  it('idempotente: a segunda passada nao acha nada', async () => {
    g(repo, 'branch', 'feita')
    await gitPrune({ project: repo, log: () => {} })
    const logs = []
    await gitPrune({ project: repo, log: (l) => logs.push(l) })
    expect(logs.join('\n')).toContain('nada a podar')
  })

  it('--remote apaga a incorporada do origin e mantem main no servidor', async () => {
    // Bare como `origin`; a `feita` la' fica SOH no servidor (sem local homonima).
    const origin = mkdtempSync(join(tmpdir(), 'tars-origin-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
      g(repo, 'remote', 'add', 'origin', origin)
      g(repo, 'push', '-q', 'origin', 'main')
      g(repo, 'branch', 'feita')
      g(repo, 'push', '-q', 'origin', 'feita')
      g(repo, 'branch', '-D', 'feita') // so' no origin agora

      const logs = []
      await gitPrune({ project: repo, remote: true, log: (l) => logs.push(l) })

      const heads = g(repo, 'ls-remote', '--heads', 'origin')
      expect(heads).toContain('refs/heads/main')
      expect(heads).not.toContain('refs/heads/feita')
      expect(logs.join('\n')).toContain('origin')
    } finally {
      rmSync(origin, { recursive: true, force: true })
    }
  })
})
