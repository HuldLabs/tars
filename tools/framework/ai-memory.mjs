// Valida a memoria operacional (.ai/memory/operational-memory.jsonl).
// TOOLING GLOBAL (fica em tools/, NAO sob hub/ — hub e o APP). Portado da ideia
// do contract test do Fabber (tests/contracts/test_ai_memory_schema.py), com o
// nosso schema REDUZIDO.
// Uso: node tools/framework/ai-memory.mjs --check   (gate; roda no pre-commit)
//      node tools/framework/ai-memory.mjs --check --file <arquivo.jsonl>
//      (o --file so aponta a LEITURA para um fixture — o pre-commit nao o passa,
//       entao a trava continua julgando o arquivo curado; serve para provar o AC-02
//       da SEG-5 sem tocar em `.ai/memory/operational-memory.jsonl`)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { findSecrets } from "./secrets-patterns.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.SHOW_REPO) process.stderr.write("REPO=" + REPO + " ARGV1=" + process.argv[1] + "\n");
const FILE = path.join(REPO, ".ai", "memory", "operational-memory.jsonl");
// SEG-862: o ledger de INCIDENTES (erro/recorrencia) tem schema proprio e mais curto.
export const LEDGER_FILE = path.join(REPO, ".ai", "memory", "incident-ledger.jsonl");
export const LEDGER_KEYS = ["id", "data", "titulo", "o_que", "causa", "correcao", "recorrencia", "fonte", "tags"];
// TARS-TAGS-1 (fatia F1): `classe`/`destino` ja' existiam; entram `prompt_rule` (o que
// vira linha no template do worker), `ambiente` (onde a licao vale) e `shell` (a faceta).
export const OPTIONAL_LEDGER_KEYS = ["source_id", "repo", "classe", "destino", "prompt_rule", "ambiente", "shell"];
// O doc dos campos e a outra metade do contrato: a lista de la tem de ser a MESMA de
// SCHEMA_KEYS. Antes da SEG-5 o doc listava `expires_at`/`supersedes_entry_id`/
// `promoted_from`, que este gate recusa — uma entrada documentada reprovava.
const SCHEMA_DOC = path.join(REPO, ".ai", "memory", "README.md");

export const SCHEMA_KEYS = [
  "id",
  "ts",
  "scope",
  "statement",
  "durability",
  "source_refs",
  "confidence",
  "validation_status",
];
// SOFON-MEM-1: o boot le SO' o INDEX; a memoria carrega sob demanda (o mapa em
// `.ai/memory/memory.index.json`). Opcionais, so' nas entradas federadas.
export const OPTIONAL_KEYS = ["source_id", "repo", "source", "tags", "ambiente", "shell"];

// ---- TARS-TAGS-1 (F1): vocabulario CONTROLADO de tags ---------------------------
// `.ai/memory/tags.toml` e' a lista FECHADA (SSOT): tag fora dela nao entra no ledger.
// Tag livre ja' produziu 373 vocabulos para 192 incidentes; sinônimo vira `aliases` do
// id existente. Micro-parser TOML do subconjunto que o arquivo usa (`[[tag]]`/`[[ambiente]]`
// /`[[shell]]`/`[[classe]]` com `id` + `aliases`): o repo nao tem dependencia TOML e a
// estrutura e' previsivel (R2 — nao puxar um parser inteiro para 4 chaves).
export const TAGS_FILE = path.join(REPO, ".ai", "memory", "tags.toml");

/** Le tags.toml -> { tags:[{id,aliases}], ambientes:[id], shells:[id], classes:[id] }. */
export function loadTags(file = TAGS_FILE) {
  const out = { tags: [], ambientes: [], shells: [], classes: [], alias: new Map(), file };
  if (!fs.existsSync(file)) return out;
  let secao = null;
  let atual = null;
  // Quebra uma linha em pares `chave=valor`, respeitando aspas — a MESMA linha pode
  // trazer `[[tag]] id = "x" aliases = ["a","b"]` ou `[[ambiente]] id = "any" descricao = "…"`.
  const pares = (linha) => {
    const achados = [];
    const re = /([a-z_]+)\s*=\s*("(?:[^"]*)"|\[[^\]]*\]|[^\s]+)/g;
    let m;
    while ((m = re.exec(linha))) achados.push([m[1], m[2]]);
    return achados;
  };
  const desvalor = (bruto) => {
    if (/^".*"$/.test(bruto)) return bruto.slice(1, -1);
    if (bruto.startsWith("[")) {
      return bruto.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    }
    return bruto;
  };
  for (const cru of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const linha = (cru.split("#")[0] ?? "").trim(); // sem comentario de fim de linha
    if (!linha) continue;
    const mSec = linha.match(/^\[\[([a-z_]+)\]\]\s*(.*)$/);
    if (mSec) {
      secao = mSec[1];
      atual = { id: null, aliases: [] };
      if (secao === "tag") out.tags.push(atual);
      for (const [chave, bruto] of pares(mSec[2] ?? "")) aplicar(chave, desvalor(bruto));
      continue;
    }
    if (!secao) continue;
    for (const [chave, bruto] of pares(linha)) aplicar(chave, desvalor(bruto));
  }

  function aplicar(chave, valor) {
    if (secao === "tag") {
      if (chave === "id") atual.id = valor;
      else if (chave === "aliases") atual.aliases = Array.isArray(valor) ? valor : [];
    } else if (secao === "ambiente" && chave === "id") out.ambientes.push(valor);
    else if (secao === "shell" && chave === "id") out.shells.push(valor);
    else if (secao === "classe" && chave === "id") out.classes.push(valor);
  }
  for (const t of out.tags) {
    if (t.id) out.alias.set(t.id, t.id);
    for (const a of t.aliases ?? []) out.alias.set(a, t.id);
  }
  return out;
}

/** Onde o valor cai na lista fechada: id exato, alias conhecido, ou null. */
export function resolveTag(valor, catalogo = loadTags()) {
  return catalogo.alias.get(String(valor)) ?? null;
}

/**
 * Valida as tags contra o vocabulario fechado. Regras (TARS-TAGS-1):
 *  - tag fora de tags.toml REPROVA e SUGERE o id de alias (R4: o erro nomeia o valor bom);
 *  - virgula dentro da tag REPROVA (as 9 entradas antigas desmembram na migracao F3);
 *  - `ambiente` (qualquer entrada) e `shell` (ledger) validados contra as listas do catalogo.
 * Entrada SEM tag continua valida NESTA fatia — exigir >=1 tag e' a migracao (F3).
 */
export function validateTags(e, kind = "ledger", catalogo = loadTags()) {
  const errs = [];
  if (Array.isArray(e.tags)) {
    for (const [i, t] of e.tags.entries()) {
      if (typeof t !== "string") { errs.push(`tags[${i}] nao e' texto`); continue; }
      if (/[,\s]/.test(t)) { errs.push(`tags[${i}]='${t}' tem virgula (uma tag por item)`); continue; }
      if (!catalogo.alias.has(t)) {
        const sug = catalogo.tags.map((x) => x.id).find((id) => id.startsWith(t.slice(0, 3)));
        errs.push(`tags[${i}]='${t}' fora de tags.toml${sug ? `; use '${sug}'` : "; cadastre o id em tags.toml"}`);
      }
    }
  }
  if (e.ambiente !== undefined && !catalogo.ambientes.includes(e.ambiente)) {
    errs.push(`ambiente='${e.ambiente}' invalido (${catalogo.ambientes.join("|")})`);
  }
  if (kind === "ledger" && e.shell !== undefined && !catalogo.shells.includes(e.shell)) {
    errs.push(`shell='${e.shell}' invalido (${catalogo.shells.join("|")})`);
  }
  // `classe` (TARS-REC-1) e' TEXTO LIVRE hoje e a migracao para o catalogo fechado A-D e'
  // outra fatia (F3): reprovar `c/x` aqui quebraria o ledger ja' em uso. So' se reprova o
  // que COLIDE com o catalogo novo — a fatia A-D ja' e' usada por `classe` em CONTAGEM,
  // entao um valor de 1 caractere fora de A-D e' migracao pendente, nao erro novo.
  if (kind === "ledger" && e.classe !== undefined) {
    const c = String(e.classe);
    const ehCurto = c.length === 1;
    if (ehCurto && catalogo.classes.length && !catalogo.classes.includes(c)) {
      errs.push(`classe='${e.classe}' invalida (${catalogo.classes.join("|")} — catalogo failure-modes.toml)`);
    }
  }
  return errs;
}

/** Retorna a lista de erros (vazia = valido). `exists(rel)` confere source_refs. */
export function validateMemoryEntry(e, opts = {}) {
  const errs = [];
  // `null`, numero ou array (`[1,2]`) passam pelo JSON.parse de uma linha: o `in` abaixo
  // estoura TypeError com eles e o gate morreria com stack em vez de reprovar a linha.
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["entrada nao e um objeto JSON"];
  for (const k of SCHEMA_KEYS) if (!(k in e)) errs.push(`falta a chave '${k}'`);
  for (const k of Object.keys(e)) if (!SCHEMA_KEYS.includes(k) && !OPTIONAL_KEYS.includes(k)) errs.push(`chave desconhecida '${k}'`);

  if (typeof e.id !== "string" || !/^mem-[a-z0-9-]+$/.test(e.id)) errs.push("id invalido (esperado mem-<slug>)");
  if (typeof e.ts !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(e.ts)) errs.push("ts invalido (ISO-8601)");
  if (typeof e.scope !== "string" || !/^[a-z0-9/_-]+$/.test(e.scope)) errs.push("scope invalido (lowercase, '/'-sep)");
  if (typeof e.statement !== "string" || e.statement.trim().length < 10) errs.push("statement curto");
  if (!["durable", "ephemeral"].includes(String(e.durability))) errs.push("durability invalido (durable|ephemeral)");
  if (!["high", "medium", "low"].includes(String(e.confidence))) errs.push("confidence invalida (high|medium|low)");
  if (!["verified", "observed"].includes(String(e.validation_status))) errs.push("validation_status invalido");

  if (!Array.isArray(e.source_refs) || e.source_refs.length === 0) {
    errs.push("source_refs vazio (a prova tem de existir)");
  } else if (opts.exists && !e.repo) {
    for (const r of e.source_refs) {
      // `arquivo.md:12` (linha) e' prova legitima: so' o CAMINHO precisa existir.
      const rel = typeof r === "string" ? r.split("#")[0].split(":")[0] : "";
      if (/:/.test(String(r))) continue;
      // Caminho ABSOLUTO (fixture em tmpdir, store importado a mao) e' julgado pelo
      // FS real: `path.join(REPO, "/tmp/x")` daria inexistente para arquivo que existe.
      if (path.isAbsolute(rel)) { if (!fs.existsSync(rel)) errs.push(`source_ref inexistente: '${String(r)}'`); continue; }
      if (!rel || !opts.exists(rel)) errs.push(`source_ref inexistente: '${String(r)}'`);
    }
  }
  for (const bad of ["transcript", "secret", "password", "token", "raw_chat", "content_dump"]) {
    if (bad in e) errs.push(`chave proibida '${bad}' (sem segredo/transcricao)`);
  }
  if (e.tags !== undefined && !Array.isArray(e.tags)) errs.push("tags invalido (array)");
  else if (Array.isArray(e.tags)) errs.push(...validateTags(e, "memory"));
  // SEG-862: valor literal de segredo em QUALQUER campo (a mesma familia do pre-commit).
  const hits = findSecrets(JSON.stringify(e));
  if (hits.length) errs.push(`segredo em texto puro (${hits.join(", ")})`);
  return errs;
}

// ---- SEG-862: identidade, sobrevivente, ledger, doctor --------------------------
// Porte da IDEIA (nao do motor) de farmega.v2 `.ai/scripts/memory_runtime.py:2079`
// (`entry_identity`) e `:2332` (`entry_preference_rank`), HEAD 617239d. O motor de la'
// tem 4.760 linhas e 3 camadas; aqui ha' 45 entradas — so' o hash e o rank.

/** Identidade exata de uma entrada: hash de tipo+escopo+titulo+conteudo+fonte. */
export function entryIdentity(e = {}) {
  // O `id` NUNCA entra: e' substituto (renomear nao pode criar "entrada nova"). O titulo,
  // quando existe, entra; sem ele a identidade e' (tipo, escopo, conteudo, fonte).
  const kind = e.kind ?? e.durability ?? "mem";
  const scope = e.scope ?? "";
  const title = e.title ?? e.titulo ?? "";
  const content = e.content ?? e.statement ?? e.o_que ?? "";
  const source = [...(e.source ?? e.source_refs ?? e.fonte ?? [])].map(String).sort().join("\n");
  return crypto.createHash("sha256").update([kind, scope, title, content, source].join("\u001f")).digest("hex");
}

/**
 * Chave de preferencia do SOBREVIVENTE (funcao pura) para o grupo do mesmo assunto:
 * durabilidade (durable<operacional) > origem (human<imported<derived<ia) > mais antiguia.
 * `min` da chave e' o sobrevivente. Esposta para o curador usar depois (sem CLI ainda).
 */
export function survivorRank(e = {}) {
  const dur = { durable: 0, ephemeral: 1, operational: 1 };
  const org = { human: 0, imported: 1, derived: 2, ia: 3, ai: 3 };
  return [dur[String(e.durability)] ?? 9, org[String(e.origin)] ?? 4, String(e.ts ?? e.data ?? "9999")];
}

/** Entre entradas do mesmo assunto, devolve a que sobrevive. */
export function pickSurvivor(entries) {
  if (!entries || entries.length === 0) return null;
  return entries.reduce((a, b) => (JSON.stringify(survivorRank(a)) <= JSON.stringify(survivorRank(b)) ? a : b));
}

/** Erros do ledger de incidentes (schema minimo + identidade). */
export function validateLedgerEntry(e, avisos = [], catalogo = loadTags()) {
  const errs = [];
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["entrada nao e um objeto JSON"];
  for (const k of LEDGER_KEYS) if (!(k in e)) errs.push(`falta a chave '${k}'`);
  for (const k of Object.keys(e)) if (!LEDGER_KEYS.includes(k) && !OPTIONAL_LEDGER_KEYS.includes(k)) errs.push(`chave desconhecida '${k}'`);
  if (typeof e.id !== "string" || !/^inc-[a-z0-9-]+$/.test(e.id)) errs.push("id invalido (esperado inc-<slug>)");
  if (typeof e.data !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(e.data)) errs.push("data invalida (ISO-8601)");
  if (typeof e.titulo !== "string" || e.titulo.trim().length < 10) errs.push("titulo curto");
  // TARS-REC-1: `recorrencia` virou CONTAGEM (>= 1). O booleano antigo ainda passa, mas
  // AVISA migracao: `true` = ja' repetiu (2), `false` = primeira vez (1). Contar e' o que
  // permite `tars doctor` acusar a classe que repetiu; booleano nao distingue 2 de 20.
  if (typeof e.recorrencia === "boolean") {
    avisos.push("recorrencia booleana (migrar para numero: true->2, false->1)");
  } else if (typeof e.recorrencia !== "number" || !Number.isInteger(e.recorrencia) || e.recorrencia < 1) {
    errs.push("recorrencia invalida (numero inteiro >= 1; booleano legado = aviso)");
  }
  if (!Array.isArray(e.fonte) || e.fonte.length === 0) errs.push("fonte vazio (a prova tem de existir)");
  if (!Array.isArray(e.tags)) errs.push("tags invalido (array)");
  else errs.push(...validateTags(e, "ledger", catalogo));
  const hits = findSecrets(JSON.stringify(e));
  if (hits.length) errs.push(`segredo em texto puro (${hits.join(", ")})`);
  return errs;
}

/** Acrescenta uma entrada (memory OU ledger) se schema ok e identidade inedita. */
export function addEntry(raw, { file = FILE, kind = "memory" } = {}) {
  const e = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errs = kind === "ledger" ? validateLedgerEntry(e) : validateMemoryEntry(e);
  if (errs.length) throw new Error(`entrada recusada: ${errs.join("; ")}`);
  const id = entryIdentity(e);
  const existing = fs.existsSync(file) ? readJsonl(file).entries.filter((e) => e && typeof e === "object") : [];
  for (const [i, cur] of existing.entries()) {
    if (entryIdentity(cur) === id) throw new Error(`duplicata exata (linha ${i + 1}, id '${cur.id}')`);
  }
  if (kind === "ledger") ensureLedger(file);
  fs.appendFileSync(file, JSON.stringify(e) + "\n");
  return { id, file, count: existing.length + 1 };
}

/** Le um .jsonl tolerante: cada linha crua + o erro de parse (se houver). */
export function readJsonl(file) {
  if (!fs.existsSync(file)) return { entries: [], errors: [] };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  return { entries: lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }), errors: [] };
}

/** Cria o ledger vazio se nao existir. */
export function ensureLedger(file = LEDGER_FILE) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "");
  return file;
}

/**
 * TARS-REC-1: agrupa o ledger por `classe` e acusa a classe que JA' REPETIU.
 *
 * A regra do dono (07/10): `recorrencia >= 2` sem `destino` = FALHA — a classe voltou
 * duas vezes e nao ha' item de backlog fechando-a. Uma ocorrencia so' e' episodio
 * (nao promove); com destino, a divida esta' nomeada. Devolve as FALHAS e o resumo.
 */
export function classesRecorrentes(entries) {
  const porClasse = new Map();
  for (const e of entries) {
    if (!e || typeof e !== "object" || Array.isArray(e) || !e.classe) continue;
    const n = typeof e.recorrencia === "number" ? e.recorrencia : e.recorrencia === true ? 2 : 1;
    const cur = porClasse.get(e.classe) ?? { classe: e.classe, ocorrencias: 0, destino: null, entradas: [] };
    cur.ocorrencias += n;
    if (!cur.destino && e.destino) cur.destino = e.destino;
    cur.entradas.push(e.id);
    porClasse.set(e.classe, cur);
  }
  const todas = [...porClasse.values()].sort((a, b) => b.ocorrencias - a.ocorrencias || a.classe.localeCompare(b.classe));
  const falhas = todas.filter((c) => c.ocorrencias >= 2 && !c.destino);
  return { classes: todas, falhas };
}

/** Doctor: julga os DOIS arquivos. Retorna { errors, files: {<rel>: {count}} }. */
export function doctor(files) {
  const errors = [];
  const avisos = [];
  const counts = {};
  const ledgerEntries = [];
  const targets = files ?? [
    { file: FILE, kind: "memory" },
    { file: LEDGER_FILE, kind: "ledger" },
  ];
  for (const { file, kind } of targets) {
    const rel = path.relative(REPO, file);
    if (!fs.existsSync(file)) { counts[rel] = 0; continue; }
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
    counts[rel] = lines.length;
    const seen = new Map();
    const exists = (r) => fs.existsSync(path.join(REPO, r));
    lines.forEach((l, i) => {
      let e;
      try { e = JSON.parse(l); } catch (err) {
        errors.push(`${rel} linha ${i + 1}: JSON invalido (${err.message})`);
        return;
      }
      const errs = kind === "ledger" ? validateLedgerEntry(e, avisos) : validateMemoryEntry(e, { exists });
      for (const m of errs) errors.push(`${rel} linha ${i + 1} (${e && e.id ? e.id : "sem id"}): ${m}`);
      if (e && typeof e === "object" && !Array.isArray(e)) {
        const id = entryIdentity(e);
        if (seen.has(id)) errors.push(`${rel} linha ${i + 1} (${e.id}): identidade duplicada da linha ${seen.get(id)}`);
        else seen.set(id, i + 1);
        if (kind === "ledger") ledgerEntries.push(e);
      }
    });
  }
  // TARS-REC-1: a classe que repetiu sem destino e' FALHA (nao aviso) — e' o "X = 2" do dono.
  const { classes, falhas } = classesRecorrentes(ledgerEntries);
  for (const c of falhas) {
    errors.push(
      `classe '${c.classe}' repetiu ${c.ocorrencias}x sem 'destino' (id do item de backlog que fecha a classe)`,
    );
  }
  return { errors, avisos, counts, classes };
}

// SEG-869: o boot le SO o INDEX (operacional, SEG-864); o ledger sai do boot
// e ganha arquivo proprio — o indice antigo (operacional+ledger) era o item mais
// caro do boot. Uma linha por entrada, titulo cortado em TITLE_MAX (KISS).
export const INDEX_FILE = path.join(REPO, ".ai", "memory", "INDEX.md");
export const LEDGER_INDEX_FILE = path.join(REPO, ".ai", "memory", "LEDGER-INDEX.md");
const TITLE_MAX = 70;
// SOFON-MEM-1: quantos fatos do INDEX o boot carrega. O teto e' o do BOOT BUDGET
// (`.ai/boot-budget.json`, julgado por `ai-layer-check.mjs`), descontadas as
// linhas de AGENTS.md/CLAUDE.md/agent/MEMORY.md — por isso vem do JSON, e nao
// de um numero solto que envelheceria calado.
const BOOT_BUDGET_DOC = path.join(REPO, ".ai", "boot-budget.json");
const INDEX_SOURCE_FILE = path.join(REPO, ".ai", "memory", "memory.index.json");
// Tokens do cabecalho + do report de truncamento. Este e', de proposito, o unico
// numero fixo do gerador: com 484 entradas ele vale 3,7% do que sobra para o
// indice. Se a memoria encolher a ponto de o indice inteiro caber, esta gordura
// nao importa; se crescer, o corte acontece (e aparece no report).
const COMPACT_TOKENS = 200;
export const DEFAULT_BOOT_BUDGET = 15800;
export const DEFAULT_TITLE_MAX = 68;

// TARS-MEM-2: memoria em DUAS camadas. `base` e' a copia versionada que o sync do
// Tars poe no repo (so' muda por promocao); `projeto` e' onde as sessoes escrevem.
// O boot le a UNIAO; mesmo `id` ou mesmo `name` -> o projeto vence. A escrita vai
// SEMPRE para o projeto (a base e' somente leitura aqui).
export const DEFAULT_BASE_DIR = ".ai/base/memory";
export const MEM_LAYERS = ["base", "projeto"]; // ordem de PRIORIDADE da base; o projeto vence por ultimo
/** Le `.ai/memory.config.json` (ou `--base <dir>`); default `.ai/base/memory`. */
export function resolveBaseDir(root = REPO, override) {
  if (override) return path.resolve(root, override);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, ".ai", "memory.config.json"), "utf8"));
    if (typeof cfg.base === "string" && cfg.base.trim()) return path.resolve(root, cfg.base);
  } catch { /* sem config: default */ }
  return path.join(root, DEFAULT_BASE_DIR);
}
/**
 * Mescla as camadas. `projeto` vence a `base` no mesmo `id` ou no mesmo `name`
 * (um fato que foi promovido e voltou editado no projeto nao pode aparecer duas
 * vezes). Cada entrada recebe `camada`; `errors` so' acusa base DECLARADA ausente
 * (base opcional nao quebra o boot).
 */
export function mergeLayers({ baseDir, projFile = FILE, baseFile } = {}) {
  const layers = [
    { camada: "base", file: baseFile ?? path.join(baseDir ?? resolveBaseDir(), "operational-memory.jsonl"), required: !!baseDir },
    { camada: "projeto", file: projFile, required: false },
  ];
  const errors = [];
  const idx = new Map(); // chave (id | name) -> posicao em `ordem`
  const ordem = [];
  // Chaves de colisao: o `name` (quando existe) e o `id`. O `statement` NAO entra:
  // dois fatos diferentes podem ter o mesmo texto e nao sao o mesmo fato.
  const chaves = (e) => (e.name ? [`name:${e.name}`, `id:${e.id}`] : [`id:${e.id}`]);
  for (const { camada, file, required } of layers) {
    if (!fs.existsSync(file)) {
      if (required) errors.push(`camada 'base' declarada e ausente: ${path.relative(REPO, file)}`);
      continue;
    }
    for (const e of readJsonl(file).entries) {
      if (!e || typeof e !== "object" || Array.isArray(e)) continue;
      const ks = chaves(e);
      const cur = ks.map((k) => idx.get(k)).find(Boolean)?.entry;
      // Prioridade: base < projeto (a ordem de MEM_LAYERS e' a da prioridade
      // crescente; o projeto e' lido por ultimo). Perdedor nao entra.
      if (cur && MEM_LAYERS.indexOf(camada) < MEM_LAYERS.indexOf(cur.duracao)) continue;
      if (cur) {
        for (const k of chaves(cur)) idx.delete(k);
        ordem.splice(ordem.indexOf(cur), 1);
      }
      const item = { ...e, camada };
      const entry = { duracao: camada, ...item };
      for (const k of ks) idx.set(k, { entry });
      ordem.push(entry);
    }
  }
  return { entries: ordem, errors };
}
/** Codifica um id no formato `mem-<slug>` (o gate reprova qualquer outro). */
export function slugId(id, prefix) {
  return `${prefix}-${String(id).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`;
}
/** A memoria e' federada: cada fato guarda o id que tinha no repo de origem. */
export function sourceIdOf(e, prefix) {
  const raw = e.source_id ?? e.id;
  return /^[a-z]+-[a-z0-9-]+$/.test(String(raw)) ? String(raw) : slugId(raw, prefix);
}

/** Corta o titulo em TITLE_MAX (adiciona `...` so quando corta). */
function shortTitle(s) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1).trimEnd() + "…" : t;
}

/** Linha do indice: `- [id] titulo curto  ·  <origem>`. Deterministico. */
function indexRow(e, title, source) {
  return `- [${e.id}] ${shortTitle(title)}${source ? `  ·  ${source}` : ""}`;
}

/** Origem de uma entrada no indice: so' marca `base:`; o projeto e' o default. */
function origemDe(e) {
  return e.repo ?? e.source ?? (e.camada === "base" ? "base" : undefined);
}

/** Descarta os `undefined` de um objeto (para o JSON gravado nao virar ruido). */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Le o teto de tokens do boot de `.ai/boot-budget.json` e devolve quantas linhas
 * do INDEX cabem nele (descontando o arquivo fonte e o cabecalho). Um boot-budget
 * ausente nao trava o gerador: cai no DEFAULT e o boot-budget-check julga o resto.
 */
export function readIndexBudget(root = REPO) {
  let budget = {};
  try { budget = JSON.parse(fs.readFileSync(path.join(root, ".ai", "boot-budget.json"), "utf8")); } catch { /* default */ }
  const teto = Number.isFinite(budget.teto_tokens) ? budget.teto_tokens : DEFAULT_BOOT_BUDGET;
  const outros = (budget.arquivos ?? []).filter((f) => f !== ".ai/memory/INDEX.md");
  return { teto, arquivos: outros, root, INDEX: ".ai/memory/INDEX.md" };
}

/**
 * Corte do indice do boot. `file` (o arquivo federado, cujo tamanho manda em
 * `cap`/`dropped` do report) e `entries` (o que entra no indice) sao parametros
 * separados para o teste escolher `entries` sem inflar o `file`.
 * `cap === Infinity` mantem tudo (o teto e do boot, nao da memoria).
 */
export function capIndexEntries({ arquivos = [], root = REPO, file = FILE, entries } = {}) {
  const teto = arguments[0]?.teto ?? readIndexBudget(root).teto;
  // TARS-MEM-2: sem `entries` explicito o indice e' a UNIAO das camadas (base+
  // projeto), com o projeto vencendo — nunca so' o arquivo do projeto.
  const todas = entries ?? mergeLayers({ baseDir: arguments[0]?.baseDir, projFile: file }).entries;
  // Ordem do indice: as durable do segtools primeiro (a casa dita), depois as dos
  // outros repos. Dentro de cada grupo, a ordem do arquivo (que e' por ts).
  const peso = (e) => (e.repo ? 4 : 0) + (String(e.durability) === "durable" ? 0 : 2);
  const ordenadas = todas.map((e, i) => ({ e, i })).sort((a, b) => peso(a.e) - peso(b.e) || a.i - b.i).map((x) => x.e);
  let outros = 0;
  for (const rel of arquivos.filter((f) => f !== ".ai/memory/INDEX.md")) {
    try { outros += Math.ceil(fs.readFileSync(path.join(root, rel), "utf8").length / 4); } catch { /* arquivo ausente: conta 0 */ }
  }
  // O boot NAO carrega o store (669 KB): carrega os arquivos do boot-budget. Por
  // isso a conta desconta so' os OUTROS arquivos do boot, o cabecalho e o report.
  const fixed = outros + COMPACT_TOKENS;
  const available = Number.isFinite(teto) ? Math.max(0, teto - fixed) : todas.length;
  // O orcamento e' por linha REAL (mede-se o renderizado, nao se estima). Com
  // entradas elegiveis o indice NUNCA sai vazio — o corte e' o ultimo recurso.
  const cap = Number.isFinite(teto) ? (() => {
    let used = 0, n = 0;
    for (const e of ordenadas) {
      const w = Math.ceil((indexRow(e, e.statement, e.repo ?? e.source).length + 1) / 4);
      if (n > 0 && used + w > available) break;
      used += w; n++;
    }
    return n;
  })() : todas.length;
  return { entries: ordenadas.slice(0, cap), cap, total: todas.length, dropped: todas.length - cap, teto, available, orcamento: COMPACT_TOKENS };
}

/** Bloco final do indice: o que ficou fora do boot (a leitura sob demanda). */
function truncatedBlock(total, cap, entries) {
  const porOrigem = new Map();
  for (const e of entries.slice(cap)) {
    const o = e.repo ?? e.camada ?? "projeto"; // sem `repo` = fato da casa (camada projeto)
    porOrigem.set(o, (porOrigem.get(o) ?? 0) + 1);
  }
  const detalhe = [...porOrigem].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${n}`).join(", ");
  return `\n_Fora do boot: ${total - cap} de ${total} entradas (cap ${cap}). Leia sob demanda (${detalhe})._\n`;
}

/** Uma linha por entrada: `- [id] titulo curto  ·  <origem>`. Deterministico. */
export function renderIndex(memoryFile = FILE, opts = {}) {
  const budget = readIndexBudget();
  const { entries, cap, total, dropped, teto, available } = capIndexEntries({ ...budget, ...opts, file: memoryFile });
  const rows = entries.map((e) => indexRow(e, e.statement, origemDe(e)));
  const todas = mergeLayers({ baseDir: opts.baseDir, projFile: memoryFile }).entries;
  const tail = dropped > 0 ? truncatedBlock(total, cap, todas) : "";
  const cabec = Number.isFinite(teto) ? `Teto do boot: ${teto} tokens (${available} tok para o indice; ${cap} entradas).\n` : "";
  return `# Indice da memoria\n\nGerado por \`node tools/framework/ai-memory.mjs index\` — nao editar a mao.\n${cabec}\n${rows.length ? rows.join("\n") : "(vazio)"}\n${tail}`;
}

/** O INDICE do ledger (fora do boot): `- [id] titulo curto`. */
export function renderLedgerIndex(ledgerFile = LEDGER_FILE) {
  const { entries } = readJsonl(ledgerFile);
  const rows = entries.filter((e) => e && typeof e === "object" && !Array.isArray(e)).map((e) => `- [${e.id}] ${shortTitle(e.titulo)}`);
  return `# Indice do ledger de incidentes\n\nGerado por \`node tools/framework/ai-memory.mjs index\` — nao editar a mao.\n\n${rows.length ? rows.join("\n") : "(vazio)"}\n`;
}

/** Grava os DOIS indices + o mapa completo (`.ai/memory/memory.index.json`). */
export function writeIndex(memoryFile = FILE, ledgerFile = LEDGER_FILE, opts = {}) {
  const count = (md) => md.split("\n").filter((l) => l.startsWith("- [")).length;
  const md = renderIndex(memoryFile, opts);
  const ledgerMd = renderLedgerIndex(ledgerFile);
  fs.writeFileSync(INDEX_FILE, md);
  fs.writeFileSync(LEDGER_INDEX_FILE, ledgerMd);
  const { entries } = readJsonl(memoryFile);
  const all = entries.filter((e) => e && typeof e === "object" && !Array.isArray(e));
  fs.writeFileSync(INDEX_SOURCE_FILE, JSON.stringify(compact({
    generated_by: "node tools/framework/ai-memory.mjs index",
    total: all.length,
    boot_cap: count(md),
    entries: all.map((e) => compact({ source_id: e.id, id: e.id, camada: e.camada, repo: e.repo, source: e.source, scope: e.scope, statement: e.statement, ts: e.ts })),
  }), null, 2) + "\n");
  return { file: INDEX_FILE, lines: count(md), ledgerFile: LEDGER_INDEX_FILE, ledgerLines: count(ledgerMd), sourceFile: INDEX_SOURCE_FILE };
}

/** Valida o arquivo inteiro; retorna { errors: string[], count } */
export function validateMemoryFile(file = FILE) {
  const errors = [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const exists = (rel) => fs.existsSync(path.join(REPO, rel));
  const ids = new Set();
  let prevTs = "";
  lines.forEach((l, i) => {
    let e;
    try {
      e = JSON.parse(l);
    } catch (err) {
      errors.push(`linha ${i + 1}: JSON invalido (${err.message})`);
      return;
    }
    // JSON valido que nao e objeto (`123`, `null`, `[1]`): nao da para ler id/ts depois.
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      errors.push(`linha ${i + 1}: entrada nao e um objeto JSON`);
      return;
    }
    for (const m of validateMemoryEntry(e, { exists })) errors.push(`linha ${i + 1} (${e.id ?? "sem id"}): ${m}`);
    if (ids.has(e.id)) errors.push(`linha ${i + 1}: id duplicado '${e.id}'`);
    ids.add(e.id);
    if (typeof e.ts === "string" && prevTs && e.ts < prevTs) errors.push(`linha ${i + 1}: ts fora de ordem ('${e.ts}' < '${prevTs}')`);
    if (typeof e.ts === "string") prevTs = e.ts;
  });
  return { errors, count: lines.length };
}

// Os repos de origem usam enums que o nosso schema reduzido nao tem: a federacao
// traduz na entrada (o valor de origem fica no repo, nao aqui).
export const DURABILITY_MAP = { durable: "durable", operational: "ephemeral", ephemeral: "ephemeral" };
export const CONFIDENCE_MAP = { high: "high", medium: "medium", low: "low" };

/** Normaliza para o dedup: minusculas, sem acento, espaco colapsado. */
function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * SOFON-MEM-1: mescla a memoria FEDERADA (os outros 6 repos do `.cache/sofon-memory/`)
 * na canonica do segtools. Entram so' as entradas com `repo != segtools` (as daqui
 * ja' estao no arquivo). Dedup por id e por statement/o_que normalizado. Cada
 * entrada guarda `source_id` (o id que tinha no repo de origem) e `repo`; o
 * `source_refs` passa a apontar para o arquivo de origem, que e' onde a prova mora.
 * Devolve { entradas, ledgers, idx, report } — e' pura ate' o `writeIndex` final.
 */
export function mergeFederated({ memoryFile = FILE, ledgerFile = LEDGER_FILE, sourceFile = path.join(REPO, ".cache", "sofon-memory", "operational-memory.jsonl"), sourceLedger = path.join(REPO, ".cache", "sofon-memory", "incident-ledger.jsonl") } = {}) {
  // O `.cache/` e' descartavel e nao vai para o git: a prova aponta para o arquivo
  // de ORIGEM, no repo de origem, no formato `<repo>:<caminho>`.
  const refDe = (repo, nome) => `${repo}:.ai/memory/${nome}`;
  const mem = readJsonl(memoryFile).entries.filter((e) => e && typeof e === "object" && !Array.isArray(e));
  const ids = new Set(mem.map((e) => e.id));
  const byStatement = new Set(mem.map((e) => norm(e.statement)));
  const report = { dup: 0, vazias: 0, byRepo: {} };
  const novas = [];
  for (const e of readJsonl(sourceFile).entries) {
    if (!e || typeof e !== "object" || Array.isArray(e) || e.repo === "segtools") continue;
    // As duas "ok" do farmega sao ruido de teste, nao fato: o gate reprova statement < 10.
    if (String(e.statement ?? "").trim().length < 10) { report.vazias++; continue; }
    const id = sourceIdOf({ ...e, repo: e.repo }, "mem");
    const dup = ids.has(id) || byStatement.has(norm(e.statement));
    const stat = (report.byRepo[e.repo] ??= { memory: 0, ledger: 0, dup: 0 });
    if (dup) { stat.dup++; report.dup++; continue; }
    const novo = compact({
      id, ts: e.ts, scope: e.scope, statement: e.statement,
      durability: DURABILITY_MAP[e.durability] ?? e.durability,
      source_refs: [refDe(e.repo, "operational-memory.jsonl")],
      confidence: CONFIDENCE_MAP[e.confidence] ?? "medium",
      validation_status: e.validation_status ?? (e.source ? "verified" : "observed"),
      source_id: e.id, repo: e.repo, source: e.source ?? e.x?.source ?? null,
    });
    const errs = validateMemoryEntry(novo);
    if (errs.length) throw new Error(`federada recusada (${e.repo}/${e.id}): ${errs.join("; ")}`);
    ids.add(id); byStatement.add(norm(e.statement));
    // O arquivo curado mantem `ts` crescente (o gate reprova fora de ordem): insercao estavel.
    let i = mem.length;
    while (i > 0 && String(mem[i - 1].ts ?? "") > String(e.ts ?? "")) i--;
    mem.splice(i, 0, novo);
    stat.memory++; novas.push(novo);
  }
  const led = readJsonl(ledgerFile).entries.filter((e) => e && typeof e === "object" && !Array.isArray(e));
  const ledIds = new Set(led.map((e) => e.id));
  const ledStatements = new Set(led.map((e) => norm(e.o_que)));
  const novosInc = [];
  for (const e of readJsonl(sourceLedger).entries) {
    if (!e || typeof e !== "object" || Array.isArray(e) || e.repo === "segtools") continue;
    const id = /^inc-/.test(String(e.id)) ? sourceIdOf(e, "inc") : slugId(e.id, "inc");
    // 154 registros do farmega.v2 sao eventos de teste VAZIOS (titulo/o_que/causa
    // em branco) — nao ha' fato para portar, e o gate os recusaria por titulo curto.
    if (String(e.titulo ?? "").trim().length < 10 || String(e.o_que ?? "").trim().length < 10) { report.vazias++; continue; }
    const stat = (report.byRepo[e.repo] ??= { memory: 0, ledger: 0, dup: 0 });
    if (ledIds.has(id) || ledStatements.has(norm(e.o_que))) { stat.dup++; report.dup++; continue; }
    const novo = compact({
      id, data: e.data, titulo: e.titulo, o_que: e.o_que, causa: e.causa, correcao: e.correcao,
      recorrencia: e.recorrencia, fonte: [refDe(e.repo, "incident-ledger.jsonl")], tags: e.tags ?? [],
      source_id: e.id, repo: e.repo,
    });
    const errs = validateLedgerEntry(novo);
    if (errs.length) throw new Error(`incidente federado recusado (${e.repo}/${e.id}): ${errs.join("; ")}`);
    ledIds.add(id); ledStatements.add(norm(e.o_que));
    let i = led.length;
    while (i > 0 && String(led[i - 1].data ?? "") > String(e.data ?? "")) i--;
    led.splice(i, 0, novo);
    stat.ledger++; novosInc.push(novo);
  }
  const write = (file, linhas) => fs.writeFileSync(file, linhas.length ? linhas.map((e) => JSON.stringify(e)).join("\n") + "\n" : "");
  write(memoryFile, mem);
  write(ledgerFile, led);
  const idx = writeIndex(memoryFile, ledgerFile);
  return { entradas: novas.length, ledgers: novosInc.length, idx, report };
}

/**
 * Extrai a lista de campos da tabela da secao `## Campos` do README (uma linha por campo, * na forma `| \`campo\` | ... |`). So a secao `## Campos` conta: a tabela e a lista canonica,
 * e as demais secoes (`## Campos recusados`) falam de campo que NAO e do schema.
 */
export function parseSchemaDoc(md) {
  const keys = [];
  let inSection = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inSection = /^##\s+Campos\s*$/.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = /^\|\s*`([a-z][a-z0-9_]*)`\s*\|/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/** Compara a lista do doc com SCHEMA_KEYS; vazio = doc e gate concordam. */
export function validateSchemaDoc(md) {
  const errs = [];
  const doc = parseSchemaDoc(md);
  if (doc.length === 0) return [".ai/memory/README.md: secao '## Campos' ausente ou sem tabela de campos"];
  for (const k of SCHEMA_KEYS) if (!doc.includes(k)) errs.push(`campo do gate fora do doc: '${k}'`);
  for (const k of doc) if (!SCHEMA_KEYS.includes(k)) errs.push(`campo documentado que o gate recusa: '${k}'`);
  return errs;
}

/** O mesmo, lendo o README do disco (o que o `--check` julga). */
export function validateSchemaDocFile(doc = SCHEMA_DOC) {
  if (!fs.existsSync(doc)) return [`doc do schema nao encontrado: ${path.relative(REPO, doc)}`];
  return validateSchemaDoc(fs.readFileSync(doc, "utf8"));
}

/** Le a flag `--x valor` (ou undefined). */
function flag(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Incident: dist/tars procura `.ai/` na raiz `/`. No `bun build --compile` TODO modulo
// embutido responde o MESMO `import.meta.url` do entrypoint, entao o guard abaixo ficava
// verdadeiro quando o `tars.mjs` so' IMPORTAVA este modulo — o main rodava lendo `FILE`
// (o `.ai/` ao lado do modulo, que no binario vira `/$bunfs/root` -> raiz `/`) e o
// `sync --check` morria com ENOENT. `TARS_AS_MODULE` (posto pelo `tars.mjs`, mesmo padrao
// dos modulos donos) desliga o auto-run quando somos biblioteca.
const isMain = !process.env.TARS_AS_MODULE && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes("--check")) {
  const file = flag("--file");
  const { errors, count } = validateMemoryFile(file);
  const all = [...errors, ...validateSchemaDocFile()];
  if (all.length) {
    console.error("ai-memory: memoria operacional invalida (.ai/memory/operational-memory.jsonl):");
    for (const e of all) console.error("  " + e);
    process.exit(1);
  }
  console.log(`ai-memory ok (${count} entradas; ${SCHEMA_KEYS.length} campos no doc e no gate)`);
} else if (isMain && process.argv[2] === "doctor" || (isMain && process.argv.includes("--doctor"))) {
  const { errors, avisos, counts, classes } = doctor(flag("--file") ? [{ file: flag("--file"), kind: flag("--kind") ?? "memory" }] : undefined);
  const resumo = Object.entries(counts).map(([f, n]) => `${f}:${n}`).join(", ");
  for (const a of avisos ?? []) console.error(`ai-memory doctor: AVISO — ${a}`);
  for (const c of classes ?? []) {
    console.log(`classe ${c.classe ?? "(sem classe)"}: ${c.ocorrencias} ocorrencia(s)` + (c.destino ? ` -> ${c.destino}` : ""));
  }
  if (errors.length) {
    console.error(`ai-memory doctor: ${errors.length} problema(s) (${resumo}):`);
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log(`ai-memory doctor ok (${resumo})`);
} else if (isMain && process.argv[2] === "add") {
  const file = flag("--file") ?? FILE;
  const kind = flag("--kind") ?? (file.endsWith("incident-ledger.jsonl") ? "ledger" : "memory");
  try {
    const { id, count } = addEntry(flag("--json"), { file, kind });
    const idx = writeIndex();
    console.log(`ai-memory add ok (${path.relative(REPO, file)}; ${count} entradas; identidade ${id.slice(0, 12)}; indice ${idx.lines} + ledger ${idx.ledgerLines} itens)`);
  } catch (err) {
    console.error("ai-memory add: " + err.message);
    process.exit(1);
  }
} else if (isMain && process.argv[2] === "index") {
  // TARS-MEM-2: `--base <dir>` aponta a camada base (configuracao, default e
  // `.ai/base/memory`). A escrita do indice continua so' no repo.
  const idx = writeIndex(FILE, LEDGER_FILE, { baseDir: resolveBaseDir(REPO, flag("--base")) });
  console.log(`ai-memory index ok (${path.relative(REPO, idx.file)}; ${idx.lines} no boot; ${path.relative(REPO, idx.ledgerFile)}; ${idx.ledgerLines} itens; mapa ${path.relative(REPO, idx.sourceFile)})`);
} else if (isMain && process.argv[2] === "merge") {
  // SOFON-MEM-1: mescla a memoria federada (outros repos) na canonica do segtools.
  const { entradas, ledgers, idx, report } = mergeFederated({
    memoryFile: flag("--file") ?? FILE,
    ledgerFile: flag("--ledger") ?? LEDGER_FILE,
  });
  for (const [repo, n] of Object.entries(report.byRepo)) console.log(`${repo}: +${n.memory} fatos, +${n.ledger} incidentes (dup ${n.dup})`);
  console.log(`ai-memory merge ok (+${entradas} fatos, +${ledgers} incidentes; ${report.dup} duplicatas, ${report.vazias} vazias descartadas; indice ${idx.lines} no boot)`);
}
