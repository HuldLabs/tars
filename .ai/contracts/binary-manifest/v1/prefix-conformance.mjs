#!/usr/bin/env node
// CONFORMIDADE DE PREFIXO (ADR-0002 D7): dado um cliente de SGBD e um prefixo, lista os objetos do
// schema e reprova qualquer um SEM o prefixo. Vale para TUDO o que o binario cria — tabelas, indices,
// sequencias, views, matviews, tipos, constraints E a tabela de controle de migrations.
//
// POR QUE EXISTE: o prefixo isola o binario quando ele compartilha o SGBD do hospedeiro (D7). O
// schema do Postgres nao existe em todo SGBD (SQLite; MySQL, onde schema = database) e nao protege
// quando alguem instala tudo no mesmo schema — o prefixo protege. As migrations recebem o prefixo
// como PARAMETRO (nunca nome fixo no SQL) e este teste e' a prova: sobe o binario com prefixo e
// confere que nenhum objeto saiu sem ele.
//
// O DOMINIO DO SGBD NAO CONTA: `pg_catalog`/`information_schema` sao do Postgres, nunca do binario —
// a lista de namespaces ignorados e' explicita abaixo, nao um "comeca com pg_" implicito.
export const SCHEMAS_DE_SISTEMA = ["pg_catalog", "information_schema", "pg_toast", "pg_temp_1", "pg_toast_temp_1"];

/** Os tipos de objeto que o binario cria e que a conformidade cobre (D7). */
const CATEGORIAS = ["tabela", "indice", "sequencia", "view", "matview", "tipo", "constraint"];

const SQL = `
WITH ns AS (SELECT oid, nspname FROM pg_namespace WHERE nspname = ANY($1)),
rel AS (
  SELECT c.relname AS nome, n.nspname AS schema, c.relkind
  FROM pg_class c JOIN ns n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','i','S','v','m')  -- tabela, particionada, indice, sequencia, view, matview
),
con AS (
  SELECT co.conname AS nome, n.nspname AS schema
  FROM pg_constraint co JOIN ns n ON n.oid = co.connamespace
),
ty AS (
  SELECT t.typname AS nome, n.nspname AS schema
  FROM pg_type t JOIN ns n ON n.oid = t.typnamespace
  WHERE t.typtype IN ('e','d','c','r')          -- enum, dominio, composto, range (o vetor de base nao conta)
    AND t.typname NOT LIKE '\\_%'
)
SELECT 'tabela' AS kind, nome, schema FROM rel WHERE relkind IN ('r','p')
UNION ALL SELECT 'indice', nome, schema FROM rel WHERE relkind = 'i'
UNION ALL SELECT 'sequencia', nome, schema FROM rel WHERE relkind = 'S'
UNION ALL SELECT 'view', nome, schema FROM rel WHERE relkind = 'v'
UNION ALL SELECT 'matview', nome, schema FROM rel WHERE relkind = 'm'
UNION ALL SELECT 'constraint', nome, schema FROM con
UNION ALL SELECT 'tipo', nome, schema FROM ty
ORDER BY schema, kind, nome
`;

/**
 * Lista os objetos do(s) schema(s) dados, por categoria. O `client` e' qualquer coisa com
 * `query(sql, params)` (o `pg.Client` do repo serve; um duble tambem, para o teste unitario).
 */
export async function listaObjetos(client, { schema = "public", schemas } = {}) {
  const alvos = schemas ?? [schema];
  const { rows } = await client.query(SQL, [alvos]);
  return rows.map((r) => ({ kind: r.kind, nome: r.nome, schema: r.schema }));
}

/**
 * A FUNCAO REUTILIZAVEL do D7. Dado o cliente e o prefixo (`"kipp_"`), devolve os objetos SEM o
 * prefixo — tabelas, indices, sequencias, views, matviews, tipos, constraints e a tabela de
 * controle de migrations (que casa por `nome LIKE prefixo + '%'`, como qualquer outra).
 *
 * Devolve `{ faltando, objetos, ok }`: `faltando` e a lista de `{ kind, nome, schema }` que reprova;
 * `ok` (bool) e o veredito. Falha alta (R4) em DSN/prefixo faltando — nunca um "passou" por omissao.
 */
export async function conformaPrefixo({ client, prefix, schema = "public", schemas } = {}) {
  if (!client || typeof client.query !== "function") throw new Error("conformaPrefixo: falta um `client` com `query(sql, params)` (DSN)");
  if (typeof prefix !== "string" || !/^[a-z][a-z0-9_]*_$/.test(prefix)) {
    throw new Error(`conformaPrefixo: prefixo invalido ${JSON.stringify(prefix)} — espere 'produto_' (minusculas, digitos, _, com '_' final)`);
  }
  const objetos = await listaObjetos(client, { schema, schemas });
  const faltando = objetos.filter((o) => !o.nome.startsWith(prefix));
  return { faltando, objetos, ok: faltando.length === 0 };
}

/** Julga uma LISTA de nomes — o mesmo veredito do `conformaPrefixo`, sem SGBD (teste unitario). */
export function conformaPrefixoDeNomes(nomes, prefix) {
  if (typeof prefix !== "string" || !/^[a-z][a-z0-9_]*_$/.test(prefix)) {
    throw new Error(`conformaPrefixoDeNomes: prefixo invalido ${JSON.stringify(prefix)}`);
  }
  const faltando = nomes.filter((nome) => !String(nome).startsWith(prefix));
  return { faltando, ok: faltando.length === 0 };
}

/** Prosa do veredito, para o CLI e o teste citarem a MESMA frase (R3). */
export function resumeConformidade(prefix, { faltando, objetos }) {
  if (!faltando.length) return `ok — ${objetos.length} objeto(s), todos com o prefixo "${prefix}"`;
  const linhas = faltando.map((o) => `  ${o.kind} ${o.schema}.${o.nome}`);
  return `REPROVA — ${faltando.length} de ${objetos.length} objeto(s) SEM o prefixo "${prefix}":\n${linhas.join("\n")}`;
}

// CLI — `DATABASE_URL=... node prefix-conformance.mjs <prefixo> [schema]`. A DSN vem do ambiente
// (o binario recebe a conexao do ambiente, D7); NUNCA de um `.env` lido aqui.
const isMain = process.argv[1] && process.argv[1].endsWith("prefix-conformance.mjs");
if (isMain) {
  const [prefix, schema = "public"] = process.argv.slice(2);
  const dsn = process.env.DATABASE_URL;
  if (!dsn || !prefix) {
    console.error("uso: DATABASE_URL=<dsn> node prefix-conformance.mjs <prefixo> [schema]");
    process.exit(2);
  }
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: dsn });
  await client.connect();
  try {
    const r = await conformaPrefixo({ client, prefix, schema });
    console.log(resumeConformidade(prefix, r));
    process.exit(r.ok ? 0 : 1);
  } finally {
    await client.end();
  }
}

export { CATEGORIAS };
