// Testes do gate backup-coverage (B2.6), fatia da curadoria/g3. Prova-se pelo EXIT CODE e
// pela mensagem — nao pela leitura do codigo. O par obrigatorio do achado 14: o mesmo
// caminho COM o defeito REPROVA nomeando `arquivo:campo`, e SEM o defeito nao reprova
// (o gate nao pode passar por vacuidade).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { julgaArquivo } from "../../.ai/gates/backup-coverage/gate.mjs";

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".ai", "gates", "backup-coverage", "gate.mjs");

/** Repo minimo com os arquivos dados, ja' staged (o gate julga o STAGED). */
function repo(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-bc-"));
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

const fichaCobrindo = (app) => `[backup]\nfontes = ["/srv/prod/${app}"]\nrestore_sentinela = "/srv/prod/${app}/sentinela"\ncadencia = "diaria"\n\n[${app}]\ndata_dir = "/srv/prod/${app}/data"\n`;

describe("julgaArquivo — a forma do defeito", () => {
  it("NEGATIVO: app com dir de dado fora da lista de fontes REPROVA nomeando arquivo:campo", () => {
    const achados = julgaArquivo("receitas/app/vars.py", `[backup]\nfontes = ["/srv/prod/outro"]\nrestore_sentinela = "x"\n\n[app]\ndata_dir = "/srv/prod/app/data"\n`);
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatch(/vars\.py:6/);
    expect(achados[0]).toMatch(/fora da lista/);
  });

  it("POSITIVO: app com dir de dado coberto pela lista passa", () => {
    expect(julgaArquivo("receitas/app/vars.py", fichaCobrindo("app"))).toEqual([]);
  });

  it("NEGATIVO: declaracao de backup sem prova de restore reprova", () => {
    const achados = julgaArquivo("receitas/app/vars.py", `[backup]\nfontes = ["/srv/prod/app"]\ncadencia = "diaria"\n\n[app]\ndata_dir = "/srv/prod/app/data"\n`);
    expect(achados.some((a) => /prova de restore/i.test(a))).toBe(true);
  });

  it("POSITIVO: sem app de dado, nao ha o que cobrar", () => {
    expect(julgaArquivo("receitas/simples/vars.py", `[app]\nimage = "x:1"\n`)).toEqual([]);
  });

  it("data_dir vazio ou null nao conta como dir de dado", () => {
    expect(julgaArquivo("receitas/x/vars.py", `[app]\ndata_dir = ""\n`)).toEqual([]);
  });
});

describe("gate backup-coverage — o par positivo/negativo, com repo real", () => {
  it("NEGATIVO: a ficha com app fora da lista REPROVA com arquivo:campo", () => {
    const dir = repo({ "receitas/app/vars.py": `[backup]\nfontes = ["/srv/prod/outro"]\nrestore_sentinela = "s"\n\n[app]\ndata_dir = "/srv/prod/app/data"\n` });
    const r = rodar(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/vars\.py:6/);
    expect(r.stderr).toMatch(/backup/i);
  });

  it("POSITIVO: a ficha coberta passa", () => {
    const dir = repo({ "receitas/app/vars.py": fichaCobrindo("app") });
    expect(rodar(dir).status).toBe(0);
  });

  it("POSITIVO: o mesmo caminho SEM o defeito nao reprova (o gate nao passa por vacuidade)", () => {
    const dir = repo({ "receitas/app/vars.py": fichaCobrindo("app"), "receitas/outro/vars.py": `[app]\nimage = "x:1"\n` });
    expect(rodar(dir).status).toBe(0);
  });
});
