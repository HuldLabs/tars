import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SCHEMA_KEYS, parseSchemaDoc, validateSchemaDoc, validateMemoryEntry, validateMemoryFile, addEntry, doctor, ensureLedger, entryIdentity, pickSurvivor, validateLedgerEntry, renderIndex, renderLedgerIndex, capIndexEntries, mergeFederated, mergeLayers, resolveBaseDir } from "./ai-memory.mjs";

// Gate da memoria operacional (regra sem teste = sugestao). Portado da ideia do
// contract test do Fabber, adaptado ao nosso schema reduzido. NEGATIVO (as regras
// disparam) + POSITIVO (o arquivo versionado satisfaz todas). Vive em tools/ (tooling
// global), nao sob hub/ (app).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const exists = (rel) => fs.existsSync(path.join(repo, rel));
const base = { id: "mem-x", ts: "2026-09-25", scope: "hub", statement: "um fato suficientemente longo", durability: "durable", source_refs: ["AGENTS.md"], confidence: "high", validation_status: "verified" };

/** Escreve um .jsonl num diretorio temporario e devolve o caminho. */
function fixture(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-memory-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe("memoria operacional — POSITIVO (arquivo real)", () => {
  it("cada linha valida (schema, source_refs, enums, sem chave proibida)", () => {
    const { errors, count } = validateMemoryFile();
    expect(errors, `arquivo: ${count} linhas`).toEqual([]);
  });
});

describe("memoria operacional — NEGATIVO (as regras disparam)", () => {
  it("falta chave", () => { const e = { ...base }; delete e.source_refs; expect(validateMemoryEntry(e)).not.toEqual([]); });
  it("chave desconhecida", () => expect(validateMemoryEntry({ ...base, extra: 1 })).not.toEqual([]));
  it("id invalido", () => expect(validateMemoryEntry({ ...base, id: "nope" })).not.toEqual([]));
  it("source_refs vazio", () => expect(validateMemoryEntry({ ...base, source_refs: [] })).not.toEqual([]));
  it("source_ref inexistente", () => expect(validateMemoryEntry({ ...base, source_refs: ["docs/nao-existe.md"] }, { exists })).not.toEqual([]));
  it("enum invalido", () => expect(validateMemoryEntry({ ...base, validation_status: "maybe" })).not.toEqual([]));
  it("chave proibida (segredo/transcricao)", () => expect(validateMemoryEntry({ ...base, token: "x" })).not.toEqual([]));
  // AC-02 da SEG-5: a mensagem tem de NOMEAR o campo, senao o pre-commit so diz "invalido".
  it("nomeia o campo que falta", () => {
    const e = { ...base }; delete e.confidence;
    expect(validateMemoryEntry(e)).toContain("falta a chave 'confidence'");
  });
});

describe("memoria operacional — NEGATIVO (linha malformada, AC-01)", () => {
  const good = JSON.stringify(base);

  it("JSON invalido reprova nomeando a linha, sem derrubar o resto do arquivo", () => {
    const { errors, count } = validateMemoryFile(fixture("malformado.jsonl", `{"id": "mem-x", "ts":\n${good}\n`));
    expect(count).toBe(2);
    expect(errors.join("\n")).toMatch(/linha 1: JSON invalido/);
  });

  it("JSON valido que nao e objeto reprova em vez de estourar TypeError", () => {
    const { errors } = validateMemoryFile(fixture("nao-objeto.jsonl", `123\n${good}\n`));
    expect(errors.join("\n")).toMatch(/linha 1: entrada nao e um objeto JSON/);
  });

  it("a linha malformada nao contamina a linha boa", () => {
    const { errors } = validateMemoryFile(fixture("misto.jsonl", `nao-e-json\n${good}\n`));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^linha 1: JSON invalido/);
  });
});

describe("memoria operacional — contrato doc x gate (AC-03)", () => {
  const readme = fs.readFileSync(path.join(repo, ".ai", "memory", "README.md"), "utf8");
  const docKeys = parseSchemaDoc(readme);

  it("o doc lista todos os campos do gate e nenhum a mais", () => {
    expect([...docKeys].sort()).toEqual([...SCHEMA_KEYS].sort());
    expect(validateSchemaDoc(readme)).toEqual([]);
  });

  it("cada campo documentado passa pelo validateMemoryEntry", () => {
    for (const k of docKeys) expect(validateMemoryEntry({ ...base, [k]: base[k] }), `campo documentado '${k}'`).toEqual([]);
  });

  it("o parser reprova campo documentado que o gate recusa (a guarda do AC-03)", () => {
    const md = "## Campos\n\n| Campo | Quem lê | Valor |\n| --- | --- | --- |\n| `id` | gate | x |\n| `expires_at` | ninguem | x |\n";
    expect(validateSchemaDoc(md)).toContain("campo documentado que o gate recusa: 'expires_at'");
  });

  it("o parser ignora a secao 'Campos recusados' (ela fala do que NAO e do schema)", () => {
    expect(docKeys).not.toContain("expires_at");
    expect(docKeys).not.toContain("kind");
  });
});

// SEG-862: add (identidade/duplicata/segredo), sobrevivente, ledger e doctor.
// KISS: 45 entradas — so' o hash de identidade e o rank de sobrevivente do farmega.v2.
describe("SEG-862 — add: duplicata e segredo", () => {
  const mem = (over = {}) => ({ ...base, ...over });
  const tmp = () => fixture("mem.jsonl", "");

  it("add grava e conta", () => {
    const f = tmp();
    const { count } = addEntry(mem({ id: "mem-aaa", source_refs: ["AGENTS.md"] }), { file: f });
    expect(count).toBe(1);
    expect(fs.readFileSync(f, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("recusa a duplicata EXATA (mesma identidade)", () => {
    const f = tmp();
    addEntry(mem({ id: "mem-aaa" }), { file: f });
    // identidade nao inclui o `id`: renomear nao engana o gate.
    const same = mem({ id: "mem-bbb" });
    // identidade nao inclui o `id` nem a expressao do `id`: renomear nao engana o gate.
    expect(() => addEntry(same, { file: f })).toThrow(/duplicata exata/);
  });

  it("recusa entrada que casa padrao de segredo", () => {
    const f = tmp();
    expect(() => addEntry(mem({ statement: "colei o token ghp_" + "A".repeat(36) + " no arquivo" }), { file: f })).toThrow(/segredo/);
    expect(fs.existsSync(f) && fs.readFileSync(f, "utf8").trim()).toBeFalsy();
  });

  it("entryIdentity muda com o conteudo", () => {
    expect(entryIdentity(mem({ statement: "um fato suficientemente longo" })))
      .not.toBe(entryIdentity(mem({ statement: "outro fato igualmente longo aqui" })));
  });
});

describe("SEG-862 — sobrevivente (funcao pura) nos 3 casos", () => {
  it("1) duravel vence operacional", () => {
    const a = { id: "a", durability: "ephemeral", origin: "human", ts: "2026-01-01" };
    const b = { id: "b", durability: "durable", origin: "human", ts: "2026-09-01" };
    expect(pickSurvivor([a, b]).id).toBe("b");
  });
  it("2) humano > importado > derivado > ia", () => {
    const ia = { id: "ia", durability: "durable", origin: "ia", ts: "2026-01-01" };
    const hum = { id: "hum", durability: "durable", origin: "human", ts: "2026-09-01" };
    expect(pickSurvivor([ia, hum]).id).toBe("hum");
  });
  it("3) mesmo rank: a mais antiga", () => {
    const velha = { id: "velha", durability: "durable", origin: "human", ts: "2026-01-01" };
    const nova = { id: "nova", durability: "durable", origin: "human", ts: "2026-09-01" };
    expect(pickSurvivor([nova, velha]).id).toBe("velha");
  });
});

describe("SEG-862 — ledger de incidentes", () => {
  const inc = { id: "inc-x", data: "2026-10-03", titulo: "job travou no retry", o_que: "o job parou", causa: "sem backoff", correcao: "adicionar backoff", recorrencia: false, fonte: ["tools/framework/ai-memory.mjs"], tags: ["jobs"] };

  it("schema minimo ok", () => expect(validateLedgerEntry(inc)).toEqual([]));
  it("recusa chave faltando", () => { const e = { ...inc }; delete e.causa; expect(validateLedgerEntry(e)).not.toEqual([]); });
  it("recusa recorrencia nao-booleana", () => expect(validateLedgerEntry({ ...inc, recorrencia: "talvez" })).not.toEqual([]));
  it("recusa segredo", () => expect(validateLedgerEntry({ ...inc, o_que: "AKIA" + "A".repeat(16) })).not.toEqual([]));
  it("ensureLedger cria o arquivo vazio", () => {
    const f = path.join(path.dirname(fixture("x", "")), "novo-ledger.jsonl");
    expect(fs.existsSync(f)).toBe(false);
    ensureLedger(f);
    expect(fs.readFileSync(f, "utf8")).toBe("");
  });
});

describe("SEG-862 — doctor acusa linha invalida e duplicata", () => {
  const memLine = (over = {}) => JSON.stringify({ ...base, ...over });
  it("linha invalida -> erro com o numero da linha", () => {
    const f = fixture("mem.jsonl", `nao-e-json\n${memLine()}\n`);
    const { errors } = doctor([{ file: f, kind: "memory" }]);
    expect(errors.some((e) => /linha 1: JSON invalido/.test(e))).toBe(true);
  });
  it("identidade duplicada -> erro", () => {
    const f = fixture("mem.jsonl", `${memLine({ id: "mem-a" })}\n${memLine({ id: "mem-b" })}\n`);
    const { errors } = doctor([{ file: f, kind: "memory" }]);
    expect(errors.some((e) => /identidade duplicada/.test(e))).toBe(true);
  });
  it("arquivo limpo -> sem erro", () => {
    const f = fixture("mem.jsonl", `${memLine({ id: "mem-a" })}\n`);
    expect(doctor([{ file: f, kind: "memory" }]).errors).toEqual([]);
  });
});

describe("SEG-869 — indices do boot (operacional e ledger em arquivos separados)", () => {
  const mem = (over = {}) => JSON.stringify({ ...base, ...over });
  const inc = (over = {}) => JSON.stringify({ id: "inc-x", data: "2026-09-26", titulo: "um incidente suficientemente longo", o_que: "fato", causa: "causa", correcao: "correcao", recorrencia: false, fonte: ["HANDOFF.md"], tags: ["t"], ...over });
  it("o INDEX do boot tem so a operacional, uma linha por entrada", () => {
    const m = fixture("mem.jsonl", `${mem({ id: "mem-a", statement: "fato A longo o bastante" })}\n${mem({ id: "mem-b" })}\n`);
    const md = renderIndex(m);
    expect(md).toContain("- [mem-a] fato A longo o bastante");
    expect(md.split("\n").filter((x) => x.startsWith("- ["))).toHaveLength(2);
    expect(md).not.toContain("Ledger");
  });
  it("o ledger sai em arquivo proprio, uma linha por incidente", () => {
    const l = fixture("led.jsonl", `${inc({ id: "inc-a" })}\n`);
    const md = renderLedgerIndex(l);
    expect(md).toContain("- [inc-a] um incidente suficientemente longo");
    expect(md.split("\n").filter((x) => x.startsWith("- ["))).toHaveLength(1);
  });
  it("titulo longo e cortado em ~70 caracteres", () => {
    const longo = "x".repeat(200);
    const md = renderIndex(fixture("mem.jsonl", `${mem({ id: "mem-a", statement: longo })}\n`));
    const linha = md.split("\n").find((x) => x.startsWith("- ["));
    expect(linha).toBe(`- [mem-a] ${"x".repeat(69)}…`);
    expect(linha.length).toBeLessThanOrEqual(70 + 12);
  });
  it("e deterministico e arquivo vazio -> '(vazio)'", () => {
    const m = fixture("mem.jsonl", `${mem({ id: "mem-a" })}\n`);
    const semCap = { teto: Infinity };
    expect(renderIndex(m, semCap)).toBe(renderIndex(m, semCap));
    expect(renderIndex(fixture("mem.jsonl", ""), semCap)).toContain("(vazio)");
  });
});

// SOFON-MEM-1: a memoria federada (7 repos) nao cabe no boot — o INDEX corta
// pelo teto do `.ai/boot-budget.json` e o resto fica sob demanda.
describe("SOFON-MEM-1 — teto do boot no indice e mescla federada", () => {
  const mem = (over = {}) => JSON.stringify({ ...base, ...over });
  const linha = (id, repo) => mem({ id, statement: `fato ${id} com tamanho suficiente`, repo });

  it("para no teto do boot e reporta o que ficou de fora", () => {
    const m = fixture("mem.jsonl", [linha("mem-a"), linha("mem-b"), linha("mem-c"), linha("mem-d")].join("\n") + "\n");
    const { entries, cap, dropped, available } = capIndexEntries({ file: m, entries: [{ id: "mem-a", statement: "x".repeat(200) }, { id: "mem-b", statement: "x".repeat(200) }], teto: 100, arquivos: [] });
    expect(cap).toBeLessThanOrEqual(2);
    expect(entries.length).toBe(cap);
    const md = renderIndex(fixture("mem.jsonl", [linha("mem-a"), linha("mem-b"), linha("mem-c")].join("\n") + "\n"), { teto: 60, arquivos: [] });
    expect(md).toMatch(/Teto do boot: 60 tokens/);
    expect(md).toContain("_Fora do boot:");
    expect(dropped).toBeGreaterThanOrEqual(0);
    expect(available).toBeGreaterThanOrEqual(0);
  });

  it("sem teto (Infinity) mantem tudo — o teto e' do boot, nao da memoria", () => {
    const m = fixture("mem.jsonl", [linha("mem-a"), linha("mem-b")].join("\n") + "\n");
    const md = renderIndex(m, { teto: Infinity });
    expect(md.split("\n").filter((l) => l.startsWith("- ["))).toHaveLength(2);
    expect(md).not.toContain("_Fora do boot:");
  });

  it("a linha do indice carrega a origem (repo) da entrada federada", () => {
    const m = fixture("mem.jsonl", `${linha("mem-a", "dotfiles")}\n`);
    expect(renderIndex(m, { teto: Infinity })).toContain("·  dotfiles");
  });

  it("mescla so' repo != segtools, com dedup por id e por statement", () => {
    const src = fixture("src.jsonl", [
      JSON.stringify({ ...base, id: "mem-x", repo: "dotfiles", statement: "fato importado do dotfiles" }),
      JSON.stringify({ ...base, id: "mem-y", repo: "dotfiles", statement: "fato importado do dotfiles" }), // mesmo statement: dup
      JSON.stringify({ ...base, id: "mem-z", repo: "segtools", statement: "fato da casa nao re-importa" }),
    ].join("\n") + "\n");
    const dest = fixture("dest.jsonl", `${mem({ id: "mem-a" })}\n`);
    const { entradas, report } = mergeFederated({ memoryFile: dest, ledgerFile: fixture("led.jsonl", ""), sourceFile: src, sourceLedger: fixture("src-led.jsonl", "") });
    expect(entradas).toBe(1);
    expect(report.dup).toBe(1);
    const linhas = fs.readFileSync(dest, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(linhas.map((e) => e.id)).not.toContain("mem-z");
    expect(linhas.find((e) => e.repo === "dotfiles").source_id).toBe("mem-x");
    expect(linhas.every((e) => e.source_refs.length === 1)).toBe(true);
  });

  it("traduz os enums da origem (operational -> ephemeral, sem confidence -> medium)", () => {
    const src = fixture("src.jsonl", JSON.stringify({ ...base, id: "mem-w", repo: "farmega", durability: "operational", confidence: undefined, statement: "fato operacional importado" }) + "\n");
    const dest = fixture("dest.jsonl", "");
    mergeFederated({ memoryFile: dest, ledgerFile: fixture("led.jsonl", ""), sourceFile: src, sourceLedger: fixture("src-led.jsonl", "") });
    const e = JSON.parse(fs.readFileSync(dest, "utf8").trim());
    expect(e.durability).toBe("ephemeral");
    expect(e.confidence).toBe("medium");
    expect(validateMemoryEntry(e).filter((x) => !/source_ref/.test(x))).toEqual([]);
  });

  it("descarta entrada vazia de teste em vez de gravar lixo", () => {
    const src = fixture("src.jsonl", JSON.stringify({ ...base, id: "mem-v", repo: "farmega", statement: "ok" }) + "\n");
    const dest = fixture("dest.jsonl", "");
    const { entradas, report } = mergeFederated({ memoryFile: dest, ledgerFile: fixture("led.jsonl", ""), sourceFile: src, sourceLedger: fixture("src-led.jsonl", "") });
    expect(entradas).toBe(0);
    expect(report.vazias).toBe(1);
  });

  // REGRESSAO (revisao SOFON-MEM-1): o indice foi commitado VAZIO com 484 entradas
  // no store — o gerador contou o tamanho do store como se ele fosse o boot e
  // zerou o orcamento. Este teste falha se o INDEX gerado tiver 0 entradas com o
  // store cheio (o defeito exato que foi para o disco).
  it("store cheio NUNCA gera indice vazio", () => {
    const m = fixture("mem.jsonl", [linha("mem-a"), linha("mem-b"), linha("mem-c")].join("\n") + "\n");
    // Orcamento minusculo: mesmo assim o indice TEM de listar (nunca 0).
    const { cap, total } = capIndexEntries({ file: m, teto: 40, arquivos: [] });
    expect(total).toBeGreaterThan(0);
    expect(cap).toBeGreaterThan(0);
    const md = renderIndex(m, { teto: 40, arquivos: [] });
    expect(md.split("\n").filter((l) => l.startsWith("- [")).length).toBeGreaterThan(0);
    expect(md).not.toContain("(vazio)");
  });

  // O boot NAO carrega o store: o orcamento do indice nao pode ser descontado por ele.
  it("o tamanho do store nao come o orcamento do indice", () => {
    const vazio = fixture("mem.jsonl", "");
    const cheio = fixture("mem.jsonl", Array.from({ length: 50 }, (_, i) => linha(`mem-${i}`)).join("\n") + "\n");
    const a = capIndexEntries({ file: vazio, teto: 2000, arquivos: [] });
    const b = capIndexEntries({ file: cheio, teto: 2000, arquivos: [] });
    expect(b.available).toBe(a.available);
    expect(b.cap).toBeGreaterThan(0);
  });

  // O INDEX lista as durable do segtools primeiro, depois as dos outros repos.
  it("ordena: durable do segtools primeiro, federadas depois", () => {
    const m = fixture("mem.jsonl", [
      linha("mem-fed", "dotfiles"), // federada, durable, primeira no arquivo
      mem({ id: "mem-efemero", statement: "fato efemero da casa com tamanho", durability: "ephemeral" }),
      mem({ id: "mem-duro", statement: "fato durable da casa com tamanho" }),
    ].join("\n") + "\n");
    const md = renderIndex(m, { teto: Infinity });
    const ids = md.split("\n").filter((l) => l.startsWith("- [")).map((l) => l.slice(3, l.indexOf("]")));
    expect(ids).toEqual(["mem-duro", "mem-efemero", "mem-fed"]);
  });
});

// TARS-MEM-2: memoria em DUAS camadas — base (copia do Tars, versionada) + projeto
// (onde a sessao escreve). O boot le a uniao; o projeto vence a base. A escrita
// (addEntry) NUNCA toca a base: e' sempre no arquivo do projeto.
describe("TARS-MEM-2 — duas camadas (base + projeto)", () => {
  const linha = (over = {}) => JSON.stringify({ ...base, ...over });
  /** Dir temporario com `base/operational-memory.jsonl`; devolve {root, base, proj}. */
  function duasCamadas(baseLinhas, projLinhas) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-memory-2c-"));
    const bdir = path.join(root, "base");
    fs.mkdirSync(bdir, { recursive: true });
    const bfile = path.join(bdir, "operational-memory.jsonl");
    const pfile = path.join(root, "projeto.jsonl");
    if (baseLinhas !== null) fs.writeFileSync(bfile, baseLinhas);
    fs.writeFileSync(pfile, projLinhas ?? "");
    return { root, base: bdir, bfile, proj: pfile };
  }

  it("1) so' base: a entrada aparece no indice marcada com a camada base", () => {
    const { base, proj } = duasCamadas(linha({ id: "mem-b", statement: "fato que veio do Tars" }) + "\n", "");
    const md = renderIndex(proj, { baseDir: base, teto: Infinity });
    expect(md).toContain("- [mem-b] fato que veio do Tars");
    expect(md).toContain("·  base");
    expect(mergeLayers({ baseDir: base, projFile: proj }).entries.map((e) => e.camada)).toEqual(["base"]);
  });

  it("2) so' projeto: entra sem marca de camada (o projeto e' o default)", () => {
    const { base, proj } = duasCamadas("", linha({ id: "mem-p", statement: "fato que nasceu aqui" }) + "\n");
    const md = renderIndex(proj, { baseDir: base, teto: Infinity });
    expect(md).toContain("- [mem-p] fato que nasceu aqui");
    expect(md).not.toContain("·  base");
    expect(mergeLayers({ baseDir: base, projFile: proj }).entries.map((e) => e.camada)).toEqual(["projeto"]);
  });

  it("3) uniao das duas: cada entrada traz a camada de origem", () => {
    const { base: bdir, proj } = duasCamadas(linha({ id: "mem-b" }) + "\n", linha({ id: "mem-p" }) + "\n");
    const { entries } = mergeLayers({ baseDir: bdir, projFile: proj });
    expect(entries.map((e) => e.id)).toEqual(["mem-b", "mem-p"]);
    expect(entries.map((e) => e.camada)).toEqual(["base", "projeto"]);
  });

  it("4) MESMO id: o projeto vence (uma linha so', a do projeto)", () => {
    const { base, proj } = duasCamadas(
      linha({ id: "mem-x", statement: "versao da base, ja' antiga" }) + "\n",
      linha({ id: "mem-x", statement: "versao do projeto, mais nova" }) + "\n",
    );
    const { entries } = mergeLayers({ baseDir: base, projFile: proj });
    expect(entries).toHaveLength(1);
    expect(entries[0].statement).toBe("versao do projeto, mais nova");
    expect(entries[0].camada).toBe("projeto");
  });

  it("5) MESMO name: o projeto vence mesmo com id diferente", () => {
    const { base, proj } = duasCamadas(
      linha({ id: "mem-base1", name: "regra-do-dono" }) + "\n",
      linha({ id: "mem-proj1", name: "regra-do-dono" }) + "\n",
    );
    const { entries } = mergeLayers({ baseDir: base, projFile: proj });
    expect(entries.map((e) => e.id)).toEqual(["mem-proj1"]);
  });

  it("6) escrita vai SEMPRE para a camada projeto (a base fica intacta)", () => {
    const { base: bdir2, bfile, proj } = duasCamadas(linha({ id: "mem-b" }) + "\n", "");
    const antes = fs.readFileSync(bfile, "utf8");
    addEntry({ ...JSON.parse(linha({ id: "mem-novo", statement: "fato escrito pela sessao" })) }, { file: proj });
    expect(fs.readFileSync(bfile, "utf8")).toBe(antes);
    expect(fs.readFileSync(proj, "utf8")).toContain("mem-novo");
    expect(mergeLayers({ baseDir: bdir2, projFile: proj }).entries.map((e) => e.id)).toEqual(["mem-b", "mem-novo"]);
  });

  it("7) base AUSENTE nao quebra; base DECLARADA e ausente falha ruidoso", () => {
    const { root, proj } = duasCamadas("", linha({ id: "mem-p" }) + "\n");
    // Sem `baseDir` (base opcional): resolve o default, que nao existe -> sem erro.
    expect(mergeLayers({ projFile: proj }).errors).toEqual([]);
    // Declarada e inexistente: erro nomeando o caminho.
    const errs = mergeLayers({ baseDir: path.join(root, "nao-existe"), projFile: proj }).errors;
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/camada 'base' declarada e ausente/);
  });

  it("8) a config decide o diretorio da base (default `.ai/base/memory`)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-memory-cfg-"));
    expect(resolveBaseDir(root)).toBe(path.join(root, ".ai/base/memory"));
    fs.mkdirSync(path.join(root, ".ai"), { recursive: true });
    fs.writeFileSync(path.join(root, ".ai", "memory.config.json"), JSON.stringify({ base: "vendor/tars-memory" }));
    expect(resolveBaseDir(root)).toBe(path.join(root, "vendor/tars-memory"));
    // `--base` (override) ganha da config.
    expect(resolveBaseDir(root, "outro/dir")).toBe(path.join(root, "outro/dir"));
  });
});
