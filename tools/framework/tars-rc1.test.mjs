// Provas dos achados da rodada dev.30-rc.1 (Endurance e Kerr, 01/11).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compareVersions, lockVersion, notesBetween } from "./tars-upgrade.mjs";
import { gravaVersaoDoManifesto } from "./tars-sync.mjs";
import { configDir, nomeDoProjeto } from "./tars-secrets.mjs";
import { soComando } from "../../.ai/gates/lib-comando.mjs";
import { achar } from "../../.ai/gates/no-add-all/no-add-all.mjs";
import { julga } from "../../.ai/gates/daneel-acoes/daneel-acoes.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tars-rc1-"));

describe("versao candidata", () => {
  it("dev.N-rc.M fica entre dev.(N-1) e dev.N", () => {
    expect(compareVersions("0.0.1-dev.29", "0.0.1-dev.30-rc.1")).toBeLessThan(0);
    expect(compareVersions("0.0.1-dev.30-rc.1", "0.0.1-dev.30")).toBeLessThan(0);
    expect(compareVersions("0.0.1-dev.30-rc.1", "0.0.1-dev.30-rc.2")).toBeLessThan(0);
  });
});

describe("sync --upgrade grava a versao no manifesto", () => {
  it("troca so' o version de [tars]", async () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".ai"));
    const f = path.join(d, ".ai", "tars.toml");
    fs.writeFileSync(f, '[tars]\nversion = "0.0.1-dev.29"\nskills = []\n\n[outro]\nversion = "9"\n');
    await gravaVersaoDoManifesto(d, "0.0.1-dev.30");
    expect(fs.readFileSync(f, "utf8")).toBe('[tars]\nversion = "0.0.1-dev.30"\nskills = []\n\n[outro]\nversion = "9"\n');
  });
});

describe("texto citado nao e' comando nos gates de agente", () => {
  const txt = "git commit -q -m 'doc: nao use git add -A nem git push --force'";
  it("no-add-all e daneel-acoes deixam passar a mensagem", () => {
    expect(achar(txt)).toBeNull();
    expect(julga(txt)).toBeNull();
  });
  it("comando de verdade segue barrado, inclusive dentro de bash -c", () => {
    expect(achar("git add -A")).not.toBeNull();
    expect(achar('bash -c "git add -A"')).not.toBeNull();
    expect(julga("git push --force origin x")).not.toBeNull();
  });
  it("corpo de heredoc sai; o comando apos ele fica", () => {
    expect(soComando("git commit -F - <<'M'\ngit add -A\nM\ngit add .")).not.toContain("add -A");
    expect(soComando("git commit -F - <<'M'\nx\nM\ngit add .")).toContain("git add .");
  });
});

describe("diretorio de segredos pelo repo", () => {
  it("worktree usa o nome do checkout principal", () => {
    const d = path.join(tmp(), "meu-repo");
    fs.mkdirSync(d);
    const g = (...a) => spawnSync("git", a, { cwd: d });
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    g("commit", "-q", "--allow-empty", "-m", "x");
    const wt = path.join(path.dirname(d), "outra-pasta");
    g("worktree", "add", "-q", wt);
    expect(nomeDoProjeto(wt)).toBe("meu-repo");
  });
  it("cache legado na pasta continua valendo", () => {
    const base = tmp();
    fs.mkdirSync(path.join(base, "workspace"), { recursive: true });
    const env = { TARS_SECRETS_DIR: base };
    expect(configDir({ project: "/workspace", env, nome: "kerr" })).toBe(path.join(base, "workspace"));
    expect(configDir({ project: "/x/kerr", env, nome: "kerr" })).toBe(path.join(base, "kerr"));
  });
});

describe("fail-closed sem dependencia do consumidor", () => {
  it("julga .mjs num repo sem node_modules", () => {
    const d = tmp();
    spawnSync("git", ["init", "-q"], { cwd: d });
    fs.writeFileSync(path.join(d, "a.mjs"), "export function f(trava) {\n  if (trava) { checa() } else { return }\n}\n");
    spawnSync("git", ["add", "--", "a.mjs"], { cwd: d });
    const r = spawnSync(process.execPath, [path.join(RAIZ, ".ai/gates/fail-closed/gate.mjs")], { cwd: d, encoding: "utf8", env: { ...process.env, TARS_PROJECT: d } });
    expect(r.stderr).not.toMatch(/parser|NAO julguei/);
  });
});

describe("rodada rc.2 (Endurance e Kerr, 01/11)", () => {
  it("printf com varios argumentos citados e' texto; canalizado para sh, nao", () => {
    expect(achar("printf '%s\\n' 'git add -A' 'git push --force'")).toBeNull();
    expect(julga("printf '%s\\n' 'git add -A' 'git push --force'")).toBeNull();
    expect(achar(`printf '{"tool_input":{"command":"%s"}}' "git add -A"`)).toBeNull();
    expect(achar("printf 'git add -A' | sh")).not.toBeNull();
  });
  it("worktree acha o legado do checkout principal", () => {
    const base = tmp();
    const raiz = path.join(tmp(), "workspace");
    fs.mkdirSync(raiz);
    const g = (...a) => spawnSync("git", a, { cwd: raiz });
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    g("remote", "add", "origin", "https://x/HuldLabs/kerr.git");
    g("commit", "-q", "--allow-empty", "-m", "x");
    const wt = path.join(raiz, ".cache", "adopt-rc");
    g("worktree", "add", "-q", wt);
    fs.mkdirSync(path.join(base, "workspace"));
    const env = { TARS_SECRETS_DIR: base };
    expect(configDir({ project: wt, env })).toBe(path.join(base, "workspace"));
    expect(configDir({ project: raiz, env })).toBe(path.join(base, "workspace"));
  });
});

describe("upgrade-notes depois do --upgrade (Endurance, 01/11)", () => {
  it("o lock guarda a origem e o rc traz as notas da dev que antecipa", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".ai"));
    fs.writeFileSync(path.join(d, ".ai", "tars.lock"), JSON.stringify({ tars: { version: "0.0.1-dev.30-rc.2", de: "0.0.1-dev.29" } }));
    expect(lockVersion(d)).toBe("0.0.1-dev.29");
    const blocos = [{ version: "0.0.1-dev.30", corpo: "" }, { version: "0.0.1-dev.29", corpo: "" }];
    expect(notesBetween(blocos, "0.0.1-dev.29", "0.0.1-dev.30-rc.2").map((b) => b.version)).toEqual(["0.0.1-dev.30"]);
  });
});
