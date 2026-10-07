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

// Licao/incidente em QUATRO CAMPOS (fabber LESSONS-LEARNED.md, item 36 do relatorio).
// Um checklist sozinho pega o sintoma de novo; os 4 campos forcam a CAUSA. "be more careful"
// nunca e' causa nem correcao — e o campo `causa raiz` nao pode repetir o `porque`.
const CAMPOS = ['erro', 'porque', 'causa raiz', 'correcao'];
const CAMPO_RE = new RegExp('^\\s*(?:[-*]\\s*)?(' + CAMPOS.join('|') + ')\\s*:\\s*(.*)$', 'i');
const VAGO_RE = /^(seja mais cuidadoso|ter mais cuidado|be more careful|prestar aten[cç][aã]o|mais aten[cç][aã]o)\b/i;

/** Coleta os trailers `Lesson:`/`No-Lesson:`/`Incident:`/`No-Incident:` do corpo. */
function trailers(msg) {
  const out = {};
  for (const line of msg.split(/\r?\n/)) {
    const m = line.match(/^\s*(Lesson|No-Lesson|Incident|No-Incident)\s*:\s*(.*)$/i);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/**
 * Le o BLOCO de 4 campos (`erro:` / `porque:` / `causa raiz:` / `correcao:`) do corpo.
 * Devolve o mapa dos que apareceram (min/max de 3-4 campos por secao) — quem exige e' o
 * requireTrailer, que tambem confere `causa raiz` != `porque` (senao nao cavou o nivel).
 */
function blocoLicao(msg) {
  const campos = {};
  for (const line of msg.split(/\r?\n/)) {
    const m = line.match(CAMPO_RE);
    if (m) campos[m[1].toLowerCase()] = m[2].trim();
  }
  return campos;
}

/** Normaliza para comparar causa raiz × porque (minúsculas, sem pontuação/acento de borda). */
const norm = (s) => s.toLowerCase().replace(/[.;:!?\s]+$/g, '').trim();

/**
 * Exige o registro do tipo. O gate aceita DUAS formas:
 *   1. trailer `Lesson:`/`Incident:` em 1 linha, ou `No-<Kind>: <motivo >=10 chars>`;
 *   2. o bloco de 4 campos (`erro`/`porque`/`causa raiz`/`correcao`) — que o commit de
 *      `fix` OBRIGA (item 36): o trailer de 1 linha resolve o incidente; a causa raiz exige
 *      os quatro. `causa raiz` == `porque` reprova: nao cavou o nivel.
 */
function requireTrailer(type, tr, blocos, kind) {
  const cap = kind[0].toUpperCase() + kind.slice(1);
  const temNo = tr[`no-${kind}`] && tr[`no-${kind}`].length >= NO_TRAILER_MIN;
  const b = blocos[kind] || {};
  const faltando = CAMPOS.filter((c) => !b[c]);
  const temBloco = faltando.length === 0;
  // `causa raiz` == `porque` = nao cavou o nivel. Vale para o Incident E para a licao: a
  // frase repetida e' o sintoma, nao a causa (fabber LESSONS-LEARNED.md).
  const mesmas = b['causa raiz'] && norm(b['causa raiz']) === norm(b['porque']);
  const exigeCausa = () => {
    console.error(`\ncommit-msg: '${cap}' tem 'causa raiz' igual ao 'porque' — cave um nivel.`);
    console.error('  `porque` e o mecanismo imediato; `causa raiz` e o buraco ESTRUTURAL que o permitiu');
    console.error('  (o check que falta, a instrucao ambigua, o buraco de processo). Se forem a mesma frase,');
    console.error('  a licao vai voltar a acontecer.\n');
    process.exit(1);
  };

  if (kind === 'incident') {
    // `fix` de verdade: o Incident tem de vir COM os 4 campos (1 linha nao basta).
    if (!temBloco) {
      console.error(`\ncommit-msg: '${type}' exige o Incident em 4 campos (INV-LESSON-1).`);
      console.error(`  campos que faltam ou estao vazios: ${faltando.length ? faltando.join(', ') : '—'}`);
      console.error('  escreva no corpo:');
      console.error('    Incident:');
      console.error('      erro: <o que estava errado, concreto>');
      console.error('      porque: <o mecanismo imediato>');
      console.error('      causa raiz: <o buraco estrutural; NAO repita o porque>');
      console.error('      correcao: <o arquivo/gate que muda — nunca "ter mais cuidado">');
      console.error(`  ou escape com No-Incident: <motivo com >=${NO_TRAILER_MIN} chars>\n`);
      process.exit(1);
    }
    if (mesmas) exigeCausa();
    return;
  }

  // Licao: trailer de 1 linha OU bloco completo (a escolha e' do autor).
  if (mesmas) exigeCausa();
  if (tr[kind] || temNo || temBloco) return;
  console.error(`\ncommit-msg: commit '${type}' sem registro de licao.`);
  console.error('  registre o aprendizado em 1 linha ou no bloco de 4 campos:');
  console.error(`    Lesson: <texto|id>   (ou No-Lesson: <motivo com >=${NO_TRAILER_MIN} chars>)`);
  console.error('    Lesson:');
  console.error('      erro: <o que estava errado>');
  console.error('      porque: <o mecanismo imediato>');
  console.error('      causa raiz: <o buraco estrutural; NAO repita o porque>');
  console.error('      correcao: <o arquivo/gate que muda>');
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
  const blocos = { incident: blocoLicao(body), lesson: blocoLicao(body) };
  // "be more careful" nunca e' causa raiz nem correcao (fabber LESSONS-LEARNED.md).
  for (const [campo, valor] of Object.entries(blocos.lesson)) {
    if ((campo === 'causa raiz' || campo === 'correcao') && VAGO_RE.test(valor)) {
      console.error(`commit-msg: '${campo}' vago ('${valor.slice(0, 40)}') — nomeie o arquivo/gate, nao o cuidado.`);
      process.exit(1);
    }
  }
  if (INCIDENT_TYPES.has(ctype)) requireTrailer(ctype, trailers(body), blocos, 'incident');
  if (LESSON_TYPES.has(ctype)) requireTrailer(ctype, trailers(body), blocos, 'lesson');
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
