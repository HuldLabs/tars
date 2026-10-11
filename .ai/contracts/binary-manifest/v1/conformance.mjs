#!/usr/bin/env node
// TESTE DE CONFORMIDADE do MANIFESTO do binario (ADR-0002 D3, D8.3): valida um manifesto contra o
// JSON Schema draft 2020-12 do item `contracts/binary-manifest/v1`.
//
// O QUE ELE COBRA (o schema tem de verdade isto, nao so' um `required`):
//   1. `contract` presente e no padrao de versao — o adaptador decide por ele (D8.3 regra 3);
//   2. a tela e' MODELO DE PAGINA: `html`/`template`/qualquer `html*` no lugar do modelo reprova (D3);
//   3. identidade (`name`, `version`), enums fechados e `additionalProperties: false` em toda parte.
//
// DE PROPOSITO SEM DEPENDENCIA: o Tars e' catalogo e roda em repos so' Python, sem Node sequer; um
// validador de terceiro (ajv) entraria no `package.json` para isto. O recorte abaixo cobre o que os
// manifestos USAM — `type`, `required`, `properties`, `additionalProperties`, `patternProperties`,
// `items`, `enum`, `pattern`, `minLength`, `maxLength`, `uniqueItems`, `additionalProperties: false`,
// `allOf`/`anyOf`/`not` e `$ref` local. Se um dia o schema usar uma palavra que este motor nao
// conhece, ele FALHA ALTO (`palavra desconhecida`) em vez de passar calado (R4).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_URL = join(HERE, "manifest.schema.json");

/** As palavras que o motor de validacao entende. Fora daqui = falha alta (nunca ignorar em silencio). */
const KNOWN = new Set([
  "$schema", "$id", "$comment", "$defs", "$ref", "title", "description", "default", "examples",
  "type", "required", "properties", "additionalProperties", "patternProperties", "items",
  "enum", "const", "pattern", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems",
  "minimum", "maximum", "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "format",
]);

const tipoDe = (v) =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;

const casaTipo = (v, t) => {
  const d = tipoDe(v);
  if (t === "number") return d === "number" || d === "integer";
  if (t === "integer") return d === "integer";
  if (t === "object") return d === "object";
  return d === t;
};

/** Resolve um `$ref` local (`#/$defs/x`). Ref externo falha alto: o schema e' auto-contido de proposito. */
function resolve(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) throw new Error(`$ref nao suportado: ${ref}`);
  let alvo = root;
  for (const parte of ref.slice(2).split("/")) alvo = alvo?.[parte.replace(/~1/g, "/").replace(/~0/g, "~")];
  if (alvo === undefined) throw new Error(`$ref nao resolve: ${ref}`);
  return alvo;
}

/**
 * Valida `dado` contra `schema`. Devolve a LISTA de problemas (vazio = conforme), cada um com o
 * caminho (`pages[0].layout`). Falha alta em erro de schema (palavra/ref desconhecida), nunca silencio.
 */
export function validaManifest(dado, schema, caminho = "$", root = schema) {
  const errs = [];
  const falhas = (msg) => errs.push(`${caminho}: ${msg}`);

  if (typeof schema !== "object" || schema === null) return errs;
  for (const palavra of Object.keys(schema)) {
    if (!KNOWN.has(palavra)) throw new Error(`palavra de schema desconhecida em ${caminho}: "${palavra}" (o motor nao a entende — falha alta)`);
  }

  if (schema.$ref) return validaManifest(dado, resolve(root, schema.$ref), caminho, root);

  if (schema.not) {
    const sub = validaManifest(dado, schema.not, caminho, root);
    if (sub.length === 0) falhas("nao pode casar o esquema proibido (not)");
  }
  if (schema.allOf) for (const sub of schema.allOf) errs.push(...validaManifest(dado, sub, caminho, root));
  if (schema.anyOf && !schema.anyOf.some((sub) => validaManifest(dado, sub, caminho, root).length === 0)) {
    falhas("nao casa nenhuma alternativa (anyOf)");
  }
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((sub) => validaManifest(dado, sub, caminho, root).length === 0).length;
    if (ok !== 1) falhas(`casa ${ok} alternativas (oneOf exige exatamente 1)`);
  }
  if (schema.if) {
    const bateu = validaManifest(dado, schema.if, caminho, root).length === 0;
    const entao = bateu ? schema.then : schema.else;
    if (entao) errs.push(...validaManifest(dado, entao, caminho, root));
  }

  if (schema.type) {
    const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!tipos.some((t) => casaTipo(dado, t))) {
      falhas(`tipo ${tipoDe(dado)}, esperado ${tipos.join("|")}`);
      return errs;
    }
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(dado))) {
    falhas(`${JSON.stringify(dado)} fora do enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && JSON.stringify(dado) !== JSON.stringify(schema.const)) {
    falhas(`${JSON.stringify(dado)} != const ${JSON.stringify(schema.const)}`);
  }
  if (typeof dado === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(dado)) falhas(`"${dado}" fora do padrao ${schema.pattern}`);
    if (schema.minLength !== undefined && dado.length < schema.minLength) falhas(`texto com ${dado.length} < minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && dado.length > schema.maxLength) falhas(`texto com ${dado.length} > maxLength ${schema.maxLength}`);
  }
  if (typeof dado === "number") {
    if (schema.minimum !== undefined && dado < schema.minimum) falhas(`${dado} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && dado > schema.maximum) falhas(`${dado} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(dado)) {
    if (schema.minItems !== undefined && dado.length < schema.minItems) falhas(`lista com ${dado.length} < minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && dado.length > schema.maxItems) falhas(`lista com ${dado.length} > maxItems ${schema.maxItems}`);
    if (schema.uniqueItems) {
      const vistos = new Set();
      dado.forEach((item, i) => {
        const chave = JSON.stringify(item);
        if (vistos.has(chave)) falhas(`item repetido em [${i}] (uniqueItems)`);
        vistos.add(chave);
      });
    }
    if (schema.items) dado.forEach((item, i) => errs.push(...validaManifest(item, schema.items, `${caminho}[${i}]`, root)));
  }
  if (tipoDe(dado) === "object") {
    for (const campo of schema.required ?? []) {
      if (!(campo in dado)) falhas(`falta "${campo}" (obrigatorio)`);
    }
    const props = schema.properties ?? {};
    const patterns = schema.patternProperties ?? {};
    for (const [chave, valor] of Object.entries(dado)) {
      const dono = props[chave] ?? Object.entries(patterns).find(([re]) => new RegExp(re).test(chave))?.[1];
      if (dono) errs.push(...validaManifest(valor, dono, `${caminho}.${chave}`, root));
      else if (schema.additionalProperties === false) falhas(`campo "${chave}" nao declarado (additionalProperties: false)`);
      else if (typeof schema.additionalProperties === "object") {
        errs.push(...validaManifest(valor, schema.additionalProperties, `${caminho}.${chave}`, root));
      }
    }
  }
  return errs;
}

let _schema = null;
/** O schema do item, lido uma vez (o arquivo e' a FONTE — R3). */
export function schemaDoItem(url = SCHEMA_URL) {
  return (_schema ??= JSON.parse(readFileSync(url, "utf8")));
}

// CLI — valida um manifesto (`--manifest <arquivo>`) contra o schema do item. Exit 1 e a lista de
// problemas quando reprova; a linha de OK quando passa. E' a prova que terceiro roda sem harness.
const isMain = process.argv[1] && process.argv[1].endsWith("conformance.mjs");
if (isMain) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf("--manifest");
  if (idx < 0) {
    console.error("uso: node conformance.mjs --manifest <arquivo.json>");
    process.exit(2);
  }
  const manifesto = JSON.parse(readFileSync(argv[idx + 1], "utf8"));
  const errs = validaManifest(manifesto, schemaDoItem());
  if (errs.length === 0) {
    console.log(`conforme: ${argv[idx + 1]} casa ${SCHEMA_URL.replace(HERE + "/", "")}`);
  } else {
    console.error(`NAO conforme (${errs.length}):\n  - ${errs.join("\n  - ")}`);
    process.exit(1);
  }
}
