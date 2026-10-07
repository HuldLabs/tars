import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Testes dos GATES do catalogo (fatia 4) e da ponta CLI do motor. Cada gate e' um
// programa: prova-se pelo exit code e pela mensagem, com o payload/arquivo real — nao
// pela leitura do codigo. O gate `commit-msg` e' o unico que depende do app (mensagem de
// commit); `gitleaks` sai 0 avisando quando o binario falta; `no-add-all` julga o payload
// do PreToolUse.
const HERE = path.dirname(new URL(import.meta.url).pathname);
const GATE = (nome, arquivo) => path.join(HERE, "..", "..", ".ai", "gates", nome, arquivo);

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tars-gate-"));

function rodar(argv, { input = "", env = {} } = {}) {
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", input, env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("gate commit-msg", () => {
  const gate = GATE("commit-msg", "gate.mjs");
  const valida = (msg) => {
    const dir = tmp();
    const f = path.join(dir, "COMMIT_EDITMSG");
    fs.writeFileSync(f, msg);
    return rodar([gate, f], { env: { TARS_PROJECT: dir } });
  };

  it("aceita <emoji> <type>(<scope>): <descr> com Lesson em feat", () => {
    const r = valida("✨ feat(hub): encurta o motor\n\nLesson: o parser acumulava na secao errada\n");
    expect(r.status).toBe(0);
  });

  it("recusa descricao fora do padrao", () => {
    const r = valida("sem emoji nem tipo\n");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/commit|formato|emoji|tipo/i);
  });

  it("recusa feat SEM Lesson/No-Lesson (INV-LESSON-1)", () => {
    const r = valida("✨ feat(hub): mexe no motor\n");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/licao|Lesson/i);
  });

  it("aceita Lesson em 4 campos (a licao que forca a causa)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  correcao: tools/framework/tars-verify.mjs\n",
    );
    expect(r.status).toBe(0);
  });

  it("recusa Lesson em 4 campos com 'causa raiz' == 'porque' (cave um nivel)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o parser nunca zerava por item\n" +
        "  correcao: tools/framework/tars-verify.mjs\n",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/causa raiz/);
  });

  it("Incident de fix exige os 4 campos (1 linha NAO basta)", () => {
    const r = valida("🐛 fix(hub): conserta o parser\n\nIncident: o parser acumulava na secao errada\n");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/4 campos|Incident/i);
  });

  it("aceita Incident de fix com os 4 campos", () => {
    const r = valida(
      "🐛 fix(hub): conserta o parser\n\nIncident:\n  erro: pipocava no host errado\n" +
        "  porque: o adapter lia o env do MCP\n  causa raiz: nao havia gate de origem de host\n" +
        "  correcao: .ai/gates/commit-msg/validate-commit.mjs\n",
    );
    expect(r.status).toBe(0);
  });

  it("sem o arquivo da mensagem reprova com a instrucao", () => {
    const r = rodar([gate], { env: { TARS_PROJECT: os.tmpdir() } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/arquivo da mensagem/);
  });
});

describe("gate gitleaks", () => {
  const gate = GATE("gitleaks", "gate.mjs");

  it("sem o binario avisa e passa (best-effort declarado)", () => {
    // PATH sem gitleaks: o gate nao pode virar um "pode commitar" silencioso.
    const r = rodar([gate], { env: { TARS_PROJECT: os.tmpdir(), PATH: "/nonexistent" } });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/binario ausente/i);
  });
});

describe("gate no-add-all", () => {
  const gate = GATE("no-add-all", "no-add-all.mjs");
  const payload = (command) =>
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

  it.each(["git add -A", "git add .", "git add --all", "git add -f .cache/x", "git commit -a"])(
    "barra %s com exit 2 (o harness le' isso)",
    (cmd) => {
      const r = rodar([gate], { input: payload(cmd) });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/ADD AMPLO BARRADO/);
    },
  );

  it.each(["git add -- src/a.ts", "git commit -F msg -- src/a.ts", "git status", "ls -la"])(
    "deixa passar %s",
    (cmd) => {
      const r = rodar([gate], { input: payload(cmd) });
      expect(r.status).toBe(0);
    },
  );

  it("falha ABERTA em payload vazio/roto", () => {
    expect(rodar([gate], { input: "" }).status).toBe(0);
    expect(rodar([gate], { input: "{nao-e-json" }).status).toBe(0);
  });
});
