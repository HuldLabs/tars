import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { alheios, claudeSettings, isCatalog } from "./tars-sync.mjs";

// SYNC-PRE-TOOL (14/10): o sync reescrevia o PreToolUse inteiro e derrubava o `prod-guard`
// posto a mao. Ele so' e' dono do comando que gera; o resto fica.
const PROD = 'node "$CLAUDE_PROJECT_DIR/.ai/gates/prod-guard/gate.mjs"';
const VELHO = 'bash "$CLAUDE_PROJECT_DIR/.ai/base/guards/saiu-do-catalogo.sh"';
const atual = {
  permissions: { allow: ["x"] },
  hooks: {
    PreToolUse: [
      { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: VELHO }] },
      { matcher: "Bash", hooks: [{ type: "command", command: PROD }] },
    ],
    Stop: [{ hooks: [{ type: "command", command: "x" }] }],
  },
};

describe("posse do sync no settings (SYNC-PRE-TOOL)", () => {
  it("preserva hook de outro dono e derruba guard do sync que saiu", () => {
    const s = claudeSettings({}, null, atual);
    const cmds = s.hooks.PreToolUse.flatMap((e) => e.hooks.map((h) => h.command));
    expect(cmds).toContain(PROD);
    expect(cmds).not.toContain(VELHO);
    expect(s.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command === PROD)).matcher).toBe("Bash");
    expect(s.hooks.Stop.flatMap((e) => e.hooks.map((h) => h.command))).toContain("x");
    expect(s.permissions).toEqual(atual.permissions);
  });

  it("idempotente: rodar sobre a propria saida nao muda nada", () => {
    const um = claudeSettings({}, null, atual);
    expect(claudeSettings({}, null, um)).toEqual(um);
  });

  it("alheios ignora so' o comando gerado pelo sync", () => {
    expect(alheios(atual.hooks.PreToolUse)).toEqual([{ matcher: "Bash", hooks: [{ type: "command", command: PROD }] }]);
    expect(alheios(undefined)).toEqual([]);
  });
});

describe("isCatalog (TARS-SELF-1)", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tars-cat-"));
  const put = (d, rel) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), "x"); };

  it("checkout do catalogo (VERSION + motor) e' catalogo", () => {
    const d = tmp(); put(d, ".ai/VERSION"); put(d, "tools/framework/tars-sync.mjs");
    expect(isCatalog(d)).toBe(true);
  });

  it("consumidor que versiona o proprio .ai/ (segtools) nao e'", () => {
    const d = tmp(); put(d, ".ai/VERSION");
    expect(isCatalog(d)).toBe(false);
  });
});

describe("Stop gerado pelo sync (STOP-WIRING)", () => {
  // segtools 14/10: ninguem gerava o Stop; o posto a mao ficava na copia velha de `.ai/guards/`.
  const STOP = (rel) => `bash "$CLAUDE_PROJECT_DIR/${rel}/stop-unfinished-work.sh"`;
  const projeto = (onde) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "tars-stop-"));
    fs.mkdirSync(path.join(d, onde), { recursive: true });
    fs.writeFileSync(path.join(d, onde, "stop-unfinished-work.sh"), "exit 0\n");
    return d;
  };

  it("consumidor: Stop aponta a base; o velho de `.ai/guards/` sai e o alheio fica", () => {
    const d = projeto(".ai/base/guards");
    const atual = { hooks: { Stop: [{ hooks: [{ type: "command", command: STOP(".ai/guards") }, { type: "command", command: "echo meu" }] }] } };
    const s = claudeSettings({}, d, atual);
    expect(s.hooks.Stop.flatMap((e) => e.hooks.map((h) => h.command))).toEqual([STOP(".ai/base/guards"), "echo meu"]);
    expect(s.hooks.Stop[0]).not.toHaveProperty("matcher");
    expect(claudeSettings({}, d, s)).toEqual(s);
  });

  it("sem o arquivo, nenhum Stop gerado (nao aponta para o que nao existe)", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "tars-stop-"));
    expect(claudeSettings({}, d, null).hooks.Stop).toEqual([]);
  });
});
