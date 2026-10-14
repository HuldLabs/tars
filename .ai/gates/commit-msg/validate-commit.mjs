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
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TYPES, EMOJI, SUBJECT_RE, MAX_SUBJECT } from './emoji.mjs';

const [mode, arg] = [process.argv[2], process.argv[3]];

// dev.8, fatia 2: `[gates.params.commit-msg] lesson = "agent"` torna a exigencia de
// licao/incidente CONDICIONAL ao AUTOR — o agente registra o que aprendeu, o humano que
// escreve a mao nao inventa licao. Default `always`: cobra de todo mundo (o de sempre).
// Emoji, tipo e os 72 chars NAO dependem do param — valem sempre.
const PARAMS = JSON.parse(process.env.TARS_GATE_PARAMS || '{}');

const SEMVER_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const PRERELEASE_ROOTS = new Set(['dev', 'alpha', 'beta', 'rc', 'preview', 'pre', 'canary']);
const BUILD_ROOTS = new Set(['build', 'exp', 'sha', 'local', 'hotfix', 'fix']);
const BRANCH_RE = /^([a-z]+)\/([a-z0-9][a-z0-9._-]{1,})$/;
const BRANCH_TYPES = new Set(Object.keys(TYPES).filter((t) => t !== 'merge'));

// Gate de registro de licao/incidente (INV-LESSON-1, seo-brain §9-10).
const INCIDENT_TYPES = new Set(['fix', 'bug', 'hotfix']);
const LESSON_TYPES = new Set(['feat', 'refactor', 'perf']);
const NO_TRAILER_MIN = 10; // "nada novo" so vale se nomear (motivo >=10 chars)
// TARS-RED-1: `fix:` SEM tocar um arquivo de teste e' a correcao que nao prova nada —
// o teste que REPROVA antes da correcao e' o que distingue conserto de palpite (R4).
// Escape honesto: `No-Test: <motivo >=10 chars>` no corpo (ex.: typo, doc, config).
const TEST_RE = /(^|\/)(test|tests|spec|specs|__tests__|__fixtures__)\//i;
// Shell conta como teste (Endurance, 14/10: todo teste dele e' .sh/.bats).
const TEST_FILE_RE = /\.(test|spec)\.([cm]?[jt]sx?|sh)$|_test\.sh$|\.bats$|(^|\/)(test_[^/]+|[^/]+_test)\.py$|(^|\/)tests?\.py$|(^|\/)conftest\.py$/i;

// Licao/incidente em QUATRO CAMPOS (fabber LESSONS-LEARNED.md, item 36 do relatorio).
// Um checklist sozinho pega o sintoma de novo; os 4 campos forcam a CAUSA. "be more careful"
// nunca e' causa nem correcao — e o campo `causa raiz` nao pode repetir o `porque`.
const CAMPOS = ['erro', 'porque', 'causa raiz', 'origem', 'hipoteses', 'correcao'];
// 5o campo (doutrina "incidente -> prevencao propagada", governance/incidente-vira-prevencao.md):
// `propagacao` nomeia a CAMADA do Tars que impede a classe de voltar + o commit, ou `n/a` com
// motivo. Obrigatorio em licao NOVA; em licao antiga (sem ele) so' AVISA — nao quebra historico.
const CAMPOS_EXTRA = ['propagacao'];
// `hipoteses` e' o campo do MEIO (fatia 2/5): entre `origem` e a correcao, registra o que foi
// TESTADO E DESCARTADO — uma variavel por experimento. Sem ele a licao guarda so' a hipotese
// vencedora e a proxima sessao repete os becos sem saida ja' percorridos.
// Obrigatorio em licao NOVA (bloco); em licao antiga / de 1 linha so' AVISA — nao quebra historico.
const CAMPOS_MEIO = ['hipoteses'];
const CAMPO_RE = new RegExp('^\\s*(?:[-*]\\s*)?(' + [...CAMPOS, ...CAMPOS_EXTRA, ...CAMPOS_MEIO].join('|') + ')\\s*:\\s*(.*)$', 'i');
const VAGO_RE = /^(seja mais cuidadoso|ter mais cuidado|be more careful|prestar aten[cç][aã]o|mais aten[cç][aã]o)\b/i;

/** Coleta os trailers `Lesson:`/`No-Lesson:`/`Incident:`/`No-Incident:` do corpo. */
function trailers(msg) {
  const out = {};
  for (const line of msg.split(/\r?\n/)) {
    const m = line.match(/^\s*(Lesson|No-Lesson|Incident|No-Incident|No-Test)\s*:\s*(.*)$/i);
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
  // 5o campo `propagacao`: EXIGIDO no bloco (licao nova). Licao em 1 linha so' AVISA — a
  // forma curta e' legado e nao pode quebrar o historico (doutrina incidente-vira-prevencao).
  const avisoPropaga = (bloco) => {
    if (!bloco || bloco.propagacao) return;
    console.error(`\ncommit-msg: AVISO — falta 'propagacao' (5o campo da licao).`);
    console.error('  diga a CAMADA que impede a classe de voltar + o commit, ou `n/a` com motivo');
    console.error('  (guard > doctor > env/config do sync > gate de CI > skill — o mais automatico ganha):');
    console.error('    propagacao: guard <commit> | doctor <commit> | ... | n/a <motivo>\n');
  };
  // `hipoteses` fica entre `origem` e a correcao: o que foi testado e descartado, uma variavel
  // por experimento. Bloco novo sem ela = licao que so' guarda a hipotese vencedora — REPROVA.
  // Forma curta (1 linha) e' legado: so' AVISA.
  const faltaHipoteses = (b) => !b.hipoteses;
  const avisoHipoteses = () => {
    console.error(`\ncommit-msg: AVISA — falta 'hipoteses' (o que foi testado e descartado).`);
    console.error('  registre as hipoteses descartadas, UMA VARIAVEL por experimento:');
    console.error('    hipoteses: <h1 descartada porque...; h2 descartada porque...>\n');
  };
  const exigeHipoteses = (cap2) => {
    console.error(`\ncommit-msg: '${cap2}' veio sem 'hipoteses' — o que foi testado e descartado.`);
    console.error('  sem elas a proxima sessao repete os becos sem saida ja percorridos.');
    console.error('  registre uma variavel por experimento, dizendo por que cada uma caiu:');
    console.error('    hipoteses: o parser lia a secao errada (descartada: o log mostrava a secao certa);');
    console.error('               faltava reset por item (confirma a causa)\n');
    process.exit(1);
  };
  // A PRIMEIRA pergunta e' a ORIGEM (doutrina "origem antes do sintoma"): a causa raiz e o
  // buraco estrutural; `origem` e o que fez o buraco nascer. Bloco SEM ela = licao nova
  // incompleta: REPROVA. Licao em 1 linha e' legado — so' AVISA.
  const faltaOrigem = (b) => !b.origem;
  const avisoOrigem = () => {
    console.error(`\ncommit-msg: AVISA — falta 'origem' (a causa da causa raiz).`);
    console.error('  diga o que fez o buraco ESTRUTURAL nascer — nao repita a causa raiz:');
    console.error('    origem: <a decisao/ausencia que criou o buraco>\n');
  };
  const exigeOrigem = () => {
    console.error(`\ncommit-msg: '${cap}' veio sem 'origem' — a PRIMEIRA pergunta e a origem.`);
    console.error('  `causa raiz` e o buraco estrutural; `origem` e o que fez esse buraco nascer.');
    console.error("  sem ela, a licao corrige o sintoma e deixa a fonte de pe'.\n");
    console.error('    origem: <a decisao/ausencia que criou o buraco>\n');
    process.exit(1);
  };
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
      console.error('      origem: <o que fez esse buraco nascer — nao repita a causa raiz>');
      console.error('      hipoteses: <testadas e descartadas, uma variavel por experimento>');
      console.error('      correcao: <o arquivo/gate que muda — nunca "ter mais cuidado">');
      console.error('      propagacao: <camada + commit, ou `n/a` com motivo>');
      console.error(`  ou escape com No-Incident: <motivo com >=${NO_TRAILER_MIN} chars>\n`);
      process.exit(1);
    }
    if (mesmas) exigeCausa();
    if (faltaOrigem(b)) exigeOrigem();
    if (faltaHipoteses(b)) exigeHipoteses(cap);
    avisoPropaga(b);
    return;
  }

  // Licao: trailer de 1 linha OU bloco completo (a escolha e' do autor).
  if (mesmas) exigeCausa();
  // Trailer de 1 linha: forma LEGADO — so' AVISA (nao pode quebrar o historico), tanto pelo
  // `origem` quanto pelo `propagacao`. O BLOCO e' a forma nova, e ai' a origem e' exigida.
  if (tr[kind] || temNo) { avisoOrigem(); avisoHipoteses(); return; }
  // Bloco completo sem `propagacao` = licao nova incompleta: AVISA, nao reprova (historico).
  // Sem `origem` = licao que corrige o sintoma: REPROVA (doutrina "origem antes do sintoma").
  if (temBloco) {
    if (faltaOrigem(b)) exigeOrigem();
    if (faltaHipoteses(b)) exigeHipoteses(cap);
    return avisoPropaga(b);
  }
  if (Object.keys(b).length) { avisoOrigem(); avisoHipoteses(); }
  avisoPropaga(b);
  console.error(`\ncommit-msg: commit '${type}' sem registro de licao.`);
  console.error('  registre o aprendizado em 1 linha ou no bloco de 4 campos:');
  console.error(`    Lesson: <texto|id>   (ou No-Lesson: <motivo com >=${NO_TRAILER_MIN} chars>)`);
  console.error('    Lesson:');
  console.error('      erro: <o que estava errado>');
  console.error('      porque: <o mecanismo imediato>');
  console.error('      causa raiz: <o buraco estrutural; NAO repita o porque>');
  console.error('      origem: <o que fez esse buraco nascer; NAO repita a causa raiz>');
  console.error('      hipoteses: <testadas e descartadas, uma variavel por experimento>');
  console.error('      correcao: <o arquivo/gate que muda>');
  console.error('      propagacao: <camada + commit, ou `n/a` com motivo>');
  console.error('  (escapar e' + ' trailer, nunca --no-verify)\n');
  process.exit(1);
}

/**
 * TARS-RED-1: `fix:`/`🐛` tem de tocar um ARQUIVO DE TESTE (ou escapar com `No-Test:`).
 * Le os caminhos staged via `git diff --cached --name-only -z` na raiz do projeto.
 * Sem git/repo (fixture isolada): nao julga — gate que inventa caminho reprova tudo, e
 * falso-positivo e' pior que ausencia (o gate roda no hook real, onde o git existe).
 */
function exigeTesteVermelho(msg, tr) {
  const temNoTest = tr['no-test'] && tr['no-test'].length >= NO_TRAILER_MIN;
  if (temNoTest) return;
  const cwd = process.env.TARS_PROJECT ?? process.cwd();
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd, encoding: 'utf8' });
  if (r.status !== 0 || typeof r.stdout !== 'string') return;
  const arquivos = r.stdout.split('\0').filter(Boolean);
  if (!arquivos.length) return; // merge/rebase sem staged: nao ha' o que julgar
  if (arquivos.some((f) => TEST_RE.test(f) || TEST_FILE_RE.test(f))) return;
  console.error('\ncommit-msg: fix/bug/hotfix sem TESTE no commit (TARS-RED-1).');
  console.error('  a correcao veio, mas nada prova que ela reprovava ANTES (R4).');
  console.error('  toque o arquivo de teste que cobre o caso (ou o que REPRODUZ a falha) —');
  console.error('  no minimo um `*.test.{js,ts,sh}`/`*.spec.*`/`*_test.sh`/`*.bats`/`test_*.py` ou algo em `test/`/`tests/`;');
  console.error(`  sem teste cabivel (typo, doc, config)? escape pelo corpo: No-Test: <motivo >=${NO_TRAILER_MIN} chars>\n`);
  process.exit(1);
}

/**
 * QUEM escreveu o commit — a decisao e' do motor (`TARS_ACTOR`, calculado por
 * `tools/framework/tars-actor.mjs`), que ve' o env E a mensagem. Rodando o validador
 * SOZINHO (teste, uso direto), o modulo do ator e' carregado do catalogo; num consumidor
 * ele nao existe (o sync copia os gates, nao o `tools/framework/`), e por isso o import e'
 * dinamico. Sem modulo nenhum o default e' 'human' — o lado que COBRA a licao: um fallback
 * que afrouxa seria o gate que passa calado.
 *
 * `TARS_ACTOR` so' ATALHA quando diz `agent` — o valor que AFROUXA o gate (o agente paga a
 * licao) e' o unico que se pode acreditar sozinho. Qualquer outro valor (`human`, `0`,
 * vazio) nao prova nada: cai no motor, que le' env E mensagem. Ate' dev.8 o valor do env
 * era devolvido cru, e um `TARS_ACTOR=human` esquecido no ambiente do operador isentava o
 * AGENTE da licao sem que ninguem tivesse declarado nada.
 */
async function atorDaMensagem(msg) {
  if (process.env.TARS_ACTOR === 'agent') return 'agent';
  const here = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    join(here, '..', '..', '..', 'tools', 'framework', 'tars-actor.mjs'),
    join(process.env.TARS_PROJECT ?? process.cwd(), 'tools', 'framework', 'tars-actor.mjs'),
  ];
  for (const p of candidatos) {
    if (!fs.existsSync(p)) continue;
    const { actor } = await import(pathToFileURL(p).href);
    return actor({ env: process.env, msg });
  }
  return 'human';
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
  // `lesson = "agent"`: quem escreve a mao (sem trailer, sem CLAUDECODE) nao paga licao —
  // o registro e' do agente. O TARS-RED-1 (fix sem teste) fica FORA do condicional: a prova
  // da correcao nao e' licao, e vale para os dois autores.
  const cobraLicao = PARAMS.lesson !== 'agent' || (await atorDaMensagem(msg)) === 'agent';
  if (INCIDENT_TYPES.has(ctype)) {
    if (cobraLicao) requireTrailer(ctype, trailers(body), blocos, 'incident');
    exigeTesteVermelho(msg, trailers(body));
  }
  if (LESSON_TYPES.has(ctype) && cobraLicao) requireTrailer(ctype, trailers(body), blocos, 'lesson');
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
