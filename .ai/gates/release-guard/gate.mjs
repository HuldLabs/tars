// gate release-guard — commit que mexe no MOTOR do Tars tem de subir a versao E trazer
// entrada no CHANGELOG (ou declarar `No-Release: <motivo>`).
//
// PORQUE: o consumidor precisa das notas de upgrade (foi o que custou turnos ao seo-brain,
// 07/10). Um commit que muda `tools/framework/tars-*.mjs`, `.ai/gates/`, `.ai/guards/` ou
// `.ai/governance/` sem subir a versao deixa o consumidor sem saber que mudou — o defeito
// que este repositorio existe para corrigir.
//
// Contrato: roda em DOIS hooks, e cada um julga so' o que ele SABE (TARS-BUG release-guard).
//
//   pre-commit  — `git diff --cached` da a lista de arquivos; compara `.ai/VERSION` com o
//                 HEAD. NAO julga isencao: no pre-commit o arquivo da mensagem ainda nao
//                 existe (o git so' o cria no commit-msg) e num WORKTREE o `.git` e' um
//                 ARQUIVO (`gitdir: ...`), entao `join(root, '.git', 'COMMIT_EDITMSG')` nem
//                 existe — ler a mensagem ali dava string vazia e a isencao sumia.
//   commit-msg  — recebe o ARQUIVO da mensagem como argv[2] (dois hooks, um julgamento):
//                 aqui, e so' aqui, a isencao `No-Release:` e' decidida.
//
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
 * Julga o commit staged. Devolve `{ok, motivo, defere}` — sem efeito colateral (o CLI traduz).
 * `mensagem` e' o CONTEUDO da mensagem de commit quando o hook a tem (commit-msg): so' ali o
 * `No-Release:` e' julgado. No pre-commit a mensagem ainda nao existe (`mensagem = null`):
 * sem ela, o gate NAO reprova por falta do par versao+CHANGELOG — ele DEFERE (`defere: true`)
 * para o commit-msg, que decide. Reprovar aqui foi o TARS-BUG release-guard: o pre-commit
 * lia a mensagem de um caminho que num worktree nem existe e a isencao sumia.
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
  const motivo = faltando.join(' + ')
  // Sem mensagem para julgar a isencao (pre-commit), nao reprova: DEFERE ao commit-msg.
  if (mensagem === null) return { ok: true, defere: true, motivo }
  return { ok: false, motivo }
}

/**
 * A mensagem do commit no `commit-msg`: o git passa o ARQUIVO dela como `argv[2]` do gate
 * (o `tars-hooks` repassa os args do hook depois do comando). Sem arquivo = pre-commit.
 */
const mensagemDoArquivo = (arquivo) => {
  try {
    return arquivo && existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : null
  } catch {
    return null
  }
}

// --- CLI -------------------------------------------------------------------
// Dois hooks, um julgamento. O `commit-msg` chega com o arquivo da mensagem em `argv[2]`:
// ali a isencao e' decidida (reprova quando falta o par E nao ha' `No-Release`). O
// `pre-commit` (sem arquivo) so' AVISA o que falta e DEFERE — quem reprova e' o commit-msg.
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const root = process.env.TARS_PROJECT ?? process.cwd()
  const r = julgar(root, { mensagem: mensagemDoArquivo(process.argv[2]) })
  if (r.defere) {
    process.stderr.write(`RELEASE GUARD: motor tocado sem subir versao/CHANGELOG (${r.motivo}); julgado no commit-msg (declare \`No-Release: <motivo>\` se for isento).\n`)
  }
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
