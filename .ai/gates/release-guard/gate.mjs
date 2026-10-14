// gate release-guard — commit que mexe no MOTOR do Tars tem de subir a versao E trazer
// entrada no CHANGELOG (ou declarar `No-Release: <motivo>`).
//
// PORQUE: o consumidor precisa das notas de upgrade (foi o que custou turnos ao seo-brain,
// 07/10). Um commit que muda `tools/framework/tars-*.mjs`, `.ai/gates/`, `.ai/guards/` ou
// `.ai/governance/` sem subir a versao deixa o consumidor sem saber que mudou — o defeito
// que este repositorio existe para corrigir.
//
// Contrato (pre-commit): roda `git diff --cached` no projeto (TARS_PROJECT ou cwd), le a
// lista de arquivos tocados e compara `.ai/VERSION` com o HEAD. exit != 0 = reprova.
// Escape: `No-Release: <motivo de 10+ chars>` no corpo da mensagem do commit.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Arquivos cuja mudanca OBRIGA versao+CHANGELOG (o motor e a doutrina do catalogo). */
export const TRIGGERS = [/^tools\/framework\/tars-.*\.mjs$/, /^\.ai\/gates\//, /^\.ai\/guards\//, /^\.ai\/governance\//]

/** O commit toca o motor? (usa os arquivos staged). */
export const tocaMotor = (arquivos) => arquivos.some((a) => TRIGGERS.some((re) => re.test(a)))

/** Versao do catalogo: `.ai/VERSION` (a fonte; `package.json` e' o espelho). */
export function versaoDe(root) {
  const v = join(root, '.ai', 'VERSION')
  if (!existsSync(v)) return null
  return readFileSync(v, 'utf8').trim() || null
}

/** Versao no HEAD (a commitada). `null` quando o arquivo ainda nao existe no git. */
function versaoNoHead(root) {
  try {
    return execFileSync('git', ['-C', root, 'show', 'HEAD:.ai/VERSION'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const staged = (root) =>
  execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Julga o commit staged. Devolve `{ok, motivo}` — sem efeito colateral (o CLI traduz).
 * `mensagem` (opcional) e' o texto do commit, para o escape `No-Release:`.
 */
export function julgar(root, { mensagem = null, arquivos = staged(root), head = versaoNoHead(root), atual = versaoDe(root) } = {}) {
  if (!tocaMotor(arquivos)) return { ok: true, motivo: 'nao toca o motor do Tars' }
  if (mensagem && /No-Release:\s*\S[\s\S]{9,}/i.test(mensagem)) return { ok: true, motivo: 'No-Release declarado' }
  const subiuVersao = atual && atual !== head
  const changelog = arquivos.some((a) => a === 'CHANGELOG.md')
  if (subiuVersao && changelog) return { ok: true, motivo: `versao ${head} -> ${atual} + CHANGELOG` }
  const faltando = []
  if (!subiuVersao) faltando.push('.ai/VERSION nao subiu')
  if (!changelog) faltando.push('CHANGELOG.md sem entrada')
  return { ok: false, motivo: faltando.join(' + ') }
}

const mensagemDe = (root) => {
  // No `pre-commit` o arquivo da mensagem nao existe (so' no commit-msg): le a mensagem
  // do indice quando houver, senao o corpo do ultimo `-m`. Sem ela, so' resta exigir o par.
  // Num worktree `.git` e' um ARQUIVO (`gitdir: ...`), entao `join(root,'.git',...)` nunca
  // achava o COMMIT_EDITMSG e o escape `No-Release:` era ignorado em silencio — justo onde o
  // fluxo de fatia por worktree mais depende dele. `git rev-parse --git-path` resolve os dois.
  try {
    const viaGit = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'COMMIT_EDITMSG'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const rel = viaGit || join('.git', 'COMMIT_EDITMSG')
    const f = rel.startsWith('/') ? rel : join(root, rel)
    return existsSync(f) ? readFileSync(f, 'utf8') : ''
  } catch {
    return ''
  }
}

// --- CLI (pre-commit) ------------------------------------------------------
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const root = process.env.TARS_PROJECT ?? process.cwd()
  const r = julgar(root, { mensagem: mensagemDe(root) })
  if (!r.ok) {
    process.stderr.write(
      [
        `RELEASE GUARD: commit toca o motor do Tars sem subir a versao/CHANGELOG (${r.motivo}).`,
        '',
        'Suba `.ai/VERSION` (e o espelho `package.json`) e acrescente a secao da versao no',
        '`CHANGELOG.md` com as 4 subsecoes (O que mudou / Por que / Arquivos impactados /',
        'O que o consumidor faz). Se for isento, declare `No-Release: <motivo>` no commit.',
        '',
      ].join('\n'),
    )
    process.exit(1)
  }
}
