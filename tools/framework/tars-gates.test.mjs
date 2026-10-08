import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Testes dos GATES do catalogo (fatia 4) e da ponta CLI do motor. Cada gate e' um
// programa: prova-se pelo exit code e pela mensagem, com o payload/arquivo real — nao
// pela leitura do codigo. O gate `commit-msg` e' o unico que depende do app (mensagem de
// commit); `gitleaks` sai 0 avisando quando o binario falta; `no-add-all` julga o payload
// do PreToolUse.
// `new URL(...).pathname` no win32 devolve `/C:/...` — `fileURLToPath` e' o disco certo
// nas duas plataformas (mesma classe do incident de paridade).
const HERE = path.dirname(fileURLToPath(import.meta.url));
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
        "  origem: o contrato nasceu sem o campo de reset — ninguem escreveu quem zera\n" +
        "  hipoteses: o log lia a secao errada (descartada: apontava a certa)\n" +
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

  it("origem: REPROVA o bloco de licao sem ela (a causa raiz vem ANTES do sintoma)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  hipoteses: o log lia a secao errada (descartada: apontava a certa)\n" +
        "  correcao: tools/framework/tars-verify.mjs\n  propagacao: guard abc123\n",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/origem/i);
  });

  it("hipoteses: REPROVA o bloco de licao sem ela (o descarte tem de ficar registrado)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  origem: o contrato nasceu sem o campo de reset — ninguem escreveu quem zera\n" +
        "  correcao: tools/framework/tars-verify.mjs\n  propagacao: guard abc123\n",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/hipoteses/i);
  });

  it("hipoteses: aceita o bloco completo (7 campos, hipoteses entre origem e correcao)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  origem: o contrato nasceu sem o campo de reset — ninguem escreveu quem zera\n" +
        "  hipoteses: o log lia a secao errada (descartada: apontava a certa)\n" +
        "  correcao: tools/framework/tars-verify.mjs\n  propagacao: guard abc123\n",
    );
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/origem|hipoteses|propagacao/i);
  });

  it("origem: aceita o bloco completo (6 campos, origem antes de propagacao)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  origem: o contrato nasceu sem o campo de reset — ninguem escreveu quem zera\n" +
        "  hipoteses: o log lia a secao errada (descartada: apontava a certa)\n" +
        "  correcao: tools/framework/tars-verify.mjs\n  propagacao: guard abc123\n",
    );
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/origem|propagacao/i);
  });

  it("origem: licao em 1 linha (legado) so' AVISA — nao quebra o historico", () => {
    const r = valida("✨ feat(hub): encurta o motor\n\nLesson: o parser acumulava na secao errada\n");
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/origem/i);
    expect(r.stderr).toMatch(/hipoteses/i);
  });

  it("propagacao ausente no bloco AVISA (nao quebra o historico)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  origem: o contrato nasceu sem o campo de reset — ninguem escreveu quem zera\n" +
        "  hipoteses: o log lia a secao errada (descartada: apontava a certa)\n" +
        "  correcao: tools/framework/tars-verify.mjs\n",
    );
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/propagacao/i);
  });

  it("propagacao: aceita o 5o campo no bloco (a camada que impede a classe de voltar)", () => {
    const r = valida(
      "✨ feat(hub): mexe no motor\n\nLesson:\n  erro: o acumulador da secao errada\n" +
        "  porque: o parser nunca zerava por item\n  causa raiz: o contrato nao exigia reset por item\n" +
        "  origem: o contrato nasceu sem o campo de reset — ninguem escreveu quem zera\n" +
        "  hipoteses: o log lia a secao errada (descartada: apontava a certa)\n" +
        "  correcao: tools/framework/tars-verify.mjs\n  propagacao: guard abc123\n",
    );
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/propagacao/i);
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
        "  origem: o adapter nunca teve o host como parametro explicito — veio do ambiente\n" +
        "  hipoteses: o env vinha do shell do hook (descartada: o hook nao exporta isso)\n" +
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

// TARS-RED-1: `fix:` sem tocar teste e' correcao sem prova. O gate le os caminhos staged
// no repo de TARS_PROJECT; a fixture monta um repo git minimo com o arquivo ja' em stage.
describe("gate commit-msg — teste vermelho no fix (TARS-RED-1)", () => {
  const gate = GATE("commit-msg", "gate.mjs");
  const FIX = "🐛 fix(hub): conserta o parser\n\nIncident:\n  erro: pipocava no host errado\n" +
    "  porque: o adapter lia o env do MCP\n  causa raiz: nao havia gate de origem de host\n" +
    "  origem: o adapter nunca teve o host como parametro explicito — veio do ambiente\n" +
    "  hipoteses: o env vinha do shell do hook (descartada: o hook nao exporta isso)\n" +
    "  correcao: tools/framework/tars-verify.mjs\n";

  /** Repo git minimo com `arquivos` em stage; devolve o dir. */
  const repoCom = (arquivos) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-red-"));
    const g = (a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
    g(["init", "-q"]); g(["config", "user.email", "t@t.local"]); g(["config", "user.name", "t"]);
    for (const f of arquivos) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), "x\n");
    }
    g(["add", "--", ...arquivos]);
    return dir;
  };
  const valida = (msg, dir) => {
    const f = path.join(dir, "COMMIT_EDITMSG");
    fs.writeFileSync(f, msg);
    return rodar([gate, f], { env: { TARS_PROJECT: dir } });
  };

  it("fix que NAO toca teste reprova (a correcao sem prova)", () => {
    const r = valida(FIX, repoCom(["tools/framework/tars-verify.mjs"]));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/TARS-RED-1|TESTE/);
  });

  it("fix que toca um *.test.mjs passa", () => {
    const r = valida(FIX, repoCom(["tools/framework/tars-verify.mjs", "tools/framework/tars-verify.test.mjs"]));
    expect(r.status).toBe(0);
  });

  it("fix que toca um test_*.py passa", () => {
    const r = valida(FIX, repoCom(["tools/framework/rename.py", "tools/framework/rename_test.py"]));
    expect(r.status).toBe(0);
  });

  it("fix so' de doc escapa com No-Test: <motivo>", () => {
    const r = valida(`${FIX}\nNo-Test: correcao de comentario em doc, sem codigo executavel afetado\n`, repoCom(["docs/X.md"]));
    expect(r.status).toBe(0);
  });

  it("No-Test curto NAO escapa (motivo >= 10 chars)", () => {
    const r = valida(`${FIX}\nNo-Test: typo\n`, repoCom(["docs/X.md"]));
    expect(r.status).not.toBe(0);
  });

  it("feat nao paga o teste vermelho (so' o fix)", () => {
    const r = valida("✨ feat(hub): mexe no motor\n\nLesson: o parser acumulava na secao errada\n", repoCom(["tools/framework/x.mjs"]));
    expect(r.status).toBe(0);
  });

  it("sem repo git nao julga (fixture isolada, nao falso-positivo)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-red-nogit-"));
    const f = path.join(dir, "COMMIT_EDITMSG");
    fs.writeFileSync(f, FIX);
    const r = rodar([gate, f], { env: { TARS_PROJECT: dir } });
    expect(r.status).toBe(0);
  });
});

// TARS-SWALLOW-1: erro engolido (`catch {}` / `except: pass`) esconde a falha. O gate le'
// os arquivos STAGED do TARS_PROJECT; a fixture monta um repo minimo com o arquivo em stage.
describe("gate lint-swallow — erro engolido (TARS-SWALLOW-1)", () => {
  const gate = GATE("lint-swallow", "gate.mjs");
  const repoCom = (nome, conteudo) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-swallow-"));
    const g = (a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
    g(["init", "-q"]); g(["config", "user.email", "t@t.local"]); g(["config", "user.name", "t"]);
    const p = path.join(dir, nome);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, conteudo);
    g(["add", "--", nome]);
    return dir;
  };
  const roda = (dir, params) => rodar([gate], { env: { TARS_PROJECT: dir, TARS_GATE_PARAMS: params ?? "" } });

  it("`catch {}` vazio no staged reprova com arquivo:linha", () => {
    const r = roda(repoCom("src/a.mjs", "try { f() } catch {}\n"));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/src\/a\.mjs:1/);
  });

  it("`catch (e) { /* nada */ }` de uma linha reprova", () => {
    const r = roda(repoCom("src/b.ts", "try { f() } catch (e) { /* ignora */ }\n"));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/src\/b\.ts:1/);
  });

  it("`except: pass` em Python reprova (uma linha e bloco), inclusive `except Exception:`", () => {
    expect(roda(repoCom("a.py", "try:\n    f()\nexcept: pass\n")).status).toBe(1);
    const r = roda(repoCom("b.py", "try:\n    f()\nexcept Exception:\n    pass\n"));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/b\.py:3/);
  });

  it("arquivo limpo passa (catch que trata e except que propaga)", () => {
    expect(roda(repoCom("src/ok.mjs", "try { f() } catch (e) { log(e); throw e }\n")).status).toBe(0);
    expect(roda(repoCom("ok.py", "try:\n    f()\nexcept ValueError as e:\n    raise\n")).status).toBe(0);
  });

  it("comentario com `except: pass` NAO reprova (o codigo e' que conta)", () => {
    expect(roda(repoCom("c.py", "# nunca use except: pass aqui\nx = 1\n")).status).toBe(0);
  });

  it("allow isenta o trecho declarado nos params", () => {
    const dir = repoCom("vendor/lib.mjs", "try { f() } catch {}\n");
    expect(roda(dir, JSON.stringify({ allow: ["vendor/"] })).status).toBe(0);
    expect(roda(dir, "").status).toBe(1);
  });

  it("sem repo git nao julga (fixture isolada, nao falso-positivo)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-swallow-nogit-"));
    fs.writeFileSync(path.join(dir, "a.mjs"), "try { f() } catch {}\n");
    expect(roda(dir).status).toBe(0);
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

describe("gate release-guard", () => {
  const gate = GATE("release-guard", "gate.mjs");
  const V = "0.0.1-dev.6";

  // Repo de fixture com commit: o gate compara `.ai/VERSION` do worktree com o HEAD.
  // `staged` (arquivos do commit) e' injetado pelo proprio `julgar`; a ponta CLI le o git.
  function repo({ versaoHead = V, versaoAtual = V, arquivos = [], changelogStaged = false } = {}) {
    const dir = tmp();
    const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "ignore" });
    fs.mkdirSync(path.join(dir, ".ai"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".ai", "VERSION"), `${versaoHead}\n`);
    git("add", ".ai/VERSION");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    fs.writeFileSync(path.join(dir, ".ai", "VERSION"), `${versaoAtual}\n`);
    for (const a of arquivos) {
      fs.mkdirSync(path.dirname(path.join(dir, a)), { recursive: true });
      fs.writeFileSync(path.join(dir, a), "x\n");
      git("add", a);
    }
    if (changelogStaged) {
      fs.writeFileSync(path.join(dir, "CHANGELOG.md"), "## 0.0.1-dev.7\n");
      git("add", "CHANGELOG.md");
    }
    return dir;
  }

  const julgar = async (dir, mensagem = "") => {
    const mod = await import(path.join(HERE, "..", "..", ".ai", "gates", "release-guard", "gate.mjs"));
    return mod.julgar(dir, { mensagem });
  };

  it("REPROVA motor tocado sem subir versao nem CHANGELOG", () => {
    return julgar(repo({ arquivos: ["tools/framework/tars-sync.mjs"] })).then((r) => {
      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/VERSION|CHANGELOG/);
    });
  });

  it("REPROVA quando sobe a versao mas falta o CHANGELOG", () =>
    julgar(repo({ versaoAtual: "0.0.1-dev.7", arquivos: ["tools/framework/tars-sync.mjs"] })).then((r) =>
      expect(r.ok).toBe(false),
    ));

  it("APROVA versao + CHANGELOG juntos", () =>
    julgar(repo({ versaoAtual: "0.0.1-dev.7", arquivos: ["tools/framework/tars-sync.mjs", ".ai/VERSION"], changelogStaged: true })).then(
      (r) => expect(r.ok).toBe(true),
    ));

  it("APROVA `No-Release: <motivo>` no corpo", () =>
    julgar(repo({ arquivos: [".ai/guards/lib-json.sh"] }), "chore: ajuste\n\nNo-Release: regeneracao de indice\n").then((r) =>
      expect(r.ok).toBe(true),
    ));

  it("APROVA commit que nao toca o motor do Tars", () =>
    julgar(repo({ arquivos: ["docs/x.md"] })).then((r) => expect(r.ok).toBe(true)));

  it("REPROVA pela ponta CLI (exit 1) e passa com No-Release no COMMIT_EDITMSG", () => {
    const dir = repo({ arquivos: ["tools/framework/tars-sync.mjs"] });
    const r = rodar([gate], { env: { TARS_PROJECT: dir } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/RELEASE GUARD/);
    fs.writeFileSync(path.join(dir, ".git", "COMMIT_EDITMSG"), "chore: x\n\nNo-Release: regeneracao de indice\n");
    expect(rodar([gate], { env: { TARS_PROJECT: dir } }).status).toBe(0);
  });
});
