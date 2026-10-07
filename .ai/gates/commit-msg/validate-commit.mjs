// Valida/injeta commit no formato <emoji> <type>(<scope>): <descr> (INV-GIT-2),
// valida branch (<type>/<slug>) e tag (SemVer) — portado do Fabber
// (docs/reference/fabber-githooks/conventional_emoji.py), em Node.
// E valida o registro de licao/incidente (INV-LESSON-1): fix/bug/hotfix exige
// trailer `Incident:`/`No-Incident: <motivo>`; feat/refactor/perf exige
// `Lesson:`/`No-Lesson: <motivo>` com motivo >=10 chars. Escape = trailer,
// nunca --no-verify. Portado de seo-brain §9-10 (ideia, reescrita em Node).
// Uso:
//   node validate-commit.mjs --validate <msgFile>
//   node validate-commit.mjs --inject <msgFile>
//   node validate-commit.mjs --validate-branch <branch>
//   node validate-commit.mjs --validate-tag <tag>
import fs from 'node:fs';
import { TYPES, EMOJI, SUBJECT_RE, MAX_SUBJECT } from './emoji.mjs';

const [mode, arg] = [process.argv[2], process.argv[3]];

const SEMVER_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const PRERELEASE_ROOTS = new Set(['dev', 'alpha', 'beta', 'rc', 'preview', 'pre', 'canary']);
const BUILD_ROOTS = new Set(['build', 'exp', 'sha', 'local', 'hotfix', 'fix']);
const BRANCH_RE = /^([a-z]+)\/([a-z0-9][a-z0-9._-]{1,})$/;
const BRANCH_TYPES = new Set(Object.keys(TYPES).filter((t) => t !== 'merge'));

// Gate de registro de licao/incidente (INV-LESSON-1, seo-brain §9-10).
const INCIDENT_TYPES = new Set(['fix', 'bug', 'hotfix']);
const LESSON_TYPES = new Set(['feat', 'refactor', 'perf']);
const NO_TRAILER_MIN = 10; // "nada novo" so vale se nomear (motivo >=10 chars)

/** Coleta os trailers `Lesson:`/`No-Lesson:`/`Incident:`/`No-Incident:` do corpo. */
function trailers(msg) {
  const out = {};
  for (const line of msg.split(/\r?\n/)) {
    const m = line.match(/^\s*(Lesson|No-Lesson|Incident|No-Incident)\s*:\s*(.*)$/i);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/** Exige o trailer (ou o No-* com motivo) do tipo, senao aborta com exemplo. */
function requireTrailer(type, tr, kind) {
  const has = tr[kind] || (tr[`no-${kind}`] && tr[`no-${kind}`].length >= NO_TRAILER_MIN);
  if (has) return;
  const cap = kind[0].toUpperCase() + kind.slice(1);
  console.error(`\ncommit-msg: commit '${type}' sem registro de ${kind === 'lesson' ? 'licao' : 'incidente'}.`);
  console.error(`  registre o ${kind === 'lesson' ? 'aprendizado' : 'incidente'} ou use um trailer:`);
  console.error(`    ${cap}: <texto|id>`);
  console.error(`    No-${cap}: <motivo com >=${NO_TRAILER_MIN} chars>`);
  console.error(`  ex.:   ${cap}: o adapter sobe no host do MCP`);
  console.error('  (escapar e' + ' trailer, nunca --no-verify)\n');
  process.exit(1);
}

// --validate-branch / --validate-tag sao independentes de arquivo.
if (mode === '--validate-branch') {
  const b = (arg || '').trim();
  if (!b) { console.error('branch vazia'); process.exit(1); }
  if (b === 'main' || b === 'master' || b.startsWith('dependabot/') || b.startsWith('renovate/')) process.exit(0);
  const m = b.match(BRANCH_RE);
  if (!m || !BRANCH_TYPES.has(m[1])) {
    console.error(`branch invalida '${b}': use <type>/<kebab-slug> (tipos: ${[...BRANCH_TYPES].sort().join(', ')})`);
    process.exit(1);
  }
  process.exit(0);
}
if (mode === '--validate-tag') {
  const t = (arg || '').trim();
  const m = t.match(SEMVER_RE);
  if (!m) { console.error(`tag invalida '${t}': esperado vMAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`); process.exit(1); }
  if (m[4] && !PRERELEASE_ROOTS.has(m[4].split('.')[0])) { console.error(`pre-release invalido '${m[4]}'`); process.exit(1); }
  if (m[5] && !BUILD_ROOTS.has(m[5].split('.')[0])) { console.error(`build metadata invalido '${m[5]}'`); process.exit(1); }
  process.exit(0);
}

if (!arg) process.exit(0);
const msg = fs.readFileSync(arg, 'utf8');
const lines = msg.split(/\r?\n/);
const first = lines[0] || '';

// merges/reverts/fixups/squash = sem sujeito a validar
if (/^(Merge |Revert |fixup! |squash! )/.test(first) || first.startsWith('Revert "')) process.exit(0);

if (mode === '--validate') {
  const m = first.match(SUBJECT_RE);
  if (!m) {
    console.error('\ncommit-msg: formato invalido. Use: <emoji> <type>(<scope>): <descricao>');
    console.error('  tipos: ' + Object.keys(TYPES).join(', '));
    console.error('  ex.:    ? feat(hub): adiciona login local');
    console.error('  escape: git commit --no-verify\n');
    process.exit(1);
  }
  // EMOJI tem de casar com o TIPO (o commit-msg do Fabber usa --require-emoji).
  const type = first.match(/(?:^\S+\s+)?([a-z]+)(\(|!|:)/)?.[1];
  if (type && TYPES[type]) {
    const got = first.match(/^(\S+)\s+/)?.[1];
    if (got !== TYPES[type]) {
      console.error(`commit-msg: emoji '${got}' nao casa com o tipo '${type}' (esperado '${TYPES[type]}').`);
      console.error('  (o prepare-commit-msg injeta o emoji correto — se chegou aqui errado, rode de novo.)\n');
      process.exit(1);
    }
  }
  if (first.length > MAX_SUBJECT && !first.startsWith('Merge')) {
    console.error(`commit-msg: sujeito com ${first.length} chars (max ${MAX_SUBJECT}).`);
    process.exit(1);
  }
  // INV-LESSON-1: fix/bug/hotfix registra incidente; feat/refactor/perf registra licao.
  // As linhas acima ja isentaram merge/revert/fixup!/squash!.
  const ctype = first.match(/(?:^\S+\s+)?([a-z]+)(\(|!|:)/)?.[1];
  const body = lines.slice(1).join('\n');
  if (INCIDENT_TYPES.has(ctype)) requireTrailer(ctype, trailers(body), 'incident');
  if (LESSON_TYPES.has(ctype)) requireTrailer(ctype, trailers(body), 'lesson');
  process.exit(0);
}

if (mode === '--inject') {
  // Normaliza o emoji: o TIPO e a fonte da verdade (substitui errado, idempotente).
  const m2 = first.match(/^(?:(\S+)\s+)?([a-z]+)(\([a-z0-9_/-]+\))?(!)?:\s+(.+)$/);
  if (m2) {
    const type = m2[2];
    const emoji = TYPES[type];
    if (emoji) {
      const rebuilt = `${emoji} ${type}${m2[3] || ''}${m2[4] || ''}: ${m2[5]}`;
      if (rebuilt !== first) { lines[0] = rebuilt; fs.writeFileSync(arg, lines.join('\n')); }
    }
  }
  process.exit(0);
}

void EMOJI;
