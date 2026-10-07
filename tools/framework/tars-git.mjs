#!/usr/bin/env node
// `tars git prune` — tira do repo as branches JA' incorporadas (governanca `.ai/governance/git.md`).
// Por que existe: no segtools isso foi feito a mao (43 locais + 44 remotas incorporadas
// apagadas); e' "como trabalhamos", entao mora no catalogo e vai por padrao a todos.
//
// REGRAS (a policy desta fatia):
//   * apaga branch LOCAL incorporada na branch atual E na `main` (as duas sao poda);
//   * NUNCA apaga a `main` nem a branch atual (destas nao ha volta);
//   * `git branch -d` (nunca `-D`): o `-d` barra o que nao esta incorporado — e' o
//     travao que torna a poda segura mesmo se a checagem de merge errar;
//   * `--remote` estende ao `origin` e SO' ao `origin` (nunca outro remote);
//   * SEMPRE imprime o que vai apagar; `--dry-run` nao apaga;
//   * idempotente: rodar de novo sem novidade nao muda nada.
import { spawnSync } from 'node:child_process'

/** `git <args>` na pasta `cwd`; devolve `{ ok, out }` (nunca lanca — o caller decide). */
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

/** Branches locais (nomes) via `for-each-ref` — sem `* `/`+ ` do `git branch`. */
function localBranches(cwd) {
  const r = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd)
  return r.ok ? r.out.split('\n').filter(Boolean) : []
}

/** Branches do remote (nomes) via `git ls-remote --heads`. */
function remoteHeads(remote, cwd) {
  const r = git(['ls-remote', '--heads', remote], cwd)
  if (!r.ok) return []
  return r.out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t')[1])
    .filter((ref) => ref?.startsWith('refs/heads/'))
    .map((ref) => ref.slice('refs/heads/'.length))
}

/** `true` se a branch foi incorporada nalgum dos `targets` (merge-base ja' e' ancestral). */
function mergedInto(sha, targets, cwd) {
  return targets.some((t) => {
    const r = git(['merge-base', '--is-ancestor', sha, t], cwd)
    // exit 0 = incorporada; 1 = nao; 128 = ref ausente (target nao existe aqui).
    return r.ok
  })
}

export async function gitPrune({ project = process.cwd(), remote = false, dryRun = false, log = console.log } = {}) {
  const cwd = project
  const top = git(['rev-parse', '--show-toplevel'], cwd)
  if (!top.ok) throw new Error(`nao achei um repo git em ${cwd}`)

  const current = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).out
  // Branches de poda: a `main` quando EXISTE aqui, e a atual.
  const targets = []
  if (localBranches(cwd).includes('main')) targets.push('main')
  if (current && current !== 'HEAD') targets.push(current)

  // --- locais ---------------------------------------------------------------
  const locals = []
  for (const b of localBranches(cwd)) {
    if (b === 'main') continue
    if (b === current) continue
    const sha = git(['rev-parse', b], cwd).out
    if (!sha || !mergedInto(sha, targets, cwd)) continue
    locals.push(b)
  }

  // --- remotas (so' `origin`) ----------------------------------------------
  const remotes = []
  if (remote) {
    const known = new Set(localBranches(cwd))
    for (const b of remoteHeads('origin', cwd)) {
      if (b === 'main') continue
      // Ja' existe uma local de mesmo nome? Se for podavel, a poda local ja' a
      // resolve; se NAO for (A tem commits so' no origin), apagar o origin perderia
      // trabalho — entao a local manda e a remota fica.
      if (known.has(b)) continue
      const sha = git(['ls-remote', '--heads', 'origin', b], cwd).out.split('\t')[0]
      if (!sha || !mergedInto(sha, targets, cwd)) continue
      remotes.push(b)
    }
  }

  const nothing = !locals.length && !remotes.length
  if (nothing) {
    log('nada a podar.')
    return { locals: [], remotes: [], dryRun }
  }

  // SEMPRE imprime o que vai apagar, antes de apagar.
  for (const b of locals) log(`branch local: ${dryRun ? 'apagaria' : 'apagando'} ${b}`)
  for (const b of remotes) log(`branch origin: ${dryRun ? 'apagaria' : 'apagando'} ${b}`)
  if (dryRun) return { locals, remotes, dryRun }

  for (const b of locals) {
    // `-d` de proposito: se nao estiver incorporada (corrida entre o calculo e o
    // delete), o git barra em vez de perder a branch.
    const r = git(['branch', '-d', b], cwd)
    if (!r.ok) log(`  (nao apaguei ${b}: ${r.out.split('\n')[0]})`)
  }
  for (const b of remotes) {
    const r = git(['push', 'origin', '--delete', b], cwd)
    if (!r.ok) log(`  (nao apaguei origin/${b}: ${r.out.split('\n')[0]})`)
  }
  return { locals, remotes, dryRun }
}
