// Testes do gate no-foreign-runtime (B1.5). Prova-se pelo EXIT CODE e pela mensagem, com
// arquivo e repo REAIS — nao pela leitura do codigo. O par obrigatorio: positivo (regra que
// so' fala Node passa; runtime DECLARADO no manifesto passa; escape nomeado passa) e negativo
// (skill copiada que manda `python3 x.py` REPROVA com arquivo:linha).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { julgaTexto, runtimesDeclarados } from "../../.ai/gates/no-foreign-runtime/gate.mjs";

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".ai", "gates", "no-foreign-runtime", "gate.mjs");

/** Repo minimo com os arquivos dados, ja' staged (o gate julga o STAGED). */
function repo(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-nfr-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  for (const [nome, corpo] of Object.entries(arquivos)) {
    const alvo = path.join(dir, nome);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, corpo);
  }
  spawnSync("git", ["add", "--", ...Object.keys(arquivos)], { cwd: dir });
  return dir;
}

const rodar = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { encoding: "utf8", env: { ...process.env, TARS_PROJECT: dir } });
  return { status: r.status, stderr: r.stderr };
};

describe("julgaTexto — a forma do defeito", () => {
  it("reprova o runtime estrangeiro invocado", () => {
    expect(julgaTexto("a.md", "rode `python3 coleta.py --dia 1`")).toEqual(["a.md:1 — python"]);
  });
  it("reprova pip/poetry/pytest (a familia toda)", () => {
    expect(julgaTexto("a.md", "pip install requests")).toEqual(["a.md:1 — python"]);
    expect(julgaTexto("a.md", "pytest -q tests/")).toEqual(["a.md:1 — python"]);
  });
  it("reprova pwsh, ruby, php, perl", () => {
    expect(julgaTexto("a.md", "pwsh -File setup.ps1")[0]).toMatch(/powershell/);
    expect(julgaTexto("a.md", "bundle exec rake x")[0]).toMatch(/ruby/);
    expect(julgaTexto("a.md", "composer install")[0]).toMatch(/php/);
    expect(julgaTexto("a.md", "perl -e 'print 1'")[0]).toMatch(/perl/);
  });
  it("nao confunde prosa, identificador nem URL (o alvo e' o COMANDO)", () => {
    expect(julgaTexto("a.md", "o perfil de python do projeto")).toEqual([]);
    expect(julgaTexto("a.md", "veja cpython e o arquivo nosso.py")).toEqual([]);
    expect(julgaTexto("a.md", "baixe em https://exemplo.dev/downloads")).toEqual([]);
    expect(julgaTexto("a.md", "rode `bun test` e `node gate.mjs`")).toEqual([]);
  });
  it("a linha com o escape NOMEADO passa", () => {
    expect(julgaTexto("a.md", "python3 x.py  <!-- tars:runtime-ok — legado do cliente -->")).toEqual([]);
  });
  it("o escape sem motivo NAO passa (isencao calada)", () => {
    expect(julgaTexto("a.md", "python3 x.py tars:runtime-ok")).toHaveLength(1);
  });
  it("o bloco `tars:nao-copia` passa inteiro", () => {
    const texto = "```tars:nao-copia\npython3 adapte.py\npip install x\n```\nrode `node y.mjs`\n";
    expect(julgaTexto("a.md", texto)).toEqual([]);
  });
});

describe("runtimesDeclarados — o manifesto e' a prova", () => {
  it("le a lista do tars.toml", () => {
    expect(runtimesDeclarados('runtimes = ["python", "ruby"]\n')).toEqual(["python", "ruby"]);
  });
  it("sem a chave, nada declarado", () => {
    expect(runtimesDeclarados("[tars]\nversion = 'x'\n")).toEqual([]);
  });
});

describe("gate no-foreign-runtime — o par positivo/negativo, com repo real", () => {
  it("NEGATIVO: skill copiada com python REPROVA com arquivo:linha", () => {
    const dir = repo({ ".ai/skills/coleta/SKILL.md": "# coleta\n\nRode `python3 coleta.py`.\n" });
    const r = rodar(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/\.ai\/skills\/coleta\/SKILL\.md:3/);
    expect(r.stderr).toMatch(/no-foreign-runtime/i);
  });

  it("POSITIVO: skill que so' fala Node passa", () => {
    const dir = repo({ ".ai/skills/coleta/SKILL.md": "# coleta\n\nRode `node coleta.mjs` e `bun test`.\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("POSITIVO: o MESMO python passa quando o consumidor DECLARA o runtime", () => {
    const dir = repo({
      ".ai/skills/coleta/SKILL.md": "# coleta\n\nRode `python3 coleta.py`.\n",
      ".ai/tars.toml": '[tars]\nversion = "x"\nruntimes = ["python"]\n',
    });
    expect(rodar(dir).status).toBe(0);
  });

  it("POSITIVO: o MESMO python passa com o escape nomeado na linha", () => {
    const dir = repo({ ".ai/rules/x.md": "python3 legado.py  <!-- tars:runtime-ok — script do cliente -->\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("o MOTOR (tools/) nao e' cobrado — o Tars e' do dono", () => {
    const dir = repo({ "tools/cliente/probe.py": "import sys\nprint(sys.argv)\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("o que o sync JOGA FORA (docs/) nao e' cobrado", () => {
    const dir = repo({ "docs/estudo.md": "rode `python3 analisa.py`\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("julga o STAGED, nao a arvore inteira (arquivo nao staged nao conta)", () => {
    const dir = repo({ "README.md": "nada\n" });
    fs.mkdirSync(path.join(dir, ".ai/skills/x"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".ai/skills/x/SKILL.md"), "python3 solto.py\n");
    expect(rodar(dir).status).toBe(0);
  });

  it("sem git no TARS_PROJECT, o gate REPROVA dizendo que nao julgou (fail-closed)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-nfr-nogit-"));
    const r = rodar(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/NAO julguei/i);
  });
});
