// Validador da CAMADA DE IA canônica (`.ai/`) — ADR-019 rev. 2 (SOF-4/SEG-844).
//
// Duas provas:
//  1) DRIFT — roda `rulesync generate --check` sobre `.ai/` e compara com as
//     saídas versionadas (`AGENTS.md`, `CLAUDE.md`, `.claude/skills/**`,
//     `.agents/skills/**`, `.opencode/skills/**`). Qualquer diferença reprova,
//     nomeando cada arquivo e mandando rodar `task ai:generate`. Editar à mão
//     uma saída gerada = reprovar.
//  2) ESTRUTURA — `.ai/rules/*.md` com exatamente uma regra `root: true` por
//     alvo; cada `.ai/skills/*/SKILL.md` com `name`/`description` no frontmatter;
//     `.ai/VERSION` SemVer; `.ai/memory/` existe. (A árvore `skills/{project,
//     vendor}` do farmega.v2 não é mais exigida — é a proporção do ADR-019.)
//
// TOOLING GLOBAL (fica em tools/, NÃO sob hub/ — hub é o APP).
// Uso: node tools/framework/ai-layer-check.mjs [--root <dir>] [--json]
//   Sem a flag = raiz do repo. Sai 0 quando a camada está íntegra e 1 quando há
//   drift ou falta qualquer peça obrigatória — é gate, não relatório.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { jsRuntime } from "./tars-runtime.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AI = ".ai";

// Alvos do `rulesync.jsonc` — a prova de drift roda com a MESMA lista (e com as
// mesmas features), senão a comparação não é a tradução que o repo versiona.
export const TARGETS = ["claudecode", "codexcli", "opencode"];
export const FEATURES = ["rules", "skills"];

// A ordem NORMATIVA esperada: cada item tem de casar em sequência no README. Se
// alguém renumerar/reordenar a escada, o validador acusa (a precedência é o
// contrato, não texto solto).
export const PRECEDENCE = [
  ".ai/rules/*.md",
  ".ai/governance/*.md",
  ".ai/skills/*/SKILL.md",
  ".ai/memory/README.md",
];

const read = (root, rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
};

/** Extrai os itens de uma lista numerada ("1. x") na ordem do arquivo. */
export function numberedItems(md) {
  const out = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\s*\d+\.\s+(.*\S)\s*$/);
    // Descarta crase e a anotacao entre parenteses apos o caminho (ex.: " (raiz)",
    // " — ponte gerada"); o que a escada compara e o CAMINHO, nao a prosa.
    if (m) out.push(m[1].replace(/`/g, "").replace(/\s+[(—–].*$/, "").replace(/\s+\s.*$/, "").trim());
  }
  return out;
}

/** Frontmatter YAML simples: devolve as chaves de topo (sem parser externo). */
const frontmatter = (md) => {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const keys = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*\S)\s*$/);
    if (kv) keys[kv[1]] = kv[2];
  }
  return keys;
};

/** Valida a ESTRUTURA (sem tocar em subprocesso). Devolve os erros. */
export function validateStructure(root = REPO) {
  const errs = [];
  const aiDir = path.join(root, AI);

  if (!fs.existsSync(aiDir)) return [`falta ${AI}/`];

  const version = read(root, `${AI}/VERSION`);
  if (version === null) errs.push(`falta ${AI}/VERSION`);
  // SemVer completo (X.Y.Z ou X.Y.Z-prerelease): a extracao nasce em `0.0.1-dev.N`
  // (doutrina versionamento-de-extracao), entao o pre-release tambem e' valido.
  else if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\s*$/.test(version))
    errs.push(`${AI}/VERSION nao e SemVer (esperado X.Y.Z ou X.Y.Z-dev.N)`);

  if (!fs.existsSync(path.join(root, `${AI}/memory`))) errs.push(`falta ${AI}/memory/`);

  // Regras: cada `.ai/rules/*.md` precisa de `root: true` e de `targets`; e cada
  // alvo declarado em TARGETS tem de ter EXATAMENTE uma regra root que o cobre.
  const rulesDir = path.join(root, `${AI}/rules`);
  const ruleFiles = fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md")) : [];
  if (ruleFiles.length === 0) errs.push(`falta ${AI}/rules/*.md (nenhuma regra)`);
  const covered = new Map(TARGETS.map((t) => [t, 0]));
  for (const f of ruleFiles) {
    const fm = frontmatter(read(root, `${AI}/rules/${f}`) ?? "");
    if (!fm || fm.root !== "true") {
      errs.push(`${AI}/rules/${f} sem "root: true" no frontmatter`);
      continue;
    }
    const targets = (fm.targets ?? "").replace(/[[\]"]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (targets.length === 0) errs.push(`${AI}/rules/${f} sem "targets" no frontmatter`);
    for (const t of targets) {
      if (!covered.has(t)) errs.push(`${AI}/rules/${f} aponta alvo desconhecido "${t}"`);
      else covered.set(t, covered.get(t) + 1);
    }
  }
  for (const [t, n] of covered) {
    if (n !== 1) errs.push(`alvo "${t}": esperado exatamente 1 regra root, veio ${n}`);
  }

  // Skills: cada `.ai/skills/*/SKILL.md` com `name` e `description`.
  const skillsDir = path.join(root, `${AI}/skills`);
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((d) => fs.existsSync(path.join(skillsDir, d, "SKILL.md"))) : [];
  if (skills.length === 0) errs.push(`falta ${AI}/skills/*/SKILL.md`);
  for (const s of skills) {
    const fm = frontmatter(read(root, `${AI}/skills/${s}/SKILL.md`) ?? "");
    if (!fm) errs.push(`${AI}/skills/${s}/SKILL.md sem frontmatter`);
    else {
      if (!fm.name) errs.push(`${AI}/skills/${s}/SKILL.md sem "name"`);
      if (!fm.description) errs.push(`${AI}/skills/${s}/SKILL.md sem "description"`);
    }
  }

  // Escada de precedencia: README e source-of-truth numeram a MESMA ordem.
  const readme = read(root, `${AI}/README.md`);
  if (readme === null) errs.push(`falta ${AI}/README.md`);
  else {
    if (!/nada normativo (vive )?fora de/i.test(readme)) {
      errs.push(`${AI}/README.md sem a regra "nada normativo fora de .ai/"`);
    }
    const got = numberedItems(readme);
    PRECEDENCE.forEach((want, i) => {
      if (got[i] !== want) errs.push(`precedencia: item ${i + 1} esperado "${want}", veio "${got[i] ?? "<vazio>"}"`);
    });
  }

  const sot = read(root, `${AI}/governance/source-of-truth.md`);
  if (sot !== null) {
    const got = numberedItems(sot);
    PRECEDENCE.forEach((want, i) => {
      if (got[i] !== want) errs.push(`source-of-truth: item ${i + 1} esperado "${want}", veio "${got[i] ?? "<vazio>"}"`);
    });
  }

  return errs;
}

/**
 * Prova de DRIFT: roda o `rulesync generate --check` com a config do repo e
 * devolve os erros. O `--check` do rulesync 25 sai 1 sem imprimir quando roda
 * sob vitest, então o veredito é o BYTE: geramos numa cópia descartável do repo
 * (mesma árvore, mesmos alvos) e comparamos com as saídas versionadas.
 */
export function validateDrift(root = REPO) {
  const bin = path.join(root, "node_modules/rulesync/dist/cli/index.js");
  if (!fs.existsSync(bin)) return [`rulesync ausente em node_modules — rode bun install`];

  // As saídas que o rulesync escreve no repo (versionadas): AGENTS.md/CLAUDE.md e
  // `.claude|.agents|.opencode/skills/**`. Lista montada ANTES de gerar na cópia.
  const tracked = generatedFiles(root);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-layer-drift-"));
  try {
    // Cópia mínima: a fonte de entrada (.ai/), o package.json (o rulesync lê a
    // versão) e a config. Sem .git/.claude originais, o output nasce limpo.
    for (const rel of [AI, "package.json", "rulesync.jsonc"]) {
      const src = path.join(root, rel);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(tmp, rel), { recursive: true });
    }
    // O rulesync e' um CLI Node: quem executa o `.js` dele e' um runtime JS DE VERDADE, nao o
    // `process.execPath` (que no binario compilado do Tars e' o proprio `tars` — Incident).
    const rt = jsRuntime() ?? { cmd: "node", env: {} };
    const res = spawnSync(
      rt.cmd,
      [bin, "generate", "--input-roots", AI, "--targets", TARGETS.join(","), "--features", FEATURES.join(",")],
      { cwd: tmp, encoding: "utf8", timeout: 180_000, env: { ...process.env, ...rt.env } },
    );
    if (res.status !== 0) {
      return [`rulesync generate falhou (exit ${res.status})`, `rode task ai:generate e encene as saidas geradas (nao editar a mao)`];
    }

    const errs = [];
    for (const rel of tracked) {
      const fresh = read(tmp, rel);
      if (fresh === null) continue; // a fonte não gera mais este arquivo → drift abaixo
      const cur = read(root, rel);
      if (cur !== fresh) errs.push(`saida gerada divergente da fonte .ai/: ${rel}`);
    }
    if (errs.length) errs.push(`rode task ai:generate e encene as saidas geradas (nao editar a mao)`);
    return errs;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** As saídas geradas que o repo versiona (o que o gate compara). */
export function generatedFiles(root = REPO) {  const files = ["AGENTS.md", "CLAUDE.md"];
  for (const dir of [".claude/skills", ".agents/skills", ".opencode/skills"]) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(path.relative(root, p));
      }
    };
    walk(abs);
  }
  return files;
}

/**
 * SEG-869: BOOT BUDGET — estima o custo em tokens (caracteres/4, a proporção
 * do dono) dos arquivos que o agente lê no boot e reprova acima do teto.
 * Lê `.ai/boot-budget.json` (`{"arquivos": [...], "teto_tokens": N}`); um
 * arquivo ausente conta 0 (o nome já sai na tabela).
 * Devolve { linhas, errors, maior }: `linhas` é a tabela pronta pro CLI.
 */
export function validateBootBudget(root = REPO) {
  const budget = JSON.parse(read(root, path.join(AI, "boot-budget.json")) ?? "{}");
  const arquivos = budget.arquivos ?? [];
  const teto = budget.teto_tokens ?? 0;
  const linhas = [];
  let total = 0;
  let maior = "";
  let maiorTok = -1;
  for (const rel of arquivos) {
    const md = read(root, rel);
    const tok = md === null ? 0 : Math.ceil(md.length / 4);
    total += tok;
    if (tok > maiorTok) { maiorTok = tok; maior = rel; }
    linhas.push(`${String(tok).padStart(6)} tok  ${rel}`);
  }
  linhas.push(`${String(total).padStart(6)} tok  TOTAL (teto ${teto})`);
  const errors = total > teto ? [`boot budget: ${total} tokens acima do teto ${teto} (maior: ${maior}, ${maiorTok} tokens)`] : [];
  return { linhas, errors, maior, total };
}

/** Valida estrutura + drift. */
export function validate(root = REPO) {
  return [...validateStructure(root), ...validateDrift(root)];
}

// CLI — só roda quando executado direto (o teste importa as funções acima).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root = rootIdx >= 0 ? path.resolve(argv[rootIdx + 1]) : REPO;
  const base = argv.includes("--no-drift") ? validateStructure(root) : validate(root);
  const budget = validateBootBudget(root);
  const errs = [...base, ...budget.errors];
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ ok: errs.length === 0, root, errors: errs, boot: budget.linhas }, null, 2));
  } else if (errs.length === 0) {
    console.log(budget.linhas.join("\n"));
    console.log(`ai-layer-check: OK (estrutura + drift + boot) — ${path.relative(REPO, root) || "."}`);
  } else {
    console.error(budget.linhas.join("\n"));
    console.error(`ai-layer-check: ${errs.length} erro(s) em ${path.relative(REPO, root) || "."}`);
    for (const e of errs) console.error(`  - ${e}`);
  }
  process.exit(errs.length === 0 ? 0 : 1);
}
