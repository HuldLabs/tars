import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseToml, sync } from "./tars-sync.mjs";
import { actor, avalia, PREDICADOS } from "./tars-actor.mjs";
import { planGates, runHooks } from "./tars-hooks.mjs";
// O alvo do gate e' caminho de DISCO (`\` no win32): normaliza antes de casar/partir o
// nome, senao o mock do teste nunca casa com o gate e o teste so' passa no Linux.
import { posix } from "./tars-paths.mjs";

// AI-TARS fatia 4 (docs/TARS.md §Modelo): o MOTOR roda os gates da base e os locais na
// mesma ordem, para no primeiro que falhar e trata gate ausente como falha ruidosa. O
// projeto e' temporario de verdade (base sincronizada da fixture + gates locais escritos
// na hora); nada toca o Tars real.
// `new URL(...).pathname` no win32 devolve `/C:/...` e o `path.join` daqui saia `C:\C:\...`
// (o teste so' rodava no Linux). `fileURLToPath` e' o caminho de disco certo nas duas.
const TARS_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "tars-sync-fixtures", "tars");

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
    expect(trilha.map(([c, g]) => [c, posix(g).split("/").slice(-1)[0]])).toEqual([
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
      spawn: (c, a) => (rodados.push(a[0]), { status: posix(a[0]).includes("/g2/") ? 3 : 0 }),
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

describe("tars-hooks — CLI", () => {
  const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "tars-hooks.mjs");
  const roda = (project, hook) =>
    spawnSync(process.execPath, [CLI, hook], { encoding: "utf8", env: { ...process.env, TARS_PROJECT: project } });

  it("roda os gates de verdade e propaga o exit code que falha", async () => {
    // Ponte ponta-a-ponta: os gates sao PROCESSOS reais (nao o spawn injetado do teste
    // acima) — e' o que o hook do git vai executar.
    const { project } = await projeto({ gates: { g1: "process.exit(0)", g2: "process.exit(3)", g3: "process.exit(0)" } });

    const ok = roda(project, "pre-push");
    expect(ok.status).toBe(0);

    const ruim = roda(project, "pre-commit");
    expect(ruim.status).toBe(1);
    expect(ruim.stderr).toMatch(/gate g2: FALHOU \(exit 3\)/);
  });

  it("gate ausente na base derruba o hook com exit 1", async () => {
    const { project } = await projeto();
    fs.rmSync(path.join(project, ".ai", "base", "gates", "g1"), { recursive: true });
    const r = roda(project, "pre-commit");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/gate g1: NAO ENCONTRADO/);
  });
});

// dev.8 fatia 2: QUEM escreve o commit. `actor` decide 'agent' x 'human' por marcador
// POSITIVO (env do harness ou trailer `Co-Authored-By:` com nome de modelo); sem marcador
// nenhum e' humano — o default e' o lado que NAO afrouxa gate nenhum.
describe("tars-actor — quem escreveu o commit", () => {
  it("TARS_ACTOR=agent do motor marca agente", () => {
    expect(actor({ env: { TARS_ACTOR: "agent" }, msg: "" })).toBe("agent");
  });

  it("CLAUDECODE=1 marca agente", () => {
    expect(actor({ env: { CLAUDECODE: "1" }, msg: "" })).toBe("agent");
  });

  it("trailer Co-Authored-By com nome de modelo marca agente (case-insensitive)", () => {
    const com = (t) => actor({ env: {}, msg: `✨ feat(x): y\n\nCo-Authored-By: ${t} <n@a>\n` });
    expect(com("Claude")).toBe("agent");
    expect(com("claude-opus-5")).toBe("agent");
    expect(com("DeepSeek")).toBe("agent");
    expect(actor({ env: {}, msg: "feat(x): y\n\nco-authored-by: GitHub Copilot <n@a>\n" })).toBe("agent");
    expect(actor({ env: {}, msg: "feat(x): y\n\nCo-Authored-By: OpenAI <n@a>\n" })).toBe("agent");
  });

  it("Co-Authored-By de uma PESSOA nao vira agente", () => {
    expect(actor({ env: {}, msg: "feat(x): y\n\nCo-Authored-By: Joao Silva <j@a>\n" })).toBe("human");
  });

  it("sem marcador nenhum (nem env, nem msg) e' humano", () => {
    expect(actor({ env: {}, msg: "feat(x): escrevo eu\n" })).toBe("human");
    expect(actor({})).toBe("human");
    expect(actor({ env: {}, msg: undefined })).toBe("human");
  });

  it("sem `when` e' sempre true; `when` vazio tambem", () => {
    expect(avalia(undefined, {})).toBe(true);
    expect(avalia({}, { env: {}, msg: "" })).toBe(true);
  });

  it("`when` {actor} usa o ator calculado do ctx (env OU msg)", () => {
    expect(avalia({ actor: "agent" }, { env: { TARS_ACTOR: "agent" }, msg: "" })).toBe(true);
    expect(avalia({ actor: "agent" }, { env: {}, msg: "nada\n" })).toBe(false);
    expect(avalia({ actor: "human" }, { env: {}, msg: "nada\n" })).toBe(true);
    expect(avalia({ actor: "agent" }, { env: {}, msg: "x\n\nCo-Authored-By: Claude <n@a>\n" })).toBe(true);
  });

  it("predicado desconhecido GRITA (nao passa calado)", () => {
    expect(() => avalia({ cor: "azul" }, { env: {}, msg: "" })).toThrow(/cor/);
    expect(Object.keys(PREDICADOS)).toContain("actor");
  });
});

// O MOTOR com `when`: o gate condicional pula (com log nomeado) em vez de rodar. Sem
// `when` o comportamento e' o de sempre — os testes acima ja' o cobrem.
describe("tars-hooks — gate condicional (when)", () => {
  const MANIFEST_WHEN = `[tars]
version = "v0.4"
skills  = []
rules   = []
memory  = []

[gates]
pre-commit = ["g1", "g2"]

[gates.params.g2.when]
actor = "agent"
`;

  it("pula o gate cujo `when` nao casa, nomeando o motivo, e roda o resto", async () => {
    const { project } = await projeto({ body: MANIFEST_WHEN });
    const logs = [];
    const r = runHooks({
      hook: "pre-commit", manifest: parseToml(MANIFEST_WHEN), project,
      env: {},
      log: (m) => logs.push(m),
      err: () => {},
      spawn: () => ({ status: 0 }),
    });
    expect(r.ok).toBe(true);
    expect(r.rodados).toEqual(["g1"]);
    expect(logs.join("\n")).toMatch(/gate g2: pulado \(when actor=agent\)/);
  });

  it("roda o gate quando o `when` casa (CLAUDECODE no env)", async () => {
    const { project } = await projeto({ body: MANIFEST_WHEN });
    const r = runHooks({
      hook: "pre-commit", manifest: parseToml(MANIFEST_WHEN), project,
      env: { CLAUDECODE: "1" },
      ...silencio,
      spawn: () => ({ status: 0 }),
    });
    expect(r.rodados).toEqual(["g1", "g2"]);
  });

  it("no commit-msg o ctx.msg e' o arquivo do `$1` (trailer Co-Authored-By = agente)", async () => {
    const body = MANIFEST_WHEN.replace('pre-commit = ["g1", "g2"]', 'commit-msg = ["g2"]');
    const { project } = await projeto({ body });
    const msgFile = path.join(project, "MSG");
    fs.writeFileSync(msgFile, "✨ feat(x): y\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n");
    const r = runHooks({
      hook: "commit-msg", manifest: parseToml(body), project, args: [msgFile],
      env: {},
      ...silencio,
      spawn: () => ({ status: 0 }),
    });
    expect(r.rodados).toEqual(["g2"]);
  });

  it("o gate recebe TARS_ACTOR calculado pelo motor (o env do harness manda)", async () => {
    const { project } = await projeto({ body: MANIFEST_WHEN });
    let visto = null;
    runHooks({
      hook: "pre-commit", manifest: parseToml(MANIFEST_WHEN), project,
      env: { TARS_ACTOR: "agent" },
      ...silencio,
      spawn: (c, a, opt) => ((visto = opt.env), { status: 0 }),
    });
    expect(visto.TARS_ACTOR).toBe("agent");
  });
});
