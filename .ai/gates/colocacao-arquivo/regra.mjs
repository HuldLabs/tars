// colocacao-arquivo — a MATRIZ de colocacao (`familia -> allowed`) como REGRA portavel.
//
// B1.1 e B1.2 do plano de release de 14/10. Ate' aqui a regra existia em DOIS lugares que o
// catalogo nao alcancava: a matriz `config/file_placement.toml` (que so' o segtools tem) e o
// `tools/framework/layout-check.mjs` (que le' um caminho FIXO do repo). O catalogo ficava sem
// a doutrina — era o "buraco maior". Aqui a regra vira MODULO: a matriz entra como dado
// (`--matriz`) e os arquivos julgados vem do consumidor (staged, por padrao).
//
//   B1.1 — a MATRIZ e' o gate. Familia -> `allowed`; a ordem do TOML e' a do autor (o mais
//          especifico antes do amplo). O que nao casa familia nenhuma e' `nao-classificado` e
//          BLOQUEIA: a matriz tem de continuar COMPLETA — arquivo novo sem familia e' buraco,
//          nao permissao.
//
//   B1.2 — o caminho GLOBAL (`tools/ packages/ config/ .ai/ docs/ themes/ modules/`…) nunca
//          mora sob o APP (`apps/<app>/`). Caminho global e' do framework: nasce na raiz e o
//          app so' CONSOME. `forbidden` ja' expressa isso na familia; este modulo cobra a
//          forma GERAL, com a raiz do app vindo por `--app` (default `apps/`), para o defeito
//          nao depender de alguem lembrar de escrever a familia.
//
// FAIL-CLOSED: sem matriz, matriz ilegivel, matriz vazia ou sem git, o gate REPROVA dizendo
// que NAO julgou. "Nada a checar" nunca vira "esta tudo certo" (B2.3).

import path from "node:path";

/** Raizes que B1.2 nunca deixa entrar sob o app: o que e' GLOBAL do framework. */
export const RAIZES_GLOBAIS = [
  "tools/",
  "packages/",
  "config/",
  ".ai/",
  "docs/",
  "themes/",
  "modules/",
  ".githooks/",
  ".devcontainer/",
  "secrets/",
];

/**
 * Le' a matriz. O TOML e' parseado no subconjunto que a matriz usa (`[[family]]` + par
 * escalar ou array de string, inclusive multilinha) — uma dependencia de parser so' para
 * ler `nome = ["a", "b"]` seria peso sem funcao.
 * Devolve a lista de familias NA ORDEM do arquivo. Linha que nao casa vira ruido e o
 * chamador decide (o gate le' o texto de novo e reprova se houver `[[family]]` sem `name`).
 */
export function parseMatriz(texto) {
  const familias = [];
  let atual = null;
  let acumulando = null; // chave cujo array multilinha esta' aberto

  for (const linha of String(texto ?? "").split(/\r?\n/)) {
    const limpa = linha.replace(/#.*$/, "");
    if (acumulando) {
      // Fecha o array na linha em que o `]` aparece (a matriz escreve um item por linha).
      const fim = limpa.indexOf("]");
      if (fim >= 0) {
        atual[acumulando].push(...parseItens(limpa.slice(0, fim)));
        acumulando = null;
      } else {
        atual[acumulando].push(...parseItens(limpa));
      }
      continue;
    }
    if (!limpa.trim()) continue;
    if (/^\s*\[\[family\]\]\s*$/.test(limpa)) {
      atual = {};
      familias.push(atual);
      continue;
    }
    if (!atual) continue;
    const m = limpa.match(/^\s*([A-Za-z_-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const chave = m[1];
    const bruto = m[2].trim();
    if (bruto.startsWith("[")) {
      const fim = bruto.indexOf("]", 1);
      if (fim >= 0) {
        atual[chave] = parseItens(bruto.slice(1, fim));
      } else {
        atual[chave] = parseItens(bruto.slice(1));
        acumulando = chave;
      }
      continue;
    }
    if (bruto === "true" || bruto === "false") atual[chave] = bruto === "true";
    else atual[chave] = bruto.replace(/^["']|["']$/g, "");
  }
  return familias.filter((f) => typeof f.name === "string" && f.name);
}

/** Itens de um array TOML numa linha: `"a", "b"` (aspas simples ou duplas) → ['a','b']. */
function parseItens(trecho) {
  const itens = [];
  for (const m of String(trecho).matchAll(/"([^"]*)"|'([^']*)'/g)) itens.push(m[1] ?? m[2]);
  return itens;
}

/** Classifica UM caminho relativo (posix) contra a matriz. Pura: o teste nao precisa de disco. */
export function classify(familias, rel) {
  const base = path.posix.basename(rel);
  for (const fam of familias) {
    if (!casa(fam, rel, base)) continue;
    // `allowed` AUSENTE = sem limite de local (so' o `forbidden` manda); `allowed = []` e'
    // a forma de dizer `proibido em todo lugar` (o `core-in-app` do segtools usa assim).
    // Confundir os dois transformava `rootFile = true` (que nao declara `allowed`) numa
    // familia que reprovava TUDO.
    const allowed = fam.allowed;
    const forbidden = fam.forbidden ?? [];
    const proibido = forbidden.some((p) => rel.startsWith(p));
    const fora = Array.isArray(allowed) && !allowed.some((p) => rel.startsWith(p));
    if (proibido || fora) {
      return {
        family: fam.name,
        severity: fam.severity ?? "block",
        error:
          `familia '${fam.name}' no LOCAL errado` +
          (proibido ? ` (proibido em '${forbidden.join(", ")}')` : "") +
          (fora ? ` (permitido: '${allowed.join(", ")}')` : ""),
      };
    }
    return { family: fam.name, severity: fam.severity ?? "block", error: null };
  }
  return {
    family: null,
    severity: "block",
    error: "nao-classificado (adicione uma familia a matriz de colocacao de arquivo)",
  };
}

function casa(fam, rel, base) {
  const checks = [];
  if (fam.paths) checks.push(fam.paths.some((p) => rel.startsWith(p)));
  if (fam.ext) checks.push(fam.ext.some((e) => base.endsWith(e)));
  if (fam.nameBase) checks.push(fam.nameBase.includes(base.replace(/\.[^.]+$/, "")));
  if (fam.namePrefix) checks.push(fam.namePrefix.some((p) => base.startsWith(p)));
  if (fam.nameSuffix) checks.push(fam.nameSuffix.some((s) => base.endsWith(s)));
  if (fam.rootFile) checks.push(!rel.includes("/"));
  return checks.length > 0 && checks.every(Boolean);
}

/**
 * B1.2 — o caminho GLOBAL sob a raiz do APP. `app` e' a raiz declarada pelo consumidor
 * (default `apps/`): caminho dentro dela que recomeca por uma raiz global REPROVA.
 */
export function julgaGlobalSobApp(rel, app = "apps/") {
  const prefixo = app.endsWith("/") ? app : app + "/";
  if (!rel.startsWith(prefixo)) return null;
  const partes = rel.slice(prefixo.length).split("/").filter(Boolean);
  // `apps/<app>/<raiz-global>/...`: o primeiro segmento e' o app, o segundo a raiz global.
  const dentro = partes.slice(1).join("/");
  const achou = RAIZES_GLOBAIS.find((r) => dentro === r.slice(0, -1) || dentro.startsWith(r));
  if (!achou) return null;
  return {
    family: "global-sob-app",
    severity: "block",
    error:
      `familia 'global-sob-app' no LOCAL errado (B1.2): '${achou}' e' caminho GLOBAL do framework ` +
      `e nao mora sob '${app}' — o app CONSOME o global, nunca o hospeda`,
  };
}
