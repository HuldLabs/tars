import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { schemaDoItem, validaManifest } from "./conformance.mjs";

// O item do catalogo e' fonte de si mesmo (R3): o teste le o schema e o exemplo REAIS do item —
// nao uma copia no corpo do teste. Se o schema mudar, e' aqui que a mudanca aparece.
const HERE = dirname(fileURLToPath(import.meta.url));
const schema = schemaDoItem();
const exemplo = JSON.parse(readFileSync(join(HERE, "examples", "kipp.json"), "utf8"));
const replica = (mudanca) => ({ ...structuredClone(exemplo), ...mudanca });

describe("manifesto do binario v1 — conformidade de schema (ADR-0002 D3/D8.3)", () => {
  it("1) o exemplo minimo do Kipp PASSA", () => {
    expect(validaManifest(exemplo, schema)).toEqual([]);
  });

  it("2) manifesto SEM `contract` REPROVA", () => {
    const semContract = replica({});
    delete semContract.contract;
    const errs = validaManifest(semContract, schema);
    expect(errs.some((e) => e.includes("contract") && e.includes("obrigatorio"))).toBe(true);
  });

  it("3) pagina com HTML em vez de MODELO REPROVA (D3)", () => {
    const comHtml = replica({
      pages: [{ id: "board", title: "Quadro", layout: "board", html: "<div>quadro</div>", blocks: [] }],
    });
    const errs = validaManifest(comHtml, schema);
    expect(errs.some((e) => e.includes("pages[0].html"))).toBe(true);
  });

  it("3b) `template` no bloco tambem REPROVA (nao so' o campo `html`)", () => {
    const comTemplate = replica({
      pages: [{ id: "board", layout: "board", blocks: [{ kind: "table", template: "<table>{{rows}}</table>" }] }],
    });
    const errs = validaManifest(comTemplate, schema);
    expect(errs.some((e) => e.includes('blocks[0]: campo "template"'))).toBe(true);
  });

  it("4) o exemplo e' o MINIMO: so' o que o schema declara, nada de campo solto", () => {
    expect(Object.keys(exemplo).sort()).toEqual(
      ["capabilities", "contract", "description", "events", "menu", "name", "pages", "permissions", "routes", "settings", "tablePrefix", "title", "tools", "version"],
    );
  });

  it("5) versao fora do padrao reprova (D8.3 regra 3: versao em tudo)", () => {
    const errs = validaManifest(replica({ contract: "v1" }), schema);
    expect(errs.some((e) => e.includes("contract"))).toBe(true);
  });

  it("6) campo desconhecido no topo reprova (additionalProperties: false)", () => {
    const errs = validaManifest(replica({ rota: "/extra" }), schema);
    expect(errs.some((e) => e.includes('"rota"'))).toBe(true);
  });
});
