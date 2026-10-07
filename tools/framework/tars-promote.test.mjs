import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMemory, promoteMemory, renderMemory } from "./tars-promote.mjs";

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
});
