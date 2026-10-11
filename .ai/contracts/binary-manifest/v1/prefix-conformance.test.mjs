import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conformaPrefixo, conformaPrefixoDeNomes, listaObjetos, resumeConformidade } from "./prefix-conformance.mjs";

// O contrato do D7 e' DADO; a prova de que ele pega o caso real precisa de um Postgres de verdade —
// o catalogo nao depende de SGBD (R3): o teste PULA com aviso alto quando nao ha' banco alcancavel e
// o par unitario (sobre a lista de nomes) segue cobrindo a funcao. Do jeito que o repo entrega a DSN
// de teste: `tc` do pacote do proprio tars, senao `DATABASE_URL` do ambiente (a DSN nunca vem de `.env`).

/** Pacote `pg` instalado no proprio Tars (se houver) ou o do repo de dev; ausente = pula. */
async function carregaPg() {
  for (const spec of ["pg", join(process.cwd(), "node_modules", "pg", "lib", "index.js")]) {
    try {
      return (await import(spec)).default;
    } catch {
      /* tenta o proximo */
    }
  }
  return null;
}

/** DSN de teste: o `DATABASE_URL` do ambiente, senao a MESMA config do `test-db.mjs` do repo. */
async function dsnDeTeste(pg) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const rel of [
    "../../../tools/framework/db/test-db.mjs", // relativo ao repo de dev (quando o tars mora dentro dele)
    "tools/framework/db/test-db.mjs", // cwd = raiz do repo de dev
  ]) {
    try {
      const { dbConfig } = await import(rel);
      const c = await dbConfig();
      const auth = c.password ? `${c.user}:${encodeURIComponent(c.password)}` : "segtools";
      const host = c.host.includes(":") ? `[${c.host}]` : c.host;
      return `postgres://${auth}@${host}:${c.port}/postgres`;
    } catch {
      /* tenta o proximo */
    }
  }
  return null;
}

let client = null;
let prefix = null;
let recusa = null;

beforeAll(async () => {
  const pg = await carregaPg();
  if (!pg) {
    recusa = "sem o pacote `pg` (nem no Tars, nem no repo de dev)";
    return;
  }
  const dsn = await dsnDeTeste(pg);
  if (!dsn) {
    recusa = "sem DSN de teste (nem DATABASE_URL, nem a config do test-db.mjs)";
    return;
  }
  // Banco descartavel: o teste cria um schema proprio e some com ele — nada do projeto e' tocado.
  try {
    client = new pg.Client({ connectionString: dsn });
    await client.connect();
  } catch (e) {
    client = null;
    recusa = `Postgres inacessivel pela DSN entregue (${e.message})`;
    return;
  }
  prefix = `k0c${process.pid.toString(36)}_`;
  await client.query(`CREATE SCHEMA ${prefix}w`);
  await client.query(`CREATE TABLE ${prefix}w.${prefix}tarefa (id int)`);
  await client.query(`CREATE INDEX ${prefix}idx_tarefa ON ${prefix}w.${prefix}tarefa (id)`);
  await client.query(`CREATE SEQUENCE ${prefix}w.${prefix}seq_tarefa`);
  await client.query(`CREATE TABLE ${prefix}w.forasteira (id int)`); // SEM prefixo: o defeito que o teste caça
});

afterAll(async () => {
  if (client) {
    await client.query(`DROP SCHEMA IF EXISTS ${prefix}w CASCADE`);
    await client.end();
  }
});

describe("prefixo D7 — funcao reutilizavel sobre uma lista de nomes (sem SGBD)", () => {
  it("aceita a lista toda com o prefixo", () => {
    expect(conformaPrefixoDeNomes(["kipp_tarefa", "kipp_idx_tarefa", "kipp_seq"], "kipp_")).toEqual({ faltando: [], ok: true });
  });
  it("reprova o objeto sem o prefixo, nomeando-o", () => {
    const r = conformaPrefixoDeNomes(["kipp_tarefa", "forasteira"], "kipp_");
    expect(r.ok).toBe(false);
    expect(r.faltando).toEqual(["forasteira"]);
  });
  it("prefixo malformado FALHA ALTO (nao devolve 'passou' por omissao)", () => {
    expect(() => conformaPrefixoDeNomes(["x"], "kipp")).toThrow(/prefixo invalido/);
  });
});

describe("prefixo D7 — contra o Postgres de teste (funcao reutilizavel)", () => {
  it("lista os objetos do schema por categoria", async () => {
    if (!client) return expect(recusa).toBeTruthy() && console.warn(`[skip] ${recusa}`);
    const objetos = await listaObjetos(client, { schema: `${prefix}w` });
    const nomes = objetos.map((o) => o.nome);
    expect(nomes).toContain(`${prefix}tarefa`);
    expect(nomes).toContain(`${prefix}seq_tarefa`);
    expect(nomes).toContain("forasteira");
    expect(objetos.find((o) => o.nome === `${prefix}tarefa`).kind).toBe("tabela");
  });

  it("REPROVA quando um objeto saiu sem o prefixo (e nomeia qual)", async () => {
    if (!client) return expect(recusa).toBeTruthy() && console.warn(`[skip] ${recusa}`);
    const r = await conformaPrefixo({ client, prefix, schema: `${prefix}w` });
    expect(r.ok).toBe(false);
    expect(r.faltando.map((o) => o.nome)).toEqual(["forasteira"]);
    expect(resumeConformidade(prefix, r)).toContain("REPROVA");
    expect(resumeConformidade(prefix, r)).toContain("forasteira");
  });

  it("PASSA quando o schema esta' limpo (so' objetos com prefixo)", async () => {
    if (!client) return expect(recusa).toBeTruthy() && console.warn(`[skip] ${recusa}`);
    await client.query(`DROP TABLE ${prefix}w.forasteira`);
    const r = await conformaPrefixo({ client, prefix, schema: `${prefix}w` });
    expect(r.ok).toBe(true);
    expect(resumeConformidade(prefix, r)).toContain("ok —");
  });
});
