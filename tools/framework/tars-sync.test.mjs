import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  deadHooks,
  declare,
  destOf,
  GIT_HOOKS,
  hashSource,
  hookBody,
  hookVivo,
  init,
  parseToml,
  readManifest,
  sync,
} from "./tars-sync.mjs";
import { joinPosix, posix } from "./tars-paths.mjs";

// O `path` do win32, usado de proposito: e' ele que monta `gates\commit-msg` e quebrou a
// chave do lock. Forcar aqui prova a normalizacao mesmo quando o teste roda no Linux.
const w32 = path.win32;

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

/** O modo do arquivo no INDICE do git (`100644`/`100755`) — e' o que o git usa, nao o disco. */
function modeNoIndice(project, rel) {
  const out = execFileSync("git", ["-C", project, "ls-files", "-s", "--", rel], { encoding: "utf8" });
  return out.trim().split(/\s+/)[0];
}
// A arvore e' um conjunto de CHAVES do catalogo, nao caminho de disco: no win32 o
// `readdirSync` devolve `gates\commit-msg` e a comparacao com o esperado (sempre `/`)
// reprovaria um sync correto. Mesma regua do `tars-paths.mjs`.
const treeOf = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true }).map(String).map((p) => p.replace(/\\/g, "/")).sort()
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

  it("sem `version` no manifesto, o lock grava a versao do CATALOGO (package.json)", async () => {
    // `version = "..."` no manifesto e' override opcional; sem ele o lock tem de trazer a
    // versao real do catalogo — e' o que o `upgrade-notes` compara depois.
    const { tars, project, lock } = scaffold({ manifest: MANIFEST.replace('version = "v0.3"\n', "") });
    fs.writeFileSync(path.join(tars, ".ai", "VERSION"), "0.0.1-dev.9\n");
    await sync({ tars, project, log: () => {} });
    expect(readLock(lock).tars.version).toBe("0.0.1-dev.9");
  });

  it("versao subiu desde o lock: o sync aponta `tars upgrade-notes`", async () => {
    const { tars, project } = scaffold({ manifest: MANIFEST.replace('version = "v0.3"\n', "") });
    fs.writeFileSync(path.join(tars, ".ai", "VERSION"), "0.0.1-dev.2\n");
    await sync({ tars, project, log: () => {} });
    fs.writeFileSync(path.join(tars, ".ai", "VERSION"), "0.0.1-dev.3\n");
    const linhas = [];
    const r = await sync({ tars, project, log: (l) => linhas.push(l) });
    expect(linhas.join("\n")).toContain("rode `tars upgrade-notes`");
    expect(r.fromVersion).toBe("0.0.1-dev.2");
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

  // No win32 o NTFS nao guarda bit de execucao (chmod so' mexe no read-only): a testemunha
  // la' e' o shebang, coberta pelos testes de `hookVivo`. Aqui a prova e' POSIX.
  it.skipIf(process.platform === "win32")("guarda o BIT EXECUTAVEL do guard na copia", async () => {
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
  it("guard que source'a um irmao traz o irmao junto (senao o guard nao roda)", async () => {
    // O `block-destructive-commands` faz `source lib-json.sh`: sem o irmao na base o guard
    // sai com `jget: command not found` e LIBERA o comando. Guard declarado puxa a dep.
    const { tars, project, base } = scaffold({
      manifest: MANIFEST.replace("alpha-guard", "block-destructive-commands"),
    });
    // O catalogo de fixture ganha o guard e o irmao `lib-json.sh`.
    fs.writeFileSync(path.join(tars, ".ai", "guards", "block-destructive-commands.sh"), "#!/usr/bin/env bash\nsource \"$(dirname \"$0\")/lib-json.sh\"\n");
    fs.writeFileSync(path.join(tars, ".ai", "guards", "lib-json.sh"), "jget() { :; }\n");

    await sync({ tars, project, log: () => {} });

    expect(fs.existsSync(path.join(base, "guards", "block-destructive-commands.sh"))).toBe(true);
    expect(fs.existsSync(path.join(base, "guards", "lib-json.sh"))).toBe(true);
  });

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
    // `env` NAO INTERATIVO (07/10): sem ele um `git fetch` sem credencial bloqueia esperando
    // senha que ninguem digita. As 3 chaves fecham a CLASSE para todo consumidor de uma vez.
    // `TARS_ACTOR` (dev.8, fatia 2b) entra junto: o harness do agente declara o ator, e o
    // motor (`tars-actor.mjs`) le' esse env para decidir se cobra a licao do gate.
    expect(s.env).toEqual({
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=15",
      TARS_ACTOR: "agent",
    });
    // Guard do catalogo que NAO foi declarado nao entra no wiring: chamar guard inexistente
    // quebraria a sessao do consumidor.
    expect(JSON.stringify(s)).not.toContain("outro-guard.sh");
  });

  it("`[env]` do consumidor NAO rebaixa o ator: o harness segue declarando agent", async () => {
    // `TARS_ACTOR = "human"` no manifesto teria o mesmo efeito que o guard barra na linha de
    // comando (isentar o commit da licao). `ACTOR_ENV` entra por ultimo e fecha a classe aqui.
    const { tars, project } = scaffold({ manifest: `${MANIFEST}\n[env]\nTARS_ACTOR = "human"\n` });
    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(s.env.TARS_ACTOR).toBe("agent");
  });

  it("hook cujo arquivo NAO existe no consumidor e' OMITIDO (nao aponta para o vazio)", async () => {
    // Consumidor SEM os guards da base: o hook nao pode sair apontando para `.ai/guards/`
    // ausente — o harness rodaria `bash: no such file` e sujaria toda sessao (seo-brain, 07/10).
    const { tars, project } = scaffold();
    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(JSON.stringify(s)).not.toContain("sessionstart-context-digest.sh");
    expect(JSON.stringify(s)).not.toContain("ensure-memory-link.sh");
    // O guard DECLARADO tem arquivo na base copiada: continua entrando.
    expect(JSON.stringify(s)).toContain(".ai/base/guards/alpha-guard.sh");
  });

  it("so' os guards declarados entram; nenhum declarado = PreToolUse vazio", async () => {
    const { tars, project } = scaffold({ manifest: MANIFEST.replace('guards  = ["alpha-guard"]', "guards  = []") });
    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(s.hooks.PreToolUse).toEqual([]);
  });

  it("script de TESTE declarado (test-*.sh) NAO vira hook: prova, nao guard (item 1a)", async () => {
    // `test-*.sh` e' a suite do guard: o consumidor o declara para ter a prova por perto,
    // mas amarra-lo ao PreToolUse faria cada Bash pagar o teste inteiro. Vira proibido em
    // DOIS papeis: a funcao pura (preToolUseFor) e o settings do consumidor real.
    const { preToolUseFor } = await import("./tars-sync.mjs");
    expect(preToolUseFor({ guards: ["alpha-guard", "test-alpha-guard"] })).toEqual([
      {
        matcher: "Bash|PowerShell",
        hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/alpha-guard.sh"' }],
      },
    ]);
    const { tars, project } = scaffold({
      manifest: MANIFEST.replace('guards  = ["alpha-guard"]', 'guards  = ["alpha-guard", "test-alpha-guard"]'),
    });
    fs.writeFileSync(path.join(tars, ".ai", "guards", "test-alpha-guard.sh"), "#!/usr/bin/env bash\nexit 0\n");
    await sync({ tars, project, log: () => {} });
    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(JSON.stringify(s)).not.toContain("test-alpha-guard.sh");
    // Mas a prova VAI para a base: consumidor roda a suite sem depender do catalogo.
    expect(fs.existsSync(path.join(project, ".ai", "base", "guards", "test-alpha-guard.sh"))).toBe(true);
  });

  it("sync e' SIMETRICO: item que saiu do manifesto sai da base copiada (TARS-BUG-3)", async () => {
    // Ate' aqui o sync so' ACRESCENTAVA: guard removido da declaracao (ou do catalogo)
    // ficava vivo no consumidor como FANTASMA, rodando no PreToolUse sem ninguem ter
    // declarado. Endurance, 14/10 (END-SYNC-2). A prova de posse e' o lock.
    const { tars, project, base } = scaffold();
    fs.writeFileSync(path.join(tars, ".ai", "guards", "guard-extra.sh"), "#!/usr/bin/env bash\nexit 0\n");
    const comExtra = MANIFEST.replace('guards  = ["alpha-guard"]', 'guards  = ["alpha-guard", "guard-extra"]');
    fs.writeFileSync(path.join(project, ".ai", "tars.toml"), comExtra);
    await sync({ tars, project, log: () => {} });
    expect(fs.existsSync(path.join(base, "guards", "guard-extra.sh"))).toBe(true);

    // O manifesto deixa de declarar o guard extra.
    fs.writeFileSync(path.join(project, ".ai", "tars.toml"), MANIFEST);
    await sync({ tars, project, log: () => {} });

    expect(fs.existsSync(path.join(base, "guards", "guard-extra.sh"))).toBe(false);
    expect(fs.existsSync(path.join(base, "guards", "alpha-guard.sh"))).toBe(true);
    // O lock perdeu a chave: sem isso o proximo sync acharia que o item ainda e' nosso.
    expect(readLock(path.join(project, ".ai", "tars.lock")).files["guards/guard-extra.sh"]).toBeUndefined();
    // Nada de guard fantasma no wiring.
    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(JSON.stringify(s)).not.toContain("guard-extra.sh");
  });

  it("sync NAO apaga arquivo que ele nunca escreveu na base (posse e' o lock)", async () => {
    // Apagar o que nao e' nosso e' o incident de 07/10 esperando acontecer de novo: arquivo
    // posto a mao pelo consumidor em `.ai/base/` nao esta' no lock e fica intacto.
    const { tars, project, base } = scaffold();
    await sync({ tars, project, log: () => {} });
    fs.writeFileSync(path.join(base, "guards", "do-projeto.sh"), "#!/usr/bin/env bash\nexit 0\n");
    await sync({ tars, project, log: () => {} });
    expect(fs.existsSync(path.join(base, "guards", "do-projeto.sh"))).toBe(true);
  });

  it("guard de CONTEUDO nao vai para o Bash: matcher vem do `[hooks.guard]` (TARS-BUG-2)", async () => {
    // O sync amarrava TODO guard declarado ao `PreToolUse:Bash` — um guard que julga o
    // ESCRITO (ex.: `daneel-acoes`, Edicao de arquivo) nunca disparava na ferramenta que
    // escreve. Endurance, 14/10. O matcher e' DECLARADO no manifesto, nunca inferido.
    const { preToolUseFor } = await import("./tars-sync.mjs");
    expect(preToolUseFor({ guards: ["alpha-guard", "daneel-acoes"], hooks: { guard: { "daneel-acoes": "Edit|Write" } } })).toEqual([
      {
        matcher: "Bash|PowerShell",
        hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/alpha-guard.sh"' }],
      },
      {
        matcher: "Edit|Write",
        hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/daneel-acoes.sh"' }],
      },
    ]);

    // Fim a fim: o settings do consumidor segue o manifesto.
    const { tars, project } = scaffold({
      manifest: `${MANIFEST}\n[hooks.guard]\n"alpha-guard" = "Edit|Write"\n`,
    });
    await sync({ tars, project, log: () => {} });
    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(s.hooks.PreToolUse).toEqual([
      {
        matcher: "Edit|Write",
        hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/alpha-guard.sh"' }],
      },
    ]);
  });

  it("hook da base cita o caminho que EXISTE (projeto ou base copiada), nao `.ai/guards/` fixo", async () => {
    // O consumidor que so' usa a base copiada tem os guards em `.ai/base/guards/`. Emitir
    // `.ai/guards/<file>` fixo fazia o harness rodar `bash: no such file` (seo-brain, 07/10).
    const { tars, project, base } = scaffold();
    fs.mkdirSync(path.join(base, "guards"), { recursive: true });
    for (const f of ["precompact-persist-state.sh", "sessionstart-context-digest.sh", "ensure-memory-link.sh"])
      fs.copyFileSync(path.join(tars, ".ai", "guards", f), path.join(base, "guards", f));

    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    const comandos = (evento) => s.hooks[evento].flatMap((e) => e.hooks.map((h) => h.command));
    // PreCompact e SessionStart: os DOIS eventos da base (o defeito cobria so' o primeiro).
    expect(comandos("PreCompact")).toEqual(['bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/precompact-persist-state.sh"']);
    expect(comandos("SessionStart")).toEqual([
      'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/sessionstart-context-digest.sh"',
      'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/ensure-memory-link.sh"',
    ]);
    // E o caminho citado tem de EXISTIR de fato — e' a asserção que pega o regresso.
    for (const c of [...comandos("PreCompact"), ...comandos("SessionStart")]) {
      const rel = c.match(/CLAUDE_PROJECT_DIR\/(.+)"$/)[1];
      expect(fs.existsSync(path.join(project, rel))).toBe(true);
    }
    expect(fs.existsSync(path.join(base, "guards", "precompact-persist-state.sh"))).toBe(true);
  });

  it("guard da base no PROJETO (`.ai/guards/`) vence a copia da base", async () => {
    // `resolveGuardFile` procura no projeto primeiro: o hook tem de citar o que ele achou.
    const { tars, project } = scaffold();
    fs.mkdirSync(path.join(project, ".ai", "guards"), { recursive: true });
    fs.writeFileSync(path.join(project, ".ai", "guards", "sessionstart-context-digest.sh"), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(tars, ".ai", "guards", "sessionstart-context-digest.sh"), "#!/usr/bin/env bash\nexit 0\n");

    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(s.hooks.SessionStart.flatMap((e) => e.hooks.map((h) => h.command))).toEqual([
      'bash "$CLAUDE_PROJECT_DIR/.ai/guards/sessionstart-context-digest.sh"',
    ]);
  });

  it("biblioteca (`lib-*.sh`) copiada como dependencia NAO vira hook", async () => {
    // `lib-json.sh` e' `source`ado pelo guard, nao um hook: amarra-la ao PreToolUse faria o
    // harness RODAR a biblioteca (que so' define funcoes e sai 0) sem cobrar nada.
    const { tars, project } = scaffold({
      manifest: MANIFEST.replace("alpha-guard", "block-destructive-commands"),
    });
    fs.writeFileSync(path.join(tars, ".ai", "guards", "block-destructive-commands.sh"), "#!/usr/bin/env bash\nsource \"$(dirname \"$0\")/lib-json.sh\"\n");
    fs.writeFileSync(path.join(tars, ".ai", "guards", "lib-json.sh"), "jget() { :; }\n");

    await sync({ tars, project, log: () => {} });

    const s = JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"));
    expect(JSON.stringify(s.hooks)).not.toContain("lib-json.sh");
    // Mas a biblioteca VAI para a base: sem ela o guard que a `source`a nao roda.
    expect(fs.existsSync(path.join(project, ".ai", "base", "guards", "lib-json.sh"))).toBe(true);
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

describe("tars-sync — hooks do git (fatia 3b)", () => {
  it("declarar gate de hook git BASTA: consumidor novo ganha `.githooks/` e o hooksPath ligado (TARS-BUG-4)", async () => {
    // O gatilho antigo era a PASTA `.githooks/` ja' existir: consumidor novo declarava
    // `pre-commit` e ficava sem hook nenhum, calado (END-SYNC-3, Endurance 14/10). Agora o
    // manifesto E' o pedido — o sync cria a pasta e liga `core.hooksPath`.
    const { tars, project } = scaffold();
    execFileSync("git", ["-C", project, "init", "-q"]);
    const r = await sync({ tars, project, log: () => {} });

    expect(r.hooks).toContain(".githooks/pre-commit");
    expect(fs.existsSync(path.join(project, ".githooks", "pre-commit"))).toBe(true);
    expect(execFileSync("git", ["-C", project, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim()).toBe(
      ".githooks",
    );
  });

  it("consumidor SEM gate de hook git nao ganha pasta nem troca o hooksPath (pedido explicito)", async () => {
    const { tars, project } = scaffold({ manifest: MANIFEST.replace('[gates]\npre-commit = ["commit-msg"]\n', "[gates]\n") });
    execFileSync("git", ["-C", project, "init", "-q"]);
    const r = await sync({ tars, project, log: () => {} });
    expect(r.hooks).toEqual([]);
    expect(fs.existsSync(path.join(project, ".githooks"))).toBe(false);
    let hooksPath = "";
    try {
      hooksPath = execFileSync("git", ["-C", project, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();
    } catch {
      hooksPath = "";
    }
    expect(hooksPath).toBe("");
  });

  it("gera `.githooks/pre-commit` executavel apontando o motor, so' para o hook declarado", async () => {
    const { tars, project } = scaffold();
    fs.mkdirSync(path.join(project, ".githooks"), { recursive: true });

    const r = await sync({ tars, project, log: () => {} });

    // So' `pre-commit` esta' no `[gates]` do manifesto (roda o gate commit-msg): os outros
    // hooks do git nao nascem — o consumidor so' paga o que declarou.
    expect(r.hooks).toEqual([".githooks/pre-commit"]);
    const f = path.join(project, ".githooks", "pre-commit");
    const body = fs.readFileSync(f, "utf8");
    expect(body).toContain("tars hooks pre-commit");
    // A testemunha de "hook vivo" e' a da plataforma (bit no POSIX, shebang no win32) — a
    // MESMA que o `deadHooks` usa: assert aqui com `mode & 0o111` reprovava no Windows um
    // hook que o proprio sync considera vivo.
    expect(hookVivo(f)).toBe(true);
    expect(body.startsWith("#!")).toBe(true);
    expect(fs.existsSync(path.join(project, ".githooks", "commit-msg"))).toBe(false);
  });

  it("rodar de novo nao reescreve o hook (idempotente)", async () => {
    const { tars, project } = scaffold();
    fs.mkdirSync(path.join(project, ".githooks"), { recursive: true });
    await sync({ tars, project, log: () => {} });
    const f = path.join(project, ".githooks", "pre-commit");
    const before = fs.statSync(f).mtimeMs;

    const r = await sync({ tars, project, log: () => {} });

    expect(r.hooks).toEqual([]);
    expect(fs.statSync(f).mtimeMs).toBe(before);
  });

  it("hook do projeto sem a marca de autoria NAO e' sobrescrito (incident 07/10)", async () => {
    const { tars, project } = scaffold();
    const dir = path.join(project, ".githooks");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "pre-commit");
    const meu = "#!/usr/bin/env sh\n# meu gate\n";
    fs.writeFileSync(f, meu);

    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/autoria|adotar/);
    // O gate do projeto continua byte a byte o mesmo.
    expect(fs.readFileSync(f, "utf8")).toBe(meu);
  });

  it("`--adopt <hook>` adota o hook do projeto: vira o gerado e o original fica no `.bak`", async () => {
    const { tars, project } = scaffold();
    const dir = path.join(project, ".githooks");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "pre-commit");
    const meu = "#!/usr/bin/env sh\n# meu gate\n";
    fs.writeFileSync(f, meu);

    const r = await sync({ tars, project, log: () => {}, adopt: ["pre-commit"] });

    expect(r.hooks).toContain(".githooks/pre-commit");
    expect(hookVivo(f)).toBe(true);
    expect(fs.readFileSync(f, "utf8")).toContain("# Gerado por `tars sync`");
    expect(fs.readFileSync(f + ".bak", "utf8")).toBe(meu);
  });

  it("`prepare-commit-msg` do projeto tambem e' protegido (o sync o soma aos alvos)", async () => {
    const manifest = `${MANIFEST}commit-msg = ["commit-msg"]
`;
    const { tars, project } = scaffold({ manifest });
    const dir = path.join(project, ".githooks");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "prepare-commit-msg");
    const meu = "#!/usr/bin/env sh\n# meu injetor\n";
    fs.writeFileSync(f, meu);

    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/prepare-commit-msg/);
    expect(fs.readFileSync(f, "utf8")).toBe(meu);
  });

  it("`settings.json` ilegivel nao e' reescrito do zero: falha alto nomeando o arquivo", async () => {
    const { tars, project } = scaffold();
    const dir = path.join(project, ".claude");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "settings.json");
    fs.writeFileSync(f, "{ isso nao e' json");

    await expect(sync({ tars, project, log: () => {} })).rejects.toThrow(/settings\.json/);
    expect(fs.readFileSync(f, "utf8")).toBe("{ isso nao e' json");
  });

  it("`core.hooksPath` declarado tambem liga a geracao", async () => {
    const { tars, project } = scaffold();
    // O consumidor ja' usa hooks proprios numa pasta qualquer declarada no git.
    fs.mkdirSync(path.join(project, ".minha-hooks"), { recursive: true });
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["-C", project, "init", "-q"]);
    execFileSync("git", ["-C", project, "config", "core.hooksPath", ".minha-hooks"]);

    const r = await sync({ tars, project, log: () => {} });

    expect(r.hooks).toEqual([".minha-hooks/pre-commit"]);
    expect(fs.existsSync(path.join(project, ".minha-hooks", "pre-commit"))).toBe(true);
  });

  it("hook JA' versionado como 644 volta a 755 no INDICE do git (sem isso o git ignora o hook)", async () => {
    const { tars, project } = scaffold();
    const dir = path.join(project, ".githooks");
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("git", ["-C", project, "init", "-q"]);
    execFileSync("git", ["-C", project, "config", "user.email", "t@t"]);
    execFileSync("git", ["-C", project, "config", "user.name", "t"]);
    // O consumidor real: o hook foi commitado SEM o bit de execucao (100644), ja' com o
    // corpo GERADO por um sync anterior. O git le o modo do INDICE, nao do disco —
    // reescrever o conteudo no disco nao o torna executavel para o git
    // ("was ignored because it's not set as executable"), e o corpo identico faz o sync
    // pular o arquivo na idempotencia.
    const f = path.join(dir, "pre-commit");
    fs.writeFileSync(f, hookBody("pre-commit"));
    execFileSync("git", ["-C", project, "add", ".githooks/pre-commit"]);
    execFileSync("git", ["-C", project, "update-index", "--chmod=-x", ".githooks/pre-commit"]);
    expect(modeNoIndice(project, ".githooks/pre-commit")).toBe("100644");

    await sync({ tars, project, log: () => {} });

    expect(modeNoIndice(project, ".githooks/pre-commit")).toBe("100755");
  });
});

describe("tars-sync — modo self (o Tars consumindo a si mesmo)", () => {
  const SELF = `[tars]
version = "1.2.3"
guards = ["alpha-guard"]

[gates]
pre-commit = ["commit-msg"]
commit-msg = ["commit-msg"]
`;
  // No modo self o projeto E' o catalogo: mesma pasta. A base JA' e' o `.ai/` do catalogo.
  const selfScaffold = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tars-self-"));
    const tars = path.join(root, "tars");
    fs.cpSync(TARS_FIXTURE, tars, { recursive: true });
    // Gates/guards que o manifesto declara moram no `.ai/` do catalogo (nao ha' `.ai/base/`).
    fs.mkdirSync(path.join(tars, ".ai", "gates", "commit-msg"), { recursive: true });
    fs.writeFileSync(path.join(tars, ".ai", "gates", "commit-msg", "gate.mjs"), "process.exit(0)\n");
    fs.writeFileSync(path.join(tars, ".ai", "guards", "alpha-guard.sh"), "exit 0\n");
    fs.mkdirSync(path.join(tars, ".githooks"), { recursive: true });
    fs.writeFileSync(path.join(tars, ".ai", "tars.toml"), SELF);
    execFileSync("git", ["-C", tars, "init", "-q"]);
    execFileSync("git", ["-C", tars, "config", "core.hooksPath", ".githooks"]);
    return { tars };
  };

  it("NAO copia a base (nada de `.ai/base/`) — a base ja' e' o `.ai/` do catalogo (R3)", async () => {
    const { tars } = selfScaffold();
    await sync({ tars, project: tars, log: () => {} });
    expect(fs.existsSync(path.join(tars, ".ai", "base"))).toBe(false);
    expect(fs.existsSync(path.join(tars, ".ai", "tars.lock"))).toBe(false);
  });

  it("gera os hooks do git apontando o motor, so' os declarados (+ prepare-commit-msg do commit-msg)", async () => {
    const { tars } = selfScaffold();
    const r = await sync({ tars, project: tars, log: () => {} });
    // `prepare-commit-msg` acompanha o `commit-msg` (injeta o emoji do tipo); `pre-push` nao
    // e' declarado e por isso nao nasce.
    expect(r.hooks).toEqual([".githooks/pre-commit", ".githooks/commit-msg", ".githooks/prepare-commit-msg"]);
    expect(fs.existsSync(path.join(tars, ".githooks", "pre-push"))).toBe(false);
  });

  it("o guard declarado aponta `.ai/guards/` (nao `.ai/base/guards/`)", async () => {
    const { tars } = selfScaffold();
    await sync({ tars, project: tars, log: () => {} });
    const s = JSON.parse(fs.readFileSync(path.join(tars, ".claude", "settings.json"), "utf8"));
    const cmd = s.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).toContain(".ai/guards/alpha-guard.sh");
    expect(cmd).not.toContain(".ai/base/");
  });
});

// ---------------------------------------------------------------------------
// Poda da saida gerada orfa (familia D). Caso real do seo-brain (07/10): skill
// RENOMEADA no catalogo (`fabber-root-cause-debugging` -> `root-cause-debugging`);
// depois do sync o consumidor ficou com AS DUAS em `.agents/skills/` — o gerador
// (rulesync) escreve o novo e nao sabe que o antigo era dele. O sync e' quem tem a
// memoria (o lock) da saida que ELE gerou, entao a poda mora aqui.
// ---------------------------------------------------------------------------
describe("tars-sync — poda da saida gerada orfa", () => {
  // Simula o que o gerador (rulesync) escreve nesta maquina: uma pasta por skill
  // declarada, em cada alvo de ferramenta. O nome da pasta e' a impressao digital
  // da poda: o sync so' tira a que o manifesto NAO declara mais.
  const gerarSaida = (project, nome) => {
    for (const dir of [".claude/skills", ".agents/skills", ".opencode/skills"]) {
      const d = path.join(project, dir, nome);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, "SKILL.md"), `# ${nome}\n`);
    }
  };

  it("skill que SAIU do manifesto tem a saida gerada podada; a declarada fica", async () => {
    const { tars, project, lock } = scaffold();
    gerarSaida(project, "alpha");
    gerarSaida(project, "root-cause-debugging"); // ficou de uma versao anterior do manifesto
    // O lock de ANTES registra as duas: e' a memoria de que a orfa foi gerada por nos.
    await sync({ tars, project, log: () => {} });
    const l = JSON.parse(fs.readFileSync(lock, "utf8"));
    l.files["skills/root-cause-debugging"] = { area: "skills", item: "root-cause-debugging", sha256: "sha256-" + "0".repeat(64) };
    fs.writeFileSync(lock, JSON.stringify(l, null, 2) + "\n");
    const antes = fs.statSync(path.join(project, ".agents/skills", "alpha", "SKILL.md")).mtimeMs;

    const r = await sync({ tars, project, log: () => {} });

    // A orfa nao existe mais em alvo nenhum; a declarada segue intacta.
    for (const dir of [".claude/skills", ".agents/skills", ".opencode/skills"]) {
      expect(fs.existsSync(path.join(project, dir, "root-cause-debugging"))).toBe(false);
      expect(fs.existsSync(path.join(project, dir, "alpha", "SKILL.md"))).toBe(true);
    }
    expect(fs.statSync(path.join(project, ".agents/skills", "alpha", "SKILL.md")).mtimeMs).toBe(antes);
    expect(r.pruned.join("\n")).toMatch(/\.agents\/skills\/root-cause-debugging/);
  });

  it("a lista de nomes vivos e' o MANIFESTO (nao o lock): skill nova ainda nao gerada NAO e' podada", async () => {
    const { tars, project } = scaffold();
    // O consumidor declara 'beta' (que o catalogo tem) e ela ja' foi gerada por ferramenta.
    fs.mkdirSync(path.join(tars, ".ai", "skills", "beta"), { recursive: true });
    fs.writeFileSync(path.join(tars, ".ai", "skills", "beta", "SKILL.md"), "# beta\n");
    fs.writeFileSync(
      path.join(project, ".ai", "tars.toml"),
      MANIFEST.replace('skills  = ["alpha"]', 'skills  = ["alpha", "beta"]'),
    );
    gerarSaida(project, "alpha");
    gerarSaida(project, "beta"); // ordem real: generate escreve, sync depois reconcilia

    await sync({ tars, project, log: () => {} });

    expect(fs.existsSync(path.join(project, ".agents/skills", "beta", "SKILL.md"))).toBe(true);
  });

  it("pasta SEM a marca de autoria do gerador (do projeto) NUNCA e' apagada: so' avisa", async () => {
    const { tars, project } = scaffold();
    const d = path.join(project, ".agents/skills", "minha-skill-da-casa");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "SKILL.md"), "# escrita a mao pelo dono\n");
    const avisos = [];
    const log = (l) => avisos.push(l);

    const r = await sync({ tars, project, log });

    expect(fs.existsSync(path.join(d, "SKILL.md"))).toBe(true); // intacta, byte a byte
    expect(r.pruned).toEqual([]);
    expect(avisos.join("\n")).toMatch(/minha-skill-da-casa/);
    expect(avisos.join("\n")).toMatch(/nao declarad|orfa|aviso/i);
  });

  it("poda e' idempotente: rodar de novo nao reescreve nada e nao repete a poda", async () => {
    const { tars, project, lock } = scaffold();
    gerarSaida(project, "alpha");
    gerarSaida(project, "root-cause-debugging");
    await sync({ tars, project, log: () => {} });
    const lockBefore = fs.readFileSync(lock, "utf8");
    const antes = fs.statSync(path.join(project, ".agents/skills", "alpha", "SKILL.md")).mtimeMs;

    const r = await sync({ tars, project, log: () => {} });

    expect(r.pruned).toEqual([]);
    expect(fs.readFileSync(lock, "utf8")).toBe(lockBefore);
    expect(fs.statSync(path.join(project, ".agents/skills", "alpha", "SKILL.md")).mtimeMs).toBe(antes);
  });

  it("`--check` acusa a orfa sem apagar nada", async () => {
    const { tars, project, lock } = scaffold();
    gerarSaida(project, "alpha");
    gerarSaida(project, "root-cause-debugging");
    await sync({ tars, project, log: () => {} });
    const l = JSON.parse(fs.readFileSync(lock, "utf8"));
    l.files["skills/root-cause-debugging"] = { area: "skills", item: "root-cause-debugging", sha256: "sha256-" + "0".repeat(64) };
    fs.writeFileSync(lock, JSON.stringify(l, null, 2) + "\n");

    const r = await sync({ tars, project, check: true, log: () => {} });

    expect(r.pruned.join("\n")).toMatch(/root-cause-debugging/);
    expect(fs.existsSync(path.join(project, ".agents/skills", "root-cause-debugging"))).toBe(true);
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

  it("init AVISA que sem gate de hook git o repo comita sem gate (TARS-BUG-4)", async () => {
    // O `init` criava o manifesto com `[gates]` vazio e nao dizia nada: o consumidor novo
    // comitava sem gate achando que estava coberto (END-SYNC-3, Endurance 14/10).
    const { tars, project } = scaffold({ manifest: null });
    const linhas = [];
    await init({ tars, project, log: (l) => linhas.push(l) });
    expect(linhas.join("\n")).toMatch(/SEM GATE/);
  });

  it("init repetido falha ruidoso e nao toca no manifesto do projeto", async () => {    const { tars, project } = scaffold({ manifest: null });
    await init({ tars, project, log: () => {} });
    const antes = fs.readFileSync(path.join(project, ".ai", "tars.toml"), "utf8");

    await expect(init({ tars, project, log: () => {} })).rejects.toThrow(/ja' existe .*tars\.toml/);
    expect(fs.readFileSync(path.join(project, ".ai", "tars.toml"), "utf8")).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// Paridade Windows (0.0.1-dev.8): chave de catalogo e' IDENTIFICADOR (sempre `/`), e o
// "hook vivo" tem testemunha por plataforma. No Linux estas provas nao mudam nada; no
// win32 elas sao a diferenca entre um lock que casa e um drift falso.
// ---------------------------------------------------------------------------
describe("tars-sync — paridade Windows", () => {
  it("a chave do item e' posix em QUALQUER plataforma (join do win32 normalizado)", () => {
    expect(destOf({ area: "gates", item: "commit-msg" })).toBe("gates/commit-msg");
    expect(destOf({ area: "memory", item: "git" })).toBe("memory/agent/git.md");
    expect(destOf({ area: "guards", item: "block-secret-dump" })).toBe("guards/block-secret-dump.sh");
    // A prova do caso real: o que o `join` do win32 produziria tem de sair com `/`.
    expect(joinPosix(w32.join("gates", "commit-msg"))).toBe("gates/commit-msg");
    expect(posix(w32.join("memory", "agent", "git.md"))).toBe("memory/agent/git.md");
  });

  it("o lock sai identico ao do Linux (nenhuma chave com `\`)", async () => {
    const { tars, project, lock, base } = scaffold();
    await sync({ tars, project, log: () => {} });

    const keys = Object.keys(readLock(lock).files);
    expect(keys).toContain("gates/commit-msg");
    expect(keys.filter((k) => k.includes("\\"))).toEqual([]);
    // Drift falso: base intocada, segunda rodada nao acusa nada.
    const r = await sync({ tars, project, log: () => {} });
    expect(r.stale).toEqual([]);
    expect(r.wrote).toEqual([]);
    expect(treeOf(path.join(base, "gates"))).toEqual(["commit-msg", "commit-msg/GATE.md", "commit-msg/gate.mjs"]);
  });

  it("hookVivo: no win32 a testemunha e' o shebang (nao ha' bit no NTFS)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-hook-"));
    const com = path.join(dir, "com-shebang");
    const sem = path.join(dir, "sem-shebang");
    fs.writeFileSync(com, "#!/usr/bin/env sh\nexit 0\n", { mode: 0o644 });
    fs.writeFileSync(sem, "exit 0\n", { mode: 0o644 });

    expect(hookVivo(com, { win32: true })).toBe(true);
    expect(hookVivo(sem, { win32: true })).toBe(false);
    expect(hookVivo(path.join(dir, "nao-existe"), { win32: true })).toBe(false);
    // No POSIX a mesma testemunha e' o bit: 0644 nao executa.
    expect(hookVivo(sem, { win32: false })).toBe(false);
  });

  it("sync fecha com o hook do git no disco: `deadHooks` nao acusa hook morto por bit", async () => {
    const { tars, project } = scaffold();
    // O consumidor JA' usa hooks proprios (`.githooks/` existe) — condicao do sync escrever.
    fs.mkdirSync(path.join(project, ".githooks"), { recursive: true });
    const r = await sync({ tars, project, log: () => {} });

    const f = path.join(project, ".githooks", "pre-commit");
    expect(r.hooks).toContain(".githooks/pre-commit");
    expect(hookVivo(f)).toBe(true);
    expect(deadHooks(project, await readManifest(project))).toBeNull();
  });

  it("o corpo do hook procura nesta ordem: binario, PATH, fonte do catalogo, node do repo", () => {
    const b = hookBody("pre-commit");
    const home = b.indexOf("$tars_home/dist/tars");
    const path = b.indexOf("command -v tars");
    const catalogo = b.indexOf("node \"$tars_home/tools/framework/tars.mjs\"");
    const node = b.indexOf("node \"$root/tools/framework/tars.mjs\"");
    expect(home).toBeGreaterThan(-1);
    expect(path).toBeGreaterThan(home);
    expect(catalogo).toBeGreaterThan(path);
    expect(node).toBeGreaterThan(catalogo);
    expect(b.startsWith("#!/usr/bin/env sh")).toBe(true);
  });

  it("o hook sem motor FALHA ALTO nomeando os caminhos procurados", () => {
    const b = hookBody("pre-commit");
    const erro = b.split("\n").find((l) => l.startsWith("echo \"hook pre-commit"));
    // O caminho do catalogo e' o DEFAULT de `$TARS_HOME` (`/projects/tars`): citar a
    // variavel crua deixaria a mensagem vazia no caso que importa (variavel inexistente).
    expect(b).toContain('tars_home="${TARS_HOME:-/projects/tars}"');
    expect(erro).toContain("$tars_home/dist/tars");
    expect(erro).toContain("'tars' no PATH");
    expect(erro).toContain("$tars_home/tools/framework/tars.mjs");
    expect(erro).toContain("$root/tools/framework/tars.mjs");
    expect(b).toContain("exit 1");
  });

  it("a mensagem do hook NAO tem crase dentro de aspas duplas (o sh executaria `tars`)", () => {
    // Incident: crase dentro de `"..."` e' SUBSTITUICAO DE COMANDO — ao so' montar o texto
    // de erro, o `sh` rodava `tars`/`tars sync` e a mensagem saia errada (ou o hook, mudo).
    // A prova e' por hook, no corpo GERADO, e cobre tambem os 3 `.githooks/` versionados.
    for (const h of GIT_HOOKS) {
      const erro = hookBody(h)
        .split("\n")
        .find((l) => l.startsWith(`echo "hook ${h}`));
      expect(erro).toBeTruthy();
      const dentro = erro.slice(erro.indexOf('"') + 1, erro.lastIndexOf('"'));
      expect(dentro).not.toContain("`");
    }
    // Os arquivos versionados que EXISTEM sao o MESMO texto do gerador (senao o
    // `tars sync` os reescreveria a cada rodada): a raiz sai de `here`, nao do cwd.
    const githooks = path.join(here, "..", "..", ".githooks");
    for (const h of GIT_HOOKS) {
      const f = path.join(githooks, h);
      if (!fs.existsSync(f)) continue; // `pre-push` so' existe se declarado
      expect(fs.readFileSync(f, "utf8")).toBe(hookBody(h));
    }
  });
});

// ---------------------------------------------------------------------------
// O hook do catalogo NUNCA supoe o motor dentro do consumidor (incident 11/10).
// O consumidor so' tem o que o `tars sync` copiou: `.githooks/` e `.ai/`. O motor
// (`tools/framework/tars.mjs`) mora no CATALOGO — antes o hook o procurava em
// `$root` (a raiz do consumidor) e morria com exit 1 no primeiro commit. A prova
// roda o script de verdade, nao o texto.
// ---------------------------------------------------------------------------
describe("tars-sync — hook do catalogo roda em consumidor sem o motor (incident 11/10)", () => {
  const consumidor = () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "tars-hook-"));
    // Um consumidor de verdade tem `.ai/tars.toml` (e' o que o hook procura para achar o
    // projeto) e NAO tem `tools/framework/` — so' o que o sync copiou.
    fs.mkdirSync(path.join(raiz, ".ai"), { recursive: true });
    fs.writeFileSync(path.join(raiz, ".ai", "tars.toml"), "[tars]\nversion = \"v0.3\"\n");
    fs.writeFileSync(path.join(raiz, "prepare-commit-msg"), hookBody("prepare-commit-msg"));
    fs.writeFileSync(path.join(raiz, "msg.txt"), "chore: nada\n");
    return raiz;
  };

  it("fora do catalogo: acha o motor (no $TARS_HOME ou no catalogo de onde veio) e sai 0", () => {
    const raiz = consumidor();
    // A worktree do proprio Tars faz as vezes de `$TARS_HOME` (o consumidor node tem Node,
    // entao o motor aqui pode ser o `.mjs` do catalogo).
    const tarsHome = path.join(here, "..", "..");
    const r = spawnSync("sh", [path.join(raiz, "prepare-commit-msg"), path.join(raiz, "msg.txt")], {
      encoding: "utf8",
      env: { ...process.env, TARS_HOME: tarsHome },
      cwd: raiz,
    });
    expect(r.stderr).not.toContain("nao achei o motor");
    expect(r.status).toBe(0);
  });

  it("sem motor em lugar nenhum: exit != 0 e a mensagem cita os caminhos procurados", () => {
    const raiz = consumidor();
    const vazio = path.join(raiz, "sem-motor");
    fs.mkdirSync(vazio);
    const r = spawnSync("sh", [path.join(raiz, "prepare-commit-msg"), path.join(raiz, "msg.txt")], {
      encoding: "utf8",
      env: { ...process.env, TARS_HOME: vazio },
      cwd: raiz,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("nao achei o motor do Tars");
    // A mensagem NOMEIA o caminho: e' o que faz o dono achar o problema sem ler o script.
    expect(r.stderr).toContain(path.join(vazio, "tools", "framework", "tars.mjs"));
  });
});
