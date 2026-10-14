// Testes do gate fail-closed (B2.3), fatia 2b. Prova-se pelo EXIT CODE e pela mensagem,
// com arquivo e repo reais — nao pela leitura do codigo. O par obrigatorio: positivo
// (aprovacao NOMEADA passa) e negativo (aprovacao CALADA reprova).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { julgaArquivo, julgaIf } from "../../.ai/gates/fail-closed/gate.mjs";

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".ai", "gates", "fail-closed", "gate.mjs");

/** Repo minimo com os arquivos dados, ja' staged (o gate julga o STAGED). */
function repo(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-fc-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  for (const [nome, corpo] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, nome), corpo);
  spawnSync("git", ["add", "--", ...Object.keys(arquivos)], { cwd: dir });
  return dir;
}

const rodar = (dir) => {
  const ambiente = { ...process.env, TARS_PROJECT: dir };
  const r = spawnSync(process.execPath, [GATE], { encoding: "utf8", env: ambiente });
  return { status: r.status, stderr: r.stderr };
};

describe("julgaIf — a forma do defeito", () => {
  it("reprova a aprovacao CALADA (o incidente do kipp)", () => {
    expect(julgaIf({ test: {}, consequent: ret(obj({ ok: true })) })).toBe("aprova-sem-motivo");
  });
  it("reprova a isencao SEM nomear (ok: true com valor neutro)", () => {
    expect(julgaIf({ test: {}, consequent: ret(obj({ ok: true, versao: 3 })) })).toBe("aprova-sem-motivo");
  });
  it("aceita a aprovacao que NOMEIA o motivo", () => {
    expect(julgaIf({ test: {}, consequent: ret(obj({ ok: false, motivo: "registro ausente" })) })).toBeNull();
  });
  it("aceita a isencao nomeada", () => {
    expect(julgaIf({ test: {}, consequent: ret(obj({ ok: true, motivo: "sem registro a checar" })) })).toBeNull();
  });
  it("nao desce no else if (decidiria a arvore inteira)", () => {
    expect(julgaIf({ test: {}, consequent: ret(obj({ ok: true })), alternate: { type: "IfStatement" } })).toBeNull();
  });
});

describe("gate fail-closed — o par positivo/negativo, com repo real", () => {
  it("NEGATIVO: aprovacao calada no staged REPROVA com arquivo:linha", () => {
    const dir = repo({ "ruim.mjs": "export function checa(t) {\n  if (!t) return { ok: true }\n  return { ok: false, motivo: 'x' }\n}\n" });
    const r = rodar(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/ruim\.mjs:2/);
    expect(r.stderr).toMatch(/fail-closed/i);
  });

  it("POSITIVO: aprovacao nomeada passa", () => {
    const dir = repo({ "bom.mjs": "export function checa(t) {\n  if (!t) return { ok: false, motivo: 'trava ausente' }\n  return { ok: true }\n}\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("POSITIVO: a isencao NOMEADA passa (ok: true com motivo)", () => {
    const dir = repo({ "bom2.mjs": "export function checa(a) {\n  if (a == null) return { ok: true, motivo: 'sem registro nesta versao' }\n  return { ok: a.x > 0 }\n}\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("nao confunde comentario nem string (o julgamento e da ARVORE)", () => {
    const dir = repo({ "alheio.mjs": "const s = \"if (y) return { ok: true }\"\n// if (z) return { ok: true }\n" });
    expect(rodar(dir).status).toBe(0);
  });

  it("julga o STAGED, nao a arvore inteira (arquivo nao staged nao conta)", () => {
    const dir = repo({ "bom.mjs": "export const x = 1\n" });
    fs.writeFileSync(path.join(dir, "solto.mjs"), "export function f(t) {\n  if (!t) return { ok: true }\n}\n");
    expect(rodar(dir).status).toBe(0);
  });
});

describe("julgaArquivo — o que nao e julgado e DITO", () => {
  it("sintaxe quebrada devolve null (o chamador grita, nao passa calado)", () => {
    expect(julgaArquivo("quebrado.mjs", "function ( { }))")).toBeNull();
  });
  it("arquivo limpo devolve lista vazia (nao null)", () => {
    expect(julgaArquivo("ok.mjs", "export const x = 1\n")).toEqual([]);
  });
});

/** Construtor minimo de no ESTree para o teste da forma: { ok: <lit> }. */
function obj(props) {
  return {
    type: "ObjectExpression",
    properties: Object.entries(props).map(([k, v]) => ({ type: "Property", key: { type: "Identifier", name: k }, value: { type: "Literal", value: v } })),
  };
}
function ret(argument) {
  return { type: "ReturnStatement", argument };
}
