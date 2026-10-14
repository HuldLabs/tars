// Gate de COLOCACAO DE ARQUIVO (B1.1 e B1.2 do plano de release de 14/10).
//
// Uso: node gate.mjs [--matriz <arquivo.toml>] [--app <raiz do app>] [--arquivos <a,b>]
//
// Julga o STAGED por padrao (o pre-commit); `--arquivos` julga uma lista explicita (o teste
// usa isso, e o consumidor pode chamar da CI). A REGRA mora em `regra.mjs` — este arquivo so'
// le' o disco, resolve a matriz e traduz o veredito em exit code.
//
// Parametros (`[gates.params.colocacao-arquivo]` do `.ai/tars.toml`):
//   matriz = caminho da matriz de colocacao (RELATIVO ao projeto). Sem ela o gate NAO julga.
//   app    = raiz do app (default 'apps/') — a fronteira do B1.2.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseMatriz, classify, julgaGlobalSobApp } from "./regra.mjs";

const project = process.env.TARS_PROJECT ?? process.cwd();
const params = JSON.parse(process.env.TARS_GATE_PARAMS || "{}");

const argv = process.argv.slice(2);
const flag = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
};

const matrizRel = flag("--matriz") ?? params.matriz ?? "";
const app = flag("--app") ?? params.app ?? "apps/";
const arquivosFlag = flag("--arquivos");

const falha = (msg) => {
  console.error(msg);
  process.exit(1);
};

// --- fail-closed: o que impede o JULGAMENTO reprova, nunca passa calado ---------------
if (!matrizRel) {
  falha(
    "gate colocacao-arquivo: NAO julguei — nenhuma matriz declarada. " +
      "Declare `[gates.params.colocacao-arquivo] matriz = \"<arquivo>\"` no .ai/tars.toml " +
      "ou passe --matriz. Um gate que nao corre e' pior que gate nenhum: da' sensacao de cobertura.",
  );
}
const matrizAbs = path.resolve(project, matrizRel);
let textoMatriz;
try {
  textoMatriz = fs.readFileSync(matrizAbs, "utf8");
} catch (e) {
  falha(`gate colocacao-arquivo: NAO julguei — nao consegui ler a matriz '${matrizRel}': ${e.message}`);
}
const familias = parseMatriz(textoMatriz);
if (!familias.length) {
  falha(
    `gate colocacao-arquivo: NAO julguei — a matriz '${matrizRel}' nao tem nenhuma [[family]] ` +
      "com `name`. Matriz vazia nao aprova: ela certifica que TODA familia esta' declarada.",
  );
}

// --- alvo: o staged (pre-commit) ou a lista explicita ----------------------------------
let arquivos;
if (arquivosFlag !== undefined) {
  arquivos = arquivosFlag
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
} else {
  const r = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd: project,
    encoding: "utf8",
  });
  if (r.status !== 0 || typeof r.stdout !== "string") {
    falha("gate colocacao-arquivo: NAO julguei — sem git neste projeto (o staged e' o alvo padrao).");
  }
  arquivos = r.stdout
    .split("\0")
    .filter(Boolean)
    // Arquivo deletado/symlink-p-diretorio nao tem LOCAL a conferir.
    .filter((f) => {
      try {
        return fs.statSync(path.join(project, f)).isFile();
      } catch {
        return false;
      }
    });
}

const norm = (f) => f.replace(/\\/g, "/").replace(/^\.\//, "");
const achados = [];
for (const bruto of arquivos) {
  const rel = norm(bruto);
  if (!rel || rel.startsWith("../")) continue;
  const veredito = julgaGlobalSobApp(rel, app) ?? classify(familias, rel);
  if (veredito.error) achados.push(`${rel} — ${veredito.error}`);
}

if (achados.length) {
  console.error(
    [
      "",
      "COLOCACAO DE ARQUIVO: o arquivo nasceu no lugar errado (B1.1/B1.2).",
      "",
      ...achados.map((a) => "  " + a),
      "",
      "  O LOCAL precede o arquivo: declare a familia ANTES de cria-lo, e o caminho GLOBAL",
      "  (tools/ packages/ config/ .ai/ docs/ themes/ modules/) nunca mora sob o app.",
      "  Ver .ai/gates/colocacao-arquivo/GATE.md.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
process.exit(0);
