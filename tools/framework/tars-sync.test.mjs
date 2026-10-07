import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { declare, hashSource, init, parseToml, readManifest, sync } from "./tars-sync.mjs";

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
guards  = ["alpha-guard"]
governance = ["alpha"]

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
  it("copia skills/rules/memory e os gates DECLARADOS", async () => {
    const { tars, project, base, lock } = scaffold();
    await sync({ tars, project, log: () => {} });

    // memoria = ["git"] declarada; `db` existe no Tars e NAO pode vir.
    expect(treeOf(base)).toEqual([
      "gates",
      "gates/commit-msg",
      "gates/commit-msg/GATE.md",
      "gates/commit-msg/gate.mjs",
      "governance",
      "governance/alpha.md",
      "guards",
      "guards/alpha-guard.sh",
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
    expect(fs.existsSync(path.join(base, "gates", "commit-msg", "GATE.md"))).toBe(true);
    expect(declare(await readManifest(project))).toEqual([
      { area: "skills", item: "alpha" },
      { area: "rules", item: "base" },
      { area: "memory", item: "git" },
      { area: "gates", item: "commit-msg" },
      { area: "guards", item: "alpha-guard" },
      { area: "governance", item: "alpha" },
    ]);
    expect(readLock(lock).files["memory/agent/git.md"].sha256).toBe(
      await hashSource(path.join(tars, ".ai", "memory", "agent", "git.md")),
    );
  });

  it("`[gates].local` e' do PROJETO: nao e' copiado nem entra no lock", async () => {
    const { tars, project, base, lock } = scaffold({
      manifest: MANIFEST.replace("pre-commit = [\"commit-msg\"]", "pre-commit = [\"commit-msg\"]\nlocal      = [\"tools/gates/meu.sh\"]"),
    });
    const r = await sync({ tars, project, log: () => {} });

    expect(r.wrote).toContain("gates/commit-msg");
    expect(Object.keys(readLock(lock).files).filter((f) => f.startsWith("gates/"))).toEqual(["gates/commit-msg"]);
    expect(fs.existsSync(path.join(base, "gates", "tools"))).toBe(false);
    expect(declare(await readManifest(project)).map((e) => e.item)).toEqual([
      "alpha", "base", "git", "commit-msg", "alpha-guard", "alpha",
    ]);
  });

  it("gate declarado que o Tars nao tem falha ruidoso (o motor nao pode rodar fantasma)", async () => {
    const { tars, project, base } = scaffold({ manifest: MANIFEST.replace('"commit-msg"', '"nao-existe"') });
    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/gates: nao-existe/);
    expect(fs.existsSync(base)).toBe(false);
  });

  it("lock versiona o Tars (version + commit) e o sha256 de cada arquivo", async () => {
    const { tars, project, lock } = scaffold();
    await sync({ tars, project, log: () => {} });
    const l = readLock(lock);
    expect(l.lockfileVersion).toBe(1);
    expect(l.tars.version).toBe("v0.3");
    expect(Object.keys(l.files).sort()).toEqual([
      "gates/commit-msg",
      "governance/alpha.md",
      "guards/alpha-guard.sh",
      "memory/agent/git.md",
      "rules/base.md",
      "skills/alpha",
    ]);
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

describe("tars-sync — guards e governance (fatia 2b)", () => {
  it("traz o guard e o doc de governanca declarados, com hash no lock", async () => {
    const { tars, project, base, lock } = scaffold();

    await sync({ tars, project, log: () => {} });

    const guard = path.join(base, "guards", "alpha-guard.sh");
    const gov = path.join(base, "governance", "alpha.md");
    expect(fs.readFileSync(guard, "utf8")).toBe(fs.readFileSync(path.join(tars, ".ai", "guards", "alpha-guard.sh"), "utf8"));
    expect(fs.readFileSync(gov, "utf8")).toBe(fs.readFileSync(path.join(tars, ".ai", "governance", "alpha.md"), "utf8"));
    const l = readLock(lock);
    expect(l.files["guards/alpha-guard.sh"].sha256).toBe(await hashSource(guard));
    expect(l.files["governance/alpha.md"].sha256).toBe(await hashSource(gov));
    // O que existe no catalogo e NAO foi declarado nao entra (nem guard, nem governanca).
    expect(fs.existsSync(path.join(base, "guards", "outro-guard.sh"))).toBe(false);
    expect(fs.existsSync(path.join(base, "governance", "outro.md"))).toBe(false);
  });

  it("guarda o BIT EXECUTAVEL do guard na copia", async () => {
    const { tars, project, base } = scaffold();

    await sync({ tars, project, log: () => {} });

    const src = fs.statSync(path.join(tars, ".ai", "guards", "alpha-guard.sh"));
    const dest = fs.statSync(path.join(base, "guards", "alpha-guard.sh"));
    expect(src.mode & 0o111).not.toBe(0);
    expect(dest.mode & 0o111).toBe(src.mode & 0o111);
  });

  it("guard editado a mao no projeto acusa drift (o guard nao pode divergir do catalogo)", async () => {
    const { tars, project, base } = scaffold();
    await sync({ tars, project, log: () => {} });
    fs.writeFileSync(path.join(base, "guards", "alpha-guard.sh"), "#!/usr/bin/env bash\necho burlado\n");

    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/drift/);
  });

  it("guard declarado que o Tars nao tem falha ruidoso", async () => {
    const { tars, project } = scaffold({
      manifest: MANIFEST.replace('guards  = ["alpha-guard"]', 'guards  = ["nao-existe"]'),
    });
    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/guards: nao-existe/);
  });
});

describe("tars-sync — parser TOML", () => {
  it("lista MULTILINHA (um item por linha) e' lida inteira", () => {
    // O manifesto do consumidor cresce em coluna unica por linha (fatia 2b): 19 skills
    // declaradas assim nao podem virar uma skill so' chamada `\n  "alpha",`.
    const cfg = parseToml(`[tars]
skills = [
  "alpha",
  "beta",
]
rules = ["r"]
`);
    expect(cfg.tars.skills).toEqual(["alpha", "beta"]);
    expect(cfg.tars.rules).toEqual(["r"]);
  });
});

describe("tars-sync — fixture do catalogo", () => {
  it("a fixture do Tars tem VERSION (contrato de origem)", () => {
    expect(fs.existsSync(path.join(TARS_FIXTURE, ".ai", "VERSION"))).toBe(true);
  });
});

describe("tars-sync — camada base marcada", () => {
  it("o fato do JSONL copiado marca `source: base` (origem no indice do consumidor)", async () => {
    const { tars, project, base } = scaffold({
      manifest: MANIFEST.replace('memory  = ["git"]', 'memory  = ["jsonl.jsonl"]'),
    });
    const jsonl = path.join(base, "memory", "agent", "jsonl.jsonl");
    const fonte = path.join(tars, ".ai", "memory", "agent", "jsonl.jsonl");
    fs.writeFileSync(fonte, JSON.stringify({ id: "mem-x", statement: "fato da base" }) + "\n");

    await sync({ tars, project, log: () => {} });

    expect(JSON.parse(fs.readFileSync(jsonl, "utf8")).source).toBe("base");
    // O CATALOGO (origem) fica intacto: a marca e' da copia, nao do fato versionado.
    expect(fs.readFileSync(fonte, "utf8")).not.toContain('"base"');
    // E a copia marcada bate com o lock (rodar de novo nao reescreve).
    const r = await sync({ tars, project, log: () => {} });
    expect(r.wrote).toEqual([]);
  });
});

describe("tars-sync — wiring do harness (fatia 3a)", () => {
  it("gera .claude/settings.json com PreToolUse chamando os guards DECLARADOS", async () => {
    const { tars, project } = scaffold();
    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(s.hooks.PreToolUse).toEqual([
      {
        matcher: "Bash|PowerShell",
        hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/alpha-guard.sh"' }],
      },
    ]);
    expect(s.hooks.SessionStart[0].hooks.map((h) => h.command)).toEqual([
      'bash "$CLAUDE_PROJECT_DIR/.ai/guards/sessionstart-context-digest.sh"',
      'bash "$CLAUDE_PROJECT_DIR/.ai/guards/ensure-memory-link.sh"',
    ]);
    // Guard do catalogo que NAO foi declarado nao entra no wiring: chamar guard inexistente
    // quebraria a sessao do consumidor.
    expect(JSON.stringify(s)).not.toContain("outro-guard.sh");
  });

  it("so' os guards declarados entram; nenhum declarado = PreToolUse vazio", async () => {
    const { tars, project } = scaffold({ manifest: MANIFEST.replace('guards  = ["alpha-guard"]', "guards  = []") });
    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(s.hooks.PreToolUse).toEqual([]);
  });

  it("rodar de novo nao reescreve o settings.json (idempotente)", async () => {
    const { tars, project } = scaffold();
    await sync({ tars, project, log: () => {} });
    const file = path.join(project, ".claude", "settings.json");
    const before = fs.statSync(file).mtimeMs;

    const r = await sync({ tars, project, log: () => {} });

    expect(r.wired).toEqual([]);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });
});

describe("tars-sync — init", () => {
  it("projeto novo ganha manifesto minimo, memoria vazia e ja' sincroniza", async () => {
    const { tars, project, base, lock } = scaffold({ manifest: null });

    const r = await init({ tars, project, log: () => {} });

    const toml = fs.readFileSync(path.join(project, ".ai", "tars.toml"), "utf8");
    expect(r.version).toBe("1.2.3");
    expect(toml).toContain("version = \"1.2.3\"");
    expect(toml).toContain("skills  = []");
    expect(toml).toContain("# Manifesto do consumidor do Tars");
    expect(declare(await readManifest(project))).toEqual([]);
    expect(fs.existsSync(path.join(project, ".ai", "memory"))).toBe(true);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it("init repetido falha ruidoso e nao toca no manifesto do projeto", async () => {
    const { tars, project } = scaffold({ manifest: null });
    await init({ tars, project, log: () => {} });
    const antes = fs.readFileSync(path.join(project, ".ai", "tars.toml"), "utf8");

    await expect(init({ tars, project, log: () => {} })).rejects.toThrow(/ja' existe .*tars\.toml/);
    expect(fs.readFileSync(path.join(project, ".ai", "tars.toml"), "utf8")).toBe(antes);
  });
});
