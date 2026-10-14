// `tars adopt` (dev.19) — o roteiro de adocao de repo PRE-EXISTENTE. O contrato: SO' LEITURA
// (nao altera nada), nomeia o que falta com o comando de cada item e ACUSA o hook manual fora
// do Tars (o que o sync recusa sobrescrever).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adopt, hooksAlheios } from "./tars-adopt.mjs";
import { OWNED, hookBody } from "./tars-sync.mjs";

const roots = [];
const tmp = (prefixo = "tars-adopt-") => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
  roots.push(dir);
  return dir;
};
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

/** Um repo git minimo com manifesto opcional e hooks. */
const repo = ({ manifest = null, hooksPath = ".githooks", hooks = {} } = {}) => {
  const dir = tmp();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  fs.mkdirSync(path.join(dir, ".ai"), { recursive: true });
  if (manifest) fs.writeFileSync(path.join(dir, ".ai", "tars.toml"), manifest);
  if (hooksPath) {
    fs.mkdirSync(path.join(dir, hooksPath), { recursive: true });
    for (const [nome, corpo] of Object.entries(hooks)) {
      const f = path.join(dir, hooksPath, nome);
      fs.writeFileSync(f, corpo, { mode: 0o755 });
    }
    if (Object.keys(hooks).length)
      execFileSync("git", ["config", "core.hooksPath", hooksPath], { cwd: dir });
  }
  return dir;
};

const idDe = (r, id) => r.itens.find((i) => i.id === id);

describe("tars adopt — roteiro de adocao (dev.19)", () => {
  it("repo vazio: tudo FALTA, nomeia manifesto e o comando `tars init`", () => {
    const dir = repo({ hooksPath: null });
    const r = adopt({ project: dir });
    expect(r.ok).toBe(false);
    expect(idDe(r, "manifesto").estado).toBe("falta");
    expect(idDe(r, "manifesto").comando).toBe("tars init");
    expect(r.falta.map((i) => i.id)).toContain("base");
    expect(r.falta.map((i) => i.id)).toContain("hooks");
  });

  it("nao altera NADA — nem o manifesto, nem .githooks, nem core.hooksPath", () => {
    const manifesto = '[tars]\nversion = "0.0.1-dev.1"\n[gates]\npre-commit = ["gitleaks"]\n';
    const dir = repo({ manifest: manifesto, hooksPath: ".githooks", hooks: { "pre-commit": "# meu hook\n" } });
    const antes = {
      toml: fs.readFileSync(path.join(dir, ".ai", "tars.toml"), "utf8"),
      hook: fs.readFileSync(path.join(dir, ".githooks", "pre-commit"), "utf8"),
      hp: execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: dir, encoding: "utf8" }),
      arquivos: fs.readdirSync(path.join(dir, ".githooks")).sort(),
    };
    adopt({ project: dir });
    expect(fs.readFileSync(path.join(dir, ".ai", "tars.toml"), "utf8")).toBe(antes.toml);
    expect(fs.readFileSync(path.join(dir, ".githooks", "pre-commit"), "utf8")).toBe(antes.hook);
    expect(execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: dir, encoding: "utf8" })).toBe(antes.hp);
    expect(fs.readdirSync(path.join(dir, ".githooks")).sort()).toEqual(antes.arquivos);
  });

  it("acusa hook MANUAL fora do Tars (sem a marca de autoria) e manda o --adopt", () => {
    const dir = repo({
      manifest: '[gates]\npre-commit = ["gitleaks"]\n',
      hooks: { "pre-commit": "#!/bin/sh\necho hook do dono\n" },
    });
    const r = adopt({ project: dir });
    expect(hooksAlheios(dir, { gates: { "pre-commit": ["gitleaks"] } })).toEqual([".githooks/pre-commit"]);
    const hooks = idDe(r, "hooks");
    expect(hooks.estado).toBe("aviso");
    expect(hooks.detalhe).toContain("MANUAL fora do Tars");
    expect(hooks.detalhe).toContain(".githooks/pre-commit");
    expect(hooks.comando).toContain("--adopt");
  });

  it("hook GERADO pelo Tars NAO e' acusado (a marca de autoria basta)", () => {
    const dir = repo({
      manifest: '[gates]\npre-commit = ["gitleaks"]\n',
      hooks: { "pre-commit": hookBody("pre-commit") },
    });
    expect(hookBody("pre-commit")).toContain(OWNED);
    expect(hooksAlheios(dir, { gates: { "pre-commit": ["gitleaks"] } })).toEqual([]);
    expect(idDe(adopt({ project: dir }), "hooks").detalhe).not.toContain("MANUAL");
  });

  it("core.hooksPath ausente com gate declarado FALTA (o git engole o commit calado)", () => {
    const dir = repo({ manifest: '[gates]\ncommit-msg = ["commit-msg"]\n', hooksPath: null });
    const r = adopt({ project: dir });
    const hooks = idDe(r, "hooks");
    expect(hooks.estado).toBe("falta");
    expect(hooks.detalhe).toContain("core.hooksPath");
    expect(r.ok).toBe(false);
  });

  it("repo completo fica OK (formato do roteiro mantem ok:true)", () => {
    const manifesto =
      '[tars]\nversion = "0.0.1-dev.1"\n[gates]\npre-commit = ["gitleaks"]\ncommit-msg = ["commit-msg"]\n';
    const dir = repo({
      manifest: manifesto,
      hooks: {
        "pre-commit": hookBody("pre-commit"),
        "commit-msg": hookBody("commit-msg"),
        "prepare-commit-msg": hookBody("prepare-commit-msg"),
      },
    });
    fs.writeFileSync(path.join(dir, ".ai", "tars.lock"), "{}\n");
    fs.writeFileSync(path.join(dir, ".ai", "doctrines.toml"), "# vazio\n");
    fs.writeFileSync(path.join(dir, "BACKLOG.md"), "# B\n");
    fs.writeFileSync(path.join(dir, "HANDOFF.md"), "# H\n");
    const r = adopt({ project: dir });
    expect(r.falta).toEqual([]);
    expect(r.ok).toBe(true);
    expect(idDe(r, "hooks").estado).toBe("ok");
  });
});
