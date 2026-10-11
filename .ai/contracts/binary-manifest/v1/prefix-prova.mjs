// PROVA do D7 contra um Postgres de verdade. Roda SOB `task secrets:load --` (a senha do admin vem
// do cache cifrado; este script nunca le `.env`). Cria um BANCO descartavel com nome por PID, aplica
// o prefixo em parte dos objetos, roda a conformidade, e limpa o que ele mesmo criou.
//
// Nao e' teste automatico (o `prefix-conformance.test.mjs` cobre a funcao); e o caso literal de
// aceite do K0: 1 tabela com prefixo (passa) e 1 sem (reprova), com a saida impressa.
import pg from "/workspace/tools/framework/db/node_modules/pg/lib/index.js";
import { conformaPrefixo, resumeConformidade } from "./prefix-conformance.mjs";

const cfg = {
  host: process.env.DB_HOST || "host.docker.internal",
  port: Number(process.env.DB_PORT || 47003),
  user: "segtools",
  password: process.env.DB_ADMIN_PASSWORD,
  database: "postgres",
};
const nomeDb = `k0prova_${process.pid.toString(36)}`;
const prefix = "kipp_";

const admin = new pg.Client(cfg);
await admin.connect();
await admin.query(`CREATE DATABASE ${nomeDb}`);
await admin.end();

const c = new pg.Client({ ...cfg, database: nomeDb });
await c.connect();
await c.query(`CREATE TABLE ${prefix}tarefa (id int)`);
await c.query(`CREATE INDEX ${prefix}idx_tarefa ON ${prefix}tarefa (id)`);
await c.query(`CREATE SEQUENCE ${prefix}seq_tarefa`);
await c.query(`CREATE TABLE forasteira (id int)`);

console.log(`=== caso A: existe 1 tabela SEM o prefixo "${prefix}" (forasteira) ===`);
console.log(resumeConformidade(prefix, await conformaPrefixo({ client: c, prefix })));

await c.query("DROP TABLE forasteira");
console.log(`\n=== caso B: removida a tabela sem prefixo ===`);
const ok = await conformaPrefixo({ client: c, prefix });
console.log(resumeConformidade(prefix, ok));
console.log(`objetos vistos: ${JSON.stringify(ok.objetos)}`);

// Limpeza: fecha a conexao do banco antes de derrubar o banco (nao se derruba banco aberto).
await c.end();
const admin2 = new pg.Client(cfg);
await admin2.connect();
await admin2.query(`DROP DATABASE ${nomeDb} WITH (FORCE)`);
await admin2.end();
process.exit(ok.ok ? 0 : 1);
