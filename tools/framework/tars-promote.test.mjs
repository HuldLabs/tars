import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMemory, promoteGate, promoteMemory, promoteSkill, renderMemory } from "./tars-promote.mjs";

// AI-TARS fatia 5 (docs/TARS.md §Memoria em duas camadas): `tars promote` sobe UM item
// do projeto consumidor para o catalogo do Tars. A prova roda sobre fixture temporaria
// (Tars e projeto de verdade, nenhum dos dois e' o repo real).
const here = path.dirname(fileURLToPath(import.meta.url));
const TARS_FIXTURE = path.join(here, "tars-sync-fixtures", "tars");

const MANIFEST = `[tars]
version = "v0.3"
skills  = ["alpha"]
rules   = ["base"]
memory  = ["git"]

[gates]
pre-commit = ["commit-msg"]
`;

/** Tars (copia da fixture) + projeto consumidor temporarios. */
function scaffold({ manifest = MANIFEST } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tars-promote-"));
  const tars = path.join(root, "tars");
  const project = path.join(root, "project");
  fs.cpSync(TARS_FIXTURE, tars, { recursive: true });
  fs.mkdirSync(path.join(project, ".ai"), { recursive: true });
  if (manifest !== null) fs.writeFileSync(path.join(project, ".ai", "tars.toml"), manifest);
  return { root, tars, project };
}

/** Memoria do projeto: um fato curado (`agent/<name>.md`) + dois no JSONL. */
function seedProjectMemory(project, agent) {
  const dir = path.join(project, ".ai", "memory");
  fs.mkdirSync(path.join(dir, "agent"), { recursive: true });
  if (agent) {
    fs.writeFileSync(
      path.join(dir, "agent", "ajuste-simples.md"),
      `---\nname: ${agent.name}\ndescription: ${agent.description}\n---\n\n${agent.body}\n`,
    );
  }
  fs.writeFileSync(
    path.join(dir, "operational-memory.jsonl"),
    [
      JSON.stringify({
        id: "mem-prazo-10-mais-5-recorte",
        ts: "2026-10-01",
        scope: "coordenacao",
        statement: "Estourou 10 min: fecha o recorte provado e fatia o resto",
        durability: "durable",
        source_refs: ["docs/TARS.md:11"],
        confidence: "high",
        validation_status: "verified",
      }),
      JSON.stringify({
        id: "mem-fato-local-do-projeto",
        ts: "2026-10-02",
        scope: "segtools",
        statement: "Fato que so' vale neste projeto",
        durability: "ephemeral",
        source_refs: ["a.md:1"],
        confidence: "low",
        validation_status: "observed",
      }),
    ].join("\n") + "\n",
  );
}

const AGENT = { name: "ajuste-simples", description: "ajuste de UI simples vai direto no HMR", body: "Corpo do fato." };

describe("tars-promote — memoria", () => {
  it("fato curado do projeto vira memory/agent/<name>.md no catalogo", async () => {
    const { tars, project } = scaffold();
    seedProjectMemory(project, AGENT);

    const r = await promoteMemory({ project, tars, item: "ajuste-simples", log: () => {} });

    const dest = path.join(tars, ".ai", "memory", "agent", "ajuste-simples.md");
    expect(r).toEqual({ area: "memory", item: "ajuste-simples", dest });
    expect(fs.readFileSync(dest, "utf8")).toBe(renderMemory({ ...AGENT, kind: "agent" }));
    expect(fs.readFileSync(dest, "utf8")).toContain("description: ajuste de UI simples vai direto no HMR");
  });

  it("fato do JSONL vira agent/<id>.md, so' o pedido (o vizinho fica)", async () => {
    const { tars, project } = scaffold();
    seedProjectMemory(project, AGENT);

    const r = await promoteMemory({ project, tars, item: "mem-prazo-10-mais-5-recorte", log: () => {} });
    const body = fs.readFileSync(r.dest, "utf8");
    const nomes = fs.readdirSync(path.join(tars, ".ai", "memory", "agent")).sort();

    expect(r.item).toBe("mem-prazo-10-mais-5-recorte");
    expect(body).toContain("name: mem-prazo-10-mais-5-recorte");
    expect(body).toContain("Estourou 10 min: fecha o recorte provado e fatia o resto");
    expect(body).toContain("**Why:** promovido da memoria operacional de `scope: coordenacao`");
    expect(nomes).not.toContain("mem-fato-local-do-projeto.md");
    await expect(loadMemory(project, "mem-prazo-10-mais-5-recorte")).resolves.toMatchObject({ kind: "jsonl" });
  });

  it("item que ja' existe no Tars falha ruidoso e nao sobrescreve", async () => {
    const { tars, project } = scaffold();
    seedProjectMemory(project, AGENT);
    fs.writeFileSync(path.join(project, ".ai", "memory", "agent", "git.md"), "versao do projeto do fato git\n");
    const dest = path.join(tars, ".ai", "memory", "agent", "git.md");
    const antes = fs.readFileSync(dest, "utf8");

    await expect(promoteMemory({ project, tars, item: "git", log: () => {} })).rejects.toThrow(/ja' existe no Tars/);
    expect(fs.readFileSync(dest, "utf8")).toBe(antes);
  });

  it("item que nao existe em lugar nenhum falha nomeando os dois formatos", async () => {
    const { tars, project } = scaffold();
    seedProjectMemory(project, AGENT);
    await expect(promoteMemory({ project, tars, item: "fantasma", log: () => {} })).rejects.toThrow(/fantasma/);
  });
});

describe("tars-promote — skill e gate local", () => {
  it("skill sobe a pasta inteira (SKILL.md + regras) para o catalogo", async () => {
    const { tars, project } = scaffold();
    const src = path.join(project, ".ai", "skills", "minha-skill");
    fs.mkdirSync(path.join(src, "regras"), { recursive: true });
    fs.writeFileSync(path.join(src, "SKILL.md"), "---\nname: minha-skill\n---\n\ncorpo\n");
    fs.writeFileSync(path.join(src, "regras", "x.md"), "regra\n");

    const r = await promoteSkill({ project, tars, item: "minha-skill", log: () => {} });

    const dest = path.join(tars, ".ai", "skills", "minha-skill");
    expect(r).toEqual({ area: "skills", item: "minha-skill", dest });
    expect(fs.readFileSync(path.join(dest, "SKILL.md"), "utf8")).toContain("corpo");
    expect(fs.readFileSync(path.join(dest, "regras", "x.md"), "utf8")).toBe("regra\n");
  });

  it("gate local DECLARADO no manifesto vira gates/<nome>/ com GATE.md minimo", async () => {
    const { tars, project } = scaffold({
      manifest: MANIFEST.replace("pre-commit = [\"commit-msg\"]", "pre-commit = [\"commit-msg\"]\nlocal      = [\"tools/gates/meu.sh\"]"),
    });
    const src = path.join(project, "tools", "gates");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "meu.sh"), "#!/bin/sh\nexit 0\n");

    const r = await promoteGate({ project, tars, item: "meu", log: () => {} });

    const dest = path.join(tars, ".ai", "gates", "meu");
    const doc = fs.readFileSync(path.join(dest, "GATE.md"), "utf8");
    expect(r).toEqual({ area: "gates", item: "meu", dest });
    expect(fs.readFileSync(path.join(dest, "meu.sh"), "utf8")).toContain("exit 0");
    expect(doc).toContain("# gate: meu");
    expect(doc).toContain("## O que cobra");
    expect(doc).toContain("TODO (dono)");
    expect(doc).toContain("tools/gates/meu.sh");
    // O gate local NAO entra no lock: `[gates].local` e' do projeto (fatia 4).
    expect(fs.existsSync(path.join(tars, ".ai", "tars.lock"))).toBe(false);
  });

  it("gate local nao declarado no manifesto falha (nao inventa moradia)", async () => {
    const { tars, project } = scaffold();
    const src = path.join(project, "tools", "gates");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "meu.sh"), "#!/bin/sh\n");

    await expect(promoteGate({ project, tars, item: "meu", log: () => {} })).rejects.toThrow(/nao esta' em \[gates\].local/);
  });
});

