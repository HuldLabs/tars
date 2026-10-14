#!/usr/bin/env node
// Gera `tars-embedded.mjs` — o CATALOGO embutido no binario (`bun build --compile`).
//
// PORQUE EXISTE (fatia 2a, item 2 — "binario sem checkout"): o `dist/tars` e publicado
// como asset da release e como imagem OCI `FROM scratch` com SO' `/tars`. Nesse ambiente
// NAO ha' repo do Tars nem `TARS_HOME`: `findTars()` (que sobe do binario ate' achar
// `.ai/VERSION`) nao acha nada e `--version`/`doctor`/`sync --check` morriam com "nao achei
// a raiz do Tars". A saida e' EMBUTIR o catalogo no binario em tempo de build: o runtime o
// MATERIALIZA num diretorio de cache e passa a usa-lo como `TARS_HOME`.
//
// R3 (um lugar so'): o catalogo e' lido de `.ai/` + `templates/` — a MESMA fonte que o
// `sync` copia. Nada e' mantido em paralelo; este gerador so' SERIALIZA o que ja' existe.
//
// Uso:  node tools/framework/tars-embed-catalog.mjs [--tars <dir>] [--out <arquivo>]
//       (rodado por `task build:embed` / pelo workflow antes do `bun build --compile`)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const arg = (nome, def) => {
  const i = process.argv.indexOf(nome)
  return i === -1 ? def : process.argv[i + 1]
}

/** Areas do catalogo que o binario precisa para `sync`/`doctor`/`hooks`. Tudo, menos lixo. */
const AREAS = ['.ai', 'templates']
/** Nunca embutir: cache, lock e saida de build (nao sao asset; alguns sao do ambiente). */
const EXCLUI = [/^\.ai\/memory\/operational-memory\.jsonl$/, /\.sops$/, /(^|\/)\.DS_Store$/, /(^|\/)\.cache\//, /(^|\/)__pycache__\//]

/** Varre uma arvore devolvendo `caminho/relativo -> conteudo`, sempre com `/` (tars-paths). */
function varrer(raiz, base = raiz, out = {}) {
  for (const nome of readdirSync(join(raiz)).sort()) {
    const abs = join(raiz, nome)
    const rel = relative(base, abs).replace(/\\/g, '/')
    if (EXCLUI.some((re) => re.test(rel))) continue
    const st = statSync(abs)
    if (st.isDirectory()) varrer(abs, base, out)
    else if (st.isFile()) out[rel] = readFileSync(abs, 'utf8')
  }
  return out
}

export function gerar({ tars, out }) {
  const arquivos = {}
  for (const area of AREAS) {
    try {
      if (statSync(join(tars, area)).isDirectory()) varrer(join(tars, area), tars, arquivos)
    } catch {
      /* area ausente: segue (o catalogo pode nao ter `templates/`) */
    }
  }
  const version = readFileSync(join(tars, '.ai', 'VERSION'), 'utf8').trim()
  const modulo = `// GERADO por tars-embed-catalog.mjs — NAO edite a mao (rode \`task build:embed\`).
// O catalogo \`${version}\` embutido no binario (\`bun build --compile\`). O runtime o
// materializa num cache e passa a usa-lo como \`TARS_HOME\` quando nao ha' checkout.
export const VERSION = ${JSON.stringify(version)}
export const ARQUIVOS = ${JSON.stringify(arquivos, null, 0)}
`
  writeFileSync(out, modulo)
  return { version, total: Object.keys(arquivos).length, bytes: modulo.length }
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const tars = resolve(arg('--tars', process.env.TARS_HOME ?? join(HERE, '..', '..')))
  const out = resolve(arg('--out', join(HERE, 'tars-embedded.mjs')))
  const r = gerar({ tars, out })
  console.log(`embed: catalogo ${r.version} · ${r.total} arquivo(s) · ${(r.bytes / 1024).toFixed(0)} KiB -> ${out}`)
}
