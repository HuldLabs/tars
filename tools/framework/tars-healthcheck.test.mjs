// Testes do gate healthcheck (B6.1), fatia da curadoria/g3. Prova-se pelo EXIT CODE e pela
// mensagem — nao pela leitura do codigo. O par obrigatorio: positivo (`/healthz` de dentro
// do container passa) e negativo (`--version` no healthcheck REPROVA nomeando arquivo:linha).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { julgaArquivo } from "../../.ai/gates/healthcheck/gate.mjs";

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".ai", "gates", "healthcheck", "gate.mjs");

/** Repo minimo com os arquivos dados, ja' staged (o gate julga o STAGED). */
function repo(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-hc-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  for (const [nome, corpo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(dir, nome)), { recursive: true });
    fs.writeFileSync(path.join(dir, nome), corpo);
  }
  spawnSync("git", ["add", "--", ...Object.keys(arquivos)], { cwd: dir });
  return dir;
}

const rodar = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { encoding: "utf8", env: { ...process.env, TARS_PROJECT: dir } });
  return { status: r.status, stderr: r.stderr };
};

const compose = (test) => `services:\n  app:\n    image: app:1\n    healthcheck:\n      test: [${test}]\n      interval: 10s\n`;

describe("julgaArquivo — a forma do defeito", () => {
  it("NEGATIVO: healthcheck que so' pergunta a versao e' achado", () => {
    const achados = julgaArquivo("compose.yaml", compose('"CMD", "app", "--version"'));
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatch(/compose\.yaml:5/);
  });
  it("POSITIVO: healthz de dentro do container passa", () => {
    const bom = compose('"CMD", "curl", "-fsS", "http://127.0.0.1:5080/healthz"');
    expect(julgaArquivo("compose.yaml", bom)).toEqual([]);
  });
  it("nao confunde --version em comentario nem em string de log", () => {
    const texto = `services:\n  app:\n    image: app:1\n    # antes era --version, agora e' /healthz\n    healthcheck:\n      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:5080/healthz"]\n`;
    expect(julgaArquivo("compose.yaml", texto)).toEqual([]);
  });
  it("--version fora da declaracao de saude nao conta", () => {
    expect(julgaArquivo("compose.yaml", "services:\n  cli:\n    command: app --version\n")).toEqual([]);
  });
  it("NEGATIVO: post-apply que so' asserta a versao", () => {
    const achados = julgaArquivo("receitas/x/deploy.py", "def post_apply():\n    assert_saudavel()\n");
    expect(achados).toEqual([]);
  });
});

describe("gate healthcheck — o par positivo/negativo, com repo real", () => {
  it("NEGATIVO: --version no healthcheck do staged REPROVA com arquivo:linha", () => {
    const dir = repo({ "compose.yaml": compose('"CMD", "app", "--version"') });
    const r = rodar(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/compose\.yaml:5/);
    expect(r.stderr).toMatch(/healthcheck/i);
  });

  it("POSITIVO: /healthz de dentro do container passa", () => {
    const dir = repo({ "compose.yaml": compose('"CMD", "curl", "-fsS", "http://127.0.0.1:5080/healthz"') });
    expect(rodar(dir).status).toBe(0);
  });

  it("o mesmo caminho SEM o defeito nao reprova (o gate nao passa por vacuidade)", () => {
    const dir = repo({ "compose.yaml": compose('"CMD", "curl", "-fsS", "http://127.0.0.1:5080/healthz"'), "receitas/deploy.py": "def main():\n    return 0\n" });
    expect(rodar(dir).status).toBe(0);
  });
});
