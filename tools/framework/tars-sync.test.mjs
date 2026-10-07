import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { declare, hashSource, readManifest, sync } from "./tars-sync.mjs";

// AI-TARS fatia 3 (docs/TARS.md §Fatias): `tars sync` puxa do catalogo so' o
// DECLARADO no `.ai/tars.toml` do projeto consumidor, trava sha256 em
// `.ai/tars.lock` e reprova item inexistente e base editada a mao. A prova roda
// sobre fixture temporaria de verdade (o Tars de origem tambem e' copia da
// fixture), sem tocar o repo real.
const here = path.dirname(fileURLToPath(import.meta.url));
const TARS_FIXTURE = path.join(here, "tars-sync-fixtures", "tars");

const MANIFEST = `# .ai/tars.toml do projeto consumidor
[tars]
version = "v0.3"
skills  = ["alpha"]
rules   = ["base"]
memory  = ["git"]

[gates]
pre-commit = ["commit-msg"]
`;

/** Cria Tars (copia da fixture) + projeto consumidor temporarios. */
function scaffold({ manifest = MANIFEST } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tars-sync-"));
  const tars = path.join(root, "tars");
  const project = path.join(root, "project");
  fs.cpSync(TARS_FIXTURE, tars, { recursive: true });
  fs.mkdirSync(path.join(project, ".ai"), { recursive: true });
  if (manifest !== null) fs.writeFileSync(path.join(project, ".ai", "tars.toml"), manifest);
  return { root, tars, project, base: path.join(project, ".ai", "base"), lock: path.join(project, ".ai", "tars.lock") };
}

const readLock = (lock) => JSON.parse(fs.readFileSync(lock, "utf8"));
const treeOf = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true }).map(String).sort()
    : [];

describe("tars-sync — so' o declarado e' copiado", () => {
  it("copia skills/rules/memory declarados, nada de `[gates]`", async () => {
    const { tars, project, base, lock } = scaffold();
    await sync({ tars, project, log: () => {} });

    // memoria = ["git"] declarada; `db` existe no Tars e NAO pode vir.
    expect(treeOf(base)).toEqual([
      "memory",
      "memory/agent",
      "memory/agent/git.md",
      "rules",
      "rules/base.md",
      "skills",
      "skills/alpha",
      "skills/alpha/SKILL.md",
      "skills/alpha/rules",
      "skills/alpha/rules/x.md",
    ]);
    expect(fs.readFileSync(path.join(base, "rules", "base.md"), "utf8")).toBe("base rule\n");
    expect(fs.existsSync(path.join(base, "gates"))).toBe(false);
    expect(declare(await readManifest(project))).toEqual([
      { area: "skills", item: "alpha" },
      { area: "rules", item: "base" },
      { area: "memory", item: "git" },
    ]);
    expect(readLock(lock).files["memory/agent/git.md"].sha256).toBe(
      await hashSource(path.join(tars, ".ai", "memory", "agent", "git.md")),
    );
  });

  it("lock versiona o Tars (version + commit) e o sha256 de cada arquivo", async () => {
    const { tars, project, lock } = scaffold();
    await sync({ tars, project, log: () => {} });
    const l = readLock(lock);
    expect(l.lockfileVersion).toBe(1);
    expect(l.tars.version).toBe("v0.3");
    expect(Object.keys(l.files).sort()).toEqual(["memory/agent/git.md", "rules/base.md", "skills/alpha"]);
    for (const f of Object.values(l.files)) expect(f.sha256).toMatch(/^(sha256-)?[0-9a-f]{64}$/);
  });
});

describe("tars-sync — idempotencia", () => {
  it("rodar de novo sem mudanca nao reescreve nada", async () => {
    const { tars, project, base, lock } = scaffold();
    await sync({ tars, project, log: () => {} });
    const stamp = (p) => fs.statSync(p).mtimeMs;
    const before = { lock: stamp(lock), skill: stamp(path.join(base, "skills", "alpha", "SKILL.md")) };
    const first = fs.readFileSync(lock, "utf8");

    const r = await sync({ tars, project, log: () => {} });

    expect(r.wrote).toEqual([]);
    expect(fs.readFileSync(lock, "utf8")).toBe(first);
    expect(stamp(lock)).toBe(before.lock);
    expect(stamp(path.join(base, "skills", "alpha", "SKILL.md"))).toBe(before.skill);
  });

  it("item novo declarado entra sem mexer no que ja' estava", async () => {
    const { tars, project, base } = scaffold();
    await sync({ tars, project, log: () => {} });
    const skillBefore = fs.statSync(path.join(base, "skills", "alpha", "SKILL.md")).mtimeMs;

    fs.appendFileSync(path.join(project, ".ai", "tars.toml"), "");
    fs.writeFileSync(
      path.join(project, ".ai", "tars.toml"),
      MANIFEST.replace('memory  = ["git"]', 'memory  = ["git", "db"]'),
    );
    const r = await sync({ tars, project, log: () => {} });

    expect(r.wrote).toEqual(["memory/agent/db.md"]);
    expect(fs.existsSync(path.join(base, "memory", "agent", "db.md"))).toBe(true);
    expect(fs.statSync(path.join(base, "skills", "alpha", "SKILL.md")).mtimeMs).toBe(skillBefore);
    expect(readLock(path.join(project, ".ai", "tars.lock")).files["memory/agent/db.md"]).toBeTruthy();
  });
});

describe("tars-sync — falhas", () => {
  it("item declarado que nao existe no Tars falha ruidoso e nao escreve nada", async () => {
    const { tars, project, base } = scaffold({
      manifest: MANIFEST.replace('rules   = ["base"]', 'rules   = ["base", "nao-existe"]'),
    });
    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/nao-existe/);
    expect(fs.existsSync(base)).toBe(false);
    expect(fs.existsSync(path.join(project, ".ai", "tars.lock"))).toBe(false);
  });

  it("base editada a mao no projeto acusa drift em vez de sobrescrever", async () => {
    const { tars, project, base, lock } = scaffold();
    await sync({ tars, project, log: () => {} });
    const locked = fs.readFileSync(lock, "utf8");
    const handEdited = path.join(base, "rules", "base.md");
    fs.writeFileSync(handEdited, "editado a mao\n");

    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/drift/);
    // Nada foi sobrescrito: a edicao a mao e o lock continuam como estavam.
    expect(fs.readFileSync(handEdited, "utf8")).toBe("editado a mao\n");
    expect(fs.readFileSync(lock, "utf8")).toBe(locked);
  });

  it("--check acusa drift sem escrever", async () => {
    const { tars, project, base } = scaffold();
    await sync({ tars, project, log: () => {} });
    const handEdited = path.join(base, "memory", "agent", "git.md");
    fs.writeFileSync(handEdited, "sujo\n");

    const r = await sync({ tars, project, check: true, log: () => {} });

    expect(r.stale.map((e) => `${e.area}/${e.item}`)).toEqual(["memory/git"]);
    expect(fs.readFileSync(handEdited, "utf8")).toBe("sujo\n");
  });

  it("projeto sem .ai/tars.toml falha nomeando o manifesto", async () => {
    const { tars, project } = scaffold({ manifest: null });
    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/tars\.toml/);
  });
});

describe("tars-sync — fixture do catalogo", () => {
  it("a fixture do Tars tem VERSION (contrato de origem)", () => {
    expect(fs.existsSync(path.join(TARS_FIXTURE, ".ai", "VERSION"))).toBe(true);
  });
});
