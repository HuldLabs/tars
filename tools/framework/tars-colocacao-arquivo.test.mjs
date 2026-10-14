// Testes do gate colocacao-arquivo (B1.1 e B1.2), fatia 2g do plano de release de 14/10.
// Prova-se pelo EXIT CODE e pela MENSAGEM, com repo e matriz reais — nao pela leitura do
// codigo. O par obrigatorio em cada regra: positivo (o caminho certo passa) e negativo (o
// caminho errado REPROVA nomeando arquivo e familia).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, julgaGlobalSobApp, parseMatriz } from "../../.ai/gates/colocacao-arquivo/regra.mjs";

const GATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".ai",
  "gates",
  "colocacao-arquivo",
  "gate.mjs",
);

/** Matriz minima no MESMO subconjunto da do segtools: paths, ext, nameBase, forbidden. */
const MATRIZ = `
# comentario solto no topo
[[family]]
name = "global-tooling"
ext = [".mjs"]
nameBase = ["layout-check"]
allowed = ["tools/", "config/"]
forbidden = ["apps/hub/"]
severity = "block"

[[family]]
name = "tooling-framework"
paths = ["tools/framework/"]
allowed = ["tools/framework/"]
severity = "block"

[[family]]
name = "apps"
paths = ["apps/"]
allowed = ["apps/"]
severity = "block"

[[family]]
name = "ai"
paths = [".ai/"]
allowed = [".ai/"]
severity = "block"

[[family]]
name = "root-files"
rootFile = true
allowed = []
severity = "block"
`;

/** Projeto minimo com a matriz e os arquivos dados, ja' no staged (o gate julga o STAGED). */
function projeto(arquivos, matriz = MATRIZ) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-ca-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "matriz.toml"), matriz);
  for (const [nome, corpo] of Object.entries(arquivos)) {
    const p = path.join(dir, nome);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, corpo);
  }
  spawnSync("git", ["add", "--", ...Object.keys(arquivos)], { cwd: dir });
  return dir;
}

const rodar = (dir, params, extra = []) => {
  const r = spawnSync(process.execPath, [GATE, ...extra], {
    encoding: "utf8",
    env: { ...process.env, TARS_PROJECT: dir, TARS_GATE_PARAMS: JSON.stringify(params) },
  });
  return { status: r.status, stderr: r.stderr };
};

const params = (extra = {}) => ({ matriz: "matriz.toml", ...extra });

describe("parseMatriz — a matriz como DADO", () => {
  const familias = parseMatriz(MATRIZ);

  it("le' as familias na ordem do arquivo", () => {
    expect(familias.map((f) => f.name)).toEqual([
      "global-tooling",
      "tooling-framework",
      "apps",
      "ai",
      "root-files",
    ]);
  });
  it("le' array multilinha e escalar booleano", () => {
    expect(familias[0].allowed).toEqual(["tools/", "config/"]);
    expect(familias[0].forbidden).toEqual(["apps/hub/"]);
    expect(familias[4].rootFile).toBe(true);
  });
  it("matriz VAZIA devolve lista vazia (quem chama reprova, nao aprova)", () => {
    expect(parseMatriz("# so' comentario\n")).toEqual([]);
  });
});

describe("classify — familia -> allowed (B1.1)", () => {
  const familias = parseMatriz(MATRIZ);

  it("POSITIVO: o arquivo no local permitido passa", () => {
    expect(classify(familias, "tools/framework/layout-check.mjs").error).toBeNull();
  });
  it("NEGATIVO: o caminho GLOBAL sob o app REPROVA pela familia", () => {
    const v = classify(familias, "apps/hub/layout-check.mjs");
    expect(v.family).toBe("global-tooling");
    expect(v.error).toMatch(/proibido em 'apps\/hub\/'/);
  });
  it("NEGATIVO: NAO-CLASSIFICADO bloqueia (a matriz tem de continuar completa)", () => {
    const v = classify(familias, "qualquer/lugar/sem-familia.xyz");
    expect(v.family).toBeNull();
    expect(v.error).toMatch(/nao-classificado/);
  });
  it("allowed AUSENTE nao limita o local (so' o forbidden manda)", () => {
    const v = classify(parseMatriz('[[family]]\nname = "docs-area"\npaths = ["docs/"]\n'), "docs/x.md");
    expect(v.family).toBe("docs-area");
    expect(v.error).toBeNull();
  });
  it("`allowed = []` e' a forma de PROIBIR em todo lugar", () => {
    const v = classify(parseMatriz('[[family]]\nname = "nunca"\npaths = ["proibido/"]\nallowed = []\n'), "proibido/x.ts");
    expect(v.family).toBe("nunca");
    expect(v.error).toMatch(/LOCAL errado/);
  });
  it("a familia mais ESPECIFICA (declarada antes) decide", () => {
    expect(classify(familias, "tools/framework/qualquer.mjs").family).toBe("tooling-framework");
  });
  it("o caminho que nao cabe no allowed e' reprovado com o permitido nomeado", () => {
    expect(classify(familias, "outro/layout-check.mjs").error).toMatch(/permitido: 'tools\/, config\/'/);
  });
});

describe("julgaGlobalSobApp — B1.2, a forma GERAL", () => {
  it("NEGATIVO: tools/ sob o app REPROVA", () => {
    expect(julgaGlobalSobApp("apps/hub/tools/x.mjs").error).toMatch(/caminho GLOBAL/);
  });
  it("NEGATIVO: docs/ sob o app REPROVA", () => {
    expect(julgaGlobalSobApp("apps/hub/docs/guia.md").error).toMatch(/GLOBAL/);
  });
  it("POSITIVO: o que e' do APP passa", () => {
    expect(julgaGlobalSobApp("apps/hub/lib/coisa.ts")).toBeNull();
  });
  it("POSITIVO: o homonimo FORA do app nao e' o defeito do B1.2", () => {
    expect(julgaGlobalSobApp("tools/framework/x.mjs")).toBeNull();
  });
  it("a raiz do app e' PARAMETRO (o consumidor declara a dele)", () => {
    expect(julgaGlobalSobApp("modules/projects/packages/x.ts", "modules/").error).toMatch(/GLOBAL/);
  });
});

describe("gate colocacao-arquivo — o par, com repo real", () => {
  it("NEGATIVO: caminho global sob o app REPROVA nomeando arquivo e familia", () => {
    const dir = projeto({ "apps/hub/tools/gate.mjs": "export const x = 1\n" });
    const r = rodar(dir, params());
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/apps\/hub\/tools\/gate\.mjs/);
    expect(r.stderr).toMatch(/B1\.2|GLOBAL/);
  });

  it("POSITIVO: o arquivo no local certo passa", () => {
    const dir = projeto({ "tools/framework/coisa.mjs": "export const x = 1\n" });
    expect(rodar(dir, params()).status).toBe(0);
  });

  it("NEGATIVO: familia que nao permite aquele local REPROVA", () => {
    const dir = projeto({ "outro/layout-check.mjs": "export const x = 1\n" });
    const r = rodar(dir, params());
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/outro\/layout-check\.mjs — familia 'global-tooling'/);
  });

  it("NEGATIVO: nao-classificado REPROVA nomeando o arquivo", () => {
    // Matriz SEM a familia `root-files`: e' o buraco que a B1.1 existe para barrar — arquivo
    // novo sem familia declarada nao vira permissao.
    const semRoot = MATRIZ.replace(/\[\[family\]\]\nname = "root-files"[\s\S]*$/, "");
    const dir = projeto({ "solto.weird": "nada\n" }, semRoot);
    const r = rodar(dir, params());
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/solto\.weird — nao-classificado/);
  });

  it("julga o STAGED: arquivo fora do indice nao conta", () => {
    const dir = projeto({ "tools/framework/ok.mjs": "export const x = 1\n" });
    fs.mkdirSync(path.join(dir, "apps/hub/tools"), { recursive: true });
    fs.writeFileSync(path.join(dir, "apps/hub/tools/fora.mjs"), "x\n");
    expect(rodar(dir, params()).status).toBe(0);
  });
});

describe("gate colocacao-arquivo — FAIL-CLOSED (B2.3)", () => {
  it("sem matriz declarada REPROVA dizendo que NAO julgou", () => {
    const dir = projeto({ "tools/framework/ok.mjs": "x\n" });
    const r = rodar(dir, {});
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/NAO julguei/);
  });
  it("matriz inexistente REPROVA", () => {
    const dir = projeto({ "tools/framework/ok.mjs": "x\n" });
    const r = rodar(dir, { matriz: "nao-existe.toml" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/NAO julguei/);
  });
  it("matriz SEM familia REPROVA (vazio nao aprova)", () => {
    const dir = projeto({ "tools/framework/ok.mjs": "x\n" }, "# vazia\n");
    const r = rodar(dir, params());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/NAO julguei/);
  });
  it("--arquivos julga a lista explicita (a CI nao depende do indice)", () => {
    const dir = projeto({ "tools/framework/ok.mjs": "x\n" }, MATRIZ);
    const r = rodar(dir, params({}), ["--arquivos", "apps/hub/tools/novo.mjs"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/apps\/hub\/tools\/novo\.mjs/);
  });
});
