import { describe, expect, it } from "vitest";
import { avaliar, markdown, resumo } from "./tars-catalog.mjs";

describe("tars catalog", () => {
  const itens = [
    { area: "gates", item: "gitleaks", resumo: "a" },
    { area: "gates", item: "healthcheck", resumo: "b" },
    { area: "guards", item: "prod", resumo: "c" },
  ];
  it("classifica adotado, recusado e pendente", () => {
    const r = avaliar(itens, { gates: { "pre-commit": ["gitleaks"] } }, { "gates/healthcheck": { porque: "sem servico" } });
    expect(r.map((i) => i.estado)).toEqual(["adotado", "recusado", "pendente"]);
    expect(r[1].porque).toBe("sem servico");
  });
  it("resumo prefere a description do frontmatter", () => {
    expect(resumo("---\ndescription: faz x\n---\n# t\ntexto")).toBe("faz x");
  });
  it("markdown lista por area", () => {
    expect(markdown(itens)).toContain("| `gitleaks` | a |");
  });
  it("agent_gates conta como adotado", () => {
    expect(avaliar(itens, { agentGates: ["healthcheck"] })[1].estado).toBe("adotado");
  });
});
