import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseToml, sync } from "./tars-sync.mjs";
import { planGates, runHooks } from "./tars-hooks.mjs";

// AI-TARS fatia 4 (docs/TARS.md §Modelo): o MOTOR roda os gates da base e os locais na
// mesma ordem, para no primeiro que falhar e trata gate ausente como falha ruidosa. O
// projeto e' temporario de verdade (base sincronizada da fixture + gates locais escritos
// na hora); nada toca o Tars real.
const TARS_FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), "tars-sync-fixtures", "tars");

const MANIFEST = `[tars]
version = "v0.4"
skills  = []
rules   = []
memory  = []

[gates]
pre-commit = ["g1", "g2"]
pre-push   = ["g3"]
local      = ["tools/gates/meu.sh"]

[gates.params.g3]
n = 7
`;

/** Gate do catalogo na fixture do Tars: `gates/<nome>/gate.mjs` (o motor executa o Node). */
function gateDaBase(tars, nome, corpo) {
  const dir = path.join(tars, ".ai", "gates", nome);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "gate.mjs"), corpo);
  fs.writeFileSync(path.join(dir, "GATE.md"), `# gate: ${nome}\n`);
}

/** Projeto consumidor com a base sincronizada e os gates locais pedidos. */
async function projeto({ body = MANIFEST, gates = { g1: "process.exit(0)", g2: "process.exit(0)", g3: "process.exit(0)" }, locais = { "tools/gates/meu.sh": "exit 0\n" } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tars-hooks-"));
  const tars = path.join(root, "tars");
  const project = path.join(root, "project");
  fs.cpSync(TARS_FIXTURE, tars, { recursive: true });
  for (const [nome, corpo] of Object.entries(gates)) gateDaBase(tars, nome, corpo);
  fs.mkdirSync(path.join(project, ".ai"), { recursive: true });
  fs.writeFileSync(path.join(project, ".ai", "tars.toml"), body);
  for (const [rel, corpo] of Object.entries(locais)) {
    const f = path.join(project, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, corpo);
  }
  await sync({ tars, project, log: () => {} });
  return { root, tars, project, manifest: parseToml(body) };
}

const silencio = { log: () => {}, err: () => {} };

describe("tars-hooks — plano", () => {
  it("pre-commit = base primeiro (g1, g2) e depois o local declarado", () => {
    const manifest = parseToml(MANIFEST);
    expect(planGates(manifest, "pre-commit")).toEqual([
      { nome: "g1", origem: "base" },
      { nome: "g2", origem: "base" },
      { nome: "tools/gates/meu.sh", origem: "local", caminho: "tools/gates/meu.sh" },
    ]);
  });

  it("hook desconhecido falha nomeando os validos", () => {
    expect(() => planGates(parseToml(MANIFEST), "pre-pushh")).toThrow(/pre-commit/);
  });
});

describe("tars-hooks — ordem e parada", () => {
  it("roda os gates na ordem declarada e passa", async () => {
    const { project, manifest } = await projeto();
    const trilha = [];
    const r = runHooks({ hook: "pre-commit", manifest, project, ...silencio, spawn: (c, a) => (trilha.push([c, ...a]), { status: 0 }) });
    expect(r.ok).toBe(true);
    expect(r.rodados).toEqual(["g1", "g2", "tools/gates/meu.sh"]);
    // O 1o argumento de cada chamada e' o executavel (node p/ a base, sh p/ o local: a
    // pasta do catalogo entrega o `gate.mjs` dela); o 2o e' o alvo.
    expect(trilha.map(([c, g]) => [c, g.split("/").slice(-1)[0]])).toEqual([
      [process.execPath, "gate.mjs"],
      [process.execPath, "gate.mjs"],
      ["sh", "meu.sh"],
    ]);
    expect(trilha.map(([, g]) => g)).toEqual([
      path.join(project, ".ai/base/gates/g1/gate.mjs"),
      path.join(project, ".ai/base/gates/g2/gate.mjs"),
      path.join(project, "tools/gates/meu.sh"),
    ]);
  });

  it("para no PRIMEIRO que falhar e nomeia o gate", async () => {
    const { project, manifest } = await projeto({ gates: { g1: "process.exit(0)", g2: "process.exit(3)", g3: "process.exit(0)" } });
    const rodados = [];
    const erros = [];
    const r = runHooks({
      hook: "pre-commit", manifest, project,
      log: () => {},
      err: (m) => erros.push(m),
      spawn: (c, a) => (rodados.push(a[0]), { status: a[0].includes("/g2/") ? 3 : 0 }),
    });
    expect(r.ok).toBe(false);
    expect(r.falhou).toEqual({ nome: "g2", motivo: "rc", rc: 3 });
    expect(rodados).toHaveLength(2);
    expect(erros.join("\n")).toMatch(/gate g2: FALHOU \(exit 3\)/);
  });

  it("gate declarado e ausente na base falha ruidoso, sem rodar nada", async () => {
    // O gate declarado EXISTE no catalogo (senao o sync ja' reprovaria): ele some da BASE
    // depois do sync — e' o caso do `tars sync` que nao rodou/pulou o item.
    const { project, manifest } = await projeto();
    fs.rmSync(path.join(project, ".ai", "base", "gates", "g1"), { recursive: true });
    const erros = [];
    const rodados = [];
    const r = runHooks({ hook: "pre-commit", manifest, project, log: () => {}, err: (m) => erros.push(m), spawn: () => (rodados.push(1), { status: 0 }) });
    expect(r.ok).toBe(false);
    expect(r.falhou).toEqual({ nome: "g1", motivo: "ausente" });
    expect(rodados).toEqual([]);
    expect(erros.join("\n")).toMatch(/gate g1: NAO ENCONTRADO/);
  });

  it("o gate recebe os params do manifesto e os args do hook", async () => {
    const { project, manifest } = await projeto();
    let visto = null;
    runHooks({ hook: "pre-push", manifest, project, args: ["origin", "url"], ...silencio, spawn: (c, a, opt) => ((visto = { cmd: c, args: a, env: opt.env }), { status: 0 }) });
    expect(visto.args.slice(-2)).toEqual(["origin", "url"]);
    expect(visto.env.TARS_PROJECT).toBe(project);
    // O parser minimo do manifesto devolve o escalar como veio do arquivo (string) — quem
    // consome o parametro decide o tipo. O que o teste prova e' o REPASSE do `[gates.params.g3]`.
    expect(JSON.parse(visto.env.TARS_GATE_PARAMS)).toEqual({ n: "7" });
    expect(visto.cmd).toBe(process.execPath);
  });
});

describe("tars-hooks — local", () => {
  it("o gate LOCAL roda junto do base no pre-commit", async () => {
    const { project, manifest } = await projeto();
    const r = runHooks({ hook: "pre-commit", manifest, project, ...silencio, spawn: () => ({ status: 0 }) });
    expect(r.ok).toBe(true);
    expect(r.rodados).toEqual(["g1", "g2", "tools/gates/meu.sh"]);
  });

  it("o `local` do projeto NAO roda no pre-push (o portao caro nao o repete)", async () => {
    const { project, manifest } = await projeto();
    const r = runHooks({ hook: "pre-push", manifest, project, ...silencio, spawn: () => ({ status: 0 }) });
    expect(r.rodados).toEqual(["g3"]);
  });

  it("o hook `local` roda so' a lista [gates].local", async () => {
    const { project, manifest } = await projeto();
    const r = runHooks({ hook: "local", manifest, project, ...silencio, spawn: () => ({ status: 0 }) });
    expect(r.rodados).toEqual(["tools/gates/meu.sh"]);
  });

  it("gate local com caminho errado reprova com o caminho no erro", async () => {
    const { project, manifest } = await projeto({ locais: { "outro/caminho.sh": "exit 0\n" } });
    const erros = [];
    const r = runHooks({ hook: "local", manifest, project, log: () => {}, err: (m) => erros.push(m), spawn: () => ({ status: 0 }) });
    expect(r.ok).toBe(false);
    expect(erros.join("\n")).toMatch(/tools\/gates\/meu\.sh/);
  });
});
