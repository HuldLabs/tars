import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { numberedItems, validate, validateBootBudget, validateDrift, validateStructure } from "./ai-layer-check.mjs";

// SEG-844 (SOF-4): prova as duas frentes do gate — a ESTRUTURA do ADR-019 rev.2
// e o DRIFT (saída gerada editada à mão reprova). A fixture VÁLIDA passa; a
// QUEBRADA reprova nomeando o que falta; a raiz real do repo tem de passar.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const fixtures = path.join(here, "ai-layer-fixtures");

describe("ai-layer-check — estrutura .ai (ADR-019 rev.2)", () => {
  it("fixture valida passa (0 erro)", () => {
    expect(validateStructure(path.join(fixtures, "valid"))).toEqual([]);
  });

  it("fixture quebrada reprova e nomeia VERSION e a regra root", () => {
    const errs = validateStructure(path.join(fixtures, "invalid"));
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.includes("VERSION"))).toBe(true);
    expect(errs.some((e) => e.includes("root"))).toBe(true);
  });

  it("a camada real do repo esta integra", () => {
    expect(validateStructure(repo)).toEqual([]);
  });
});

describe("ai-layer-check — drift das saidas geradas", () => {
  it("a raiz real esta em dia com .ai/ (sai 0)", () => {
    expect(validateDrift(repo)).toEqual([]);
  });

  it("saida gerada editada a mao reprova nomeando o arquivo", () => {
    // CLAUDE.md e' uma saida gerada; editar a mao tem de reprovar o gate.
    const claude = path.join(repo, "CLAUDE.md");
    const before = fs.readFileSync(claude, "utf8");
    try {
      fs.appendFileSync(claude, "\n<!-- editado a mao no teste -->\n");
      const errs = validateDrift(repo);
      expect(errs.some((e) => e.includes("CLAUDE.md"))).toBe(true);
    } finally {
      fs.writeFileSync(claude, before);
    }
  });
});

describe("numberedItems", () => {
  it("extrai a ordem e descarta crase e anotacao", () => {
    const md = "1. `AGENTS.md` (raiz)\n2. `.ai/README.md`\n\ntexto\n3. `.ai/governance/*.md`\n";
    expect(numberedItems(md)).toEqual(["AGENTS.md", ".ai/README.md", ".ai/governance/*.md"]);
  });
});

describe("ai-layer-check — boot budget (SEG-869)", () => {
  // Fixture isolada: dois arquivos, um grande e um pequeno, e um teto entre os dois.
  const mk = (teto) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boot-budget-"));
    fs.writeFileSync(path.join(dir, "grande.md"), "x".repeat(4000)); // ~1000 tok
    fs.writeFileSync(path.join(dir, "pequeno.md"), "y".repeat(40)); // ~10 tok
    fs.mkdirSync(path.join(dir, ".ai"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".ai", "boot-budget.json"), JSON.stringify({ arquivos: ["grande.md", "pequeno.md"], teto_tokens: teto }));
    return dir;
  };
  it("dentro do teto -> passa", () => {
    const dir = mk(5000);
    try { expect(validateBootBudget(dir).errors).toEqual([]); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it("acima do teto -> reprova nomeando o maior arquivo", () => {
    const dir = mk(500);
    try {
      const { errors } = validateBootBudget(dir);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("grande.md");
      expect(errors[0]).toContain("acima do teto 500");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it("a raiz real do repo esta dentro do teto", () => {
    expect(validateBootBudget(repo).errors).toEqual([]);
  });
});
