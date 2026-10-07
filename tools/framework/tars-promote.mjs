#!/usr/bin/env node
// `tars promote` — sobe UM item comprovado num projeto consumidor para o CATALOGO do
// Tars (docs/TARS.md §Memoria em duas camadas / §Fatias 5). E' o caminho inverso do
// `tars-sync.mjs` (que PUXA do catalogo): aqui a origem e' o projeto e o destino e' o
// Tars. Mora no repo do Tars porque escreve no catalogo dele — o projeto consumidor
// so' aponta para ca'.
//
// Escopo desta fatia (o que a issue pede):
//   * FATIA 1 — fato de memoria e skill. Um fato VIRA o arquivo `memory/agent/<name>.md`
//     (a forma da camada base, TARS-MEM-2): derivado do `statement`/`description` do
//     projeto, com frontmatter minimo. O projeto e' a fonte do TEXTO, nao do arquivo.
//   * FATIA 2 — gate local (`[gates].local` do manifesto), que vira `gates/<nome>/`
//     com `GATE.md` minimo para o dono completar (ver cabecalho de `promote`).
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTars, readManifest } from './tars-sync.mjs'

// ---------------------------------------------------------------------------
// Memoria: os DOIS formatos do repo (a mesma fonte neutra do `ai-memory.mjs`)
// ---------------------------------------------------------------------------
// 1. `agent/<name>.md` — frontmatter `name`/`description` (a forma dos fatos curados).
// 2. `operational-memory.jsonl` — uma entrada por linha, com `id` (`mem-<slug>`).
export async function loadMemory(project, item) {
  const dir = join(project, '.ai', 'memory')
  const agentFile = join(dir, 'agent', item.endsWith('.md') ? item : `${item}.md`)
  if (existsSync(agentFile)) {
    const raw = await readFile(agentFile, 'utf8')
    const { meta, body } = splitFrontmatter(raw)
    return { kind: 'agent', name: meta.name ?? basename(agentFile, '.md'), description: meta.description ?? '', body }
  }
  // Sem o `mem-` explicito a busca e' pelo `id` inteiro: `pendencia-ortografica` nao
  // acharia `mem-pendencia-ortografica-...` se o prefixo fosse implicito.
  const id = /^mem-/.test(item) ? item : `mem-${item}`
  const jsonl = join(dir, 'operational-memory.jsonl')
  if (existsSync(jsonl)) {
    for (const line of (await readFile(jsonl, 'utf8')).split('\n')) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      if (e.id === item || e.id === id) {
        return { kind: 'jsonl', name: id, description: e.statement ?? '', body: entryBody(e) }
      }
    }
  }
  throw new Error(
    `item de memoria '${item}' nao existe em ${relative(project, dir)}: ` +
      `procurado em agent/${item}.md e como '${id}' em operational-memory.jsonl`,
  )
}

/** Frontmatter YAML simples (`name`/`description`; o resto ignora) + corpo. */
export function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { meta, body: m[2] }
}

/** Corpo do fato a partir da entrada JSONL (o que e' util sem ser a linha crua). */
function entryBody(e) {
  return [
    e.statement ?? '',
    '',
    `**Why:** promovido da memoria operacional de \`scope: ${e.scope}\` (${e.ts}).`,
    `**How to apply:** ${e.durability === 'durable' ? 'fato durável' : 'fato efêmero'} — confirme a prova em \`source_refs\` antes de aplicar.`,
  ].join('\n')
}

/** Namespace do fato no catalogo: sem `id` o id de origem carrega o repo dele. */
const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

/** Arquivo do fato no catalogo: `memory/agent/<name>.md` (LAYOUT do tars-sync). */
export const memoryDest = (tars, fact) => join(tars, '.ai', 'memory', 'agent', `${fact.name}.md`)

export function renderMemory(fact) {
  return `---\nname: ${fact.name}\ndescription: ${fact.description.replace(/\s+/g, ' ').trim()}\n---\n\n${fact.body.trim()}\n`
}

/**
 * Fato (memoria) do projeto -> catalogo do Tars.
 *
 * Formato do arquivo (decisao desta fatia, revisavel pelo dono): `memory/agent/<name>.md`
 * com frontmatter minimo `name`/`description` — a MESMA forma que o `tars sync` copia
 * para `.ai/base/memory/agent/`, entao a base ja' entra pronta para o `ai-memory` ler.
 * Difere do `seed-agent` do `ai-memory.mjs` (JSONL com statement+source_refs e prosa
 * fixa de "the memory index"): aqui o item promovido e' um FATO curado, nao um seed.
 */
export async function promoteMemory({ project, tars, item, log = console.log }) {
  const fact = await loadMemory(project, item)
  const dest = memoryDest(tars, fact)
  if (existsSync(dest)) throw new Error(`ja' existe no Tars: ${relative(tars, dest)} (promocao nao sobrescreve; revise a mao)`)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, renderMemory(fact))
  log(`promove memoria/${fact.name}: ${relative(project, join(project, '.ai', 'memory'))} -> ${relative(tars, dest)}`)
  return { area: 'memory', item: fact.name, dest }
}

// ---------------------------------------------------------------------------
// Skill: a pasta inteira sobe como esta'
// ---------------------------------------------------------------------------
export const skillSrc = (project, name) => join(project, '.ai', 'skills', name)

export async function promoteSkill({ project, tars, item, log = console.log }) {
  const src = skillSrc(project, item)
  if (!existsSync(src)) throw new Error(`skill '${item}' nao existe em ${relative(project, src)}`)
  const dest = join(tars, '.ai', 'skills', item)
  if (existsSync(dest)) throw new Error(`ja' existe no Tars: ${relative(tars, dest)} (promocao nao sobrescreve; revise a mao)`)
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest, { recursive: true })
  log(`promove skills/${item}: ${relative(project, src)} -> ${relative(tars, dest)}`)
  return { area: 'skills', item, dest }
}

// ---------------------------------------------------------------------------
// Gate local: `[gates].local` do manifesto -> `gates/<nome>/` com GATE.md minimo
// ---------------------------------------------------------------------------
/**
 * Projeto que NAO declara `[gates].local` nao tem gate local: promove-lo e' engano
 * (o item nao esta' em uso la'). Caminho declarado que nao existe tambem falha — a
 * mesma falha RUIDOSA do sync quando o item declarado nao esta' la'.
 */
export async function resolveLocalGate(project, manifest, name) {
  const declared = (manifest?.gates?.local ?? []).map((p) => String(p).replace(/^\.\//, ''))
  const wanted = declared.find((p) => basename(p, extname(p)) === name)
  if (!wanted) {
    throw new Error(
      `gate local '${name}' nao esta' em [gates].local do .ai/tars.toml` +
        (declared.length ? ` (declarados: ${declared.join(', ')})` : ' (nenhum gate local declarado)'),
    )
  }
  const src = join(project, wanted)
  if (!existsSync(src)) throw new Error(`gate local '${name}' declarado como '${wanted}' e' inexistente em ${relative(project, src)}`)
  return { src, declared: wanted }
}

const extname = (p) => {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i) : ''
}

/** Nome do gate no catalogo: o arquivo declarado SEM extensao (a pasta e' o item). */
export const gateName = (declared) => basename(declared, extname(declared))

export function renderGateDoc(name, declared) {
  return [
    `# gate: ${name}`,
    '',
    'Promovido de um projeto consumidor (`[gates].local`). A FICHA abaixo e´ o contrato do',
    'catalogo — o dono completa o que ficou em branco antes do gate entrar em uso.',
    '',
    '## O que cobra',
    '',
    'TODO (dono): descreva em uma frase o que este gate impede.',
    '',
    '## Em que hook',
    '',
    `TODO (dono): declare em \`[gates]\` do \`.ai/tars.toml\` dos consumidores (\`pre-commit\` | \`pre-push\`).`,
    '',
    '## Stacks',
    '',
    '`any` TODO (dono): ajuste para `any` | `ts` | `python`.',
    '',
    '## Parametros',
    '',
    `TODO (dono): os parametros vem do config do projeto (\`[gates.params.${name}]\`).`,
    '',
    '## Adaptador no projeto',
    '',
    `Vestigio da declaracao de origem: \`${declared}\`.`,
    '',
  ].join('\n')
}

export async function promoteGate({ project, tars, item, log = console.log }) {
  const manifest = await readManifest(project)
  const { src, declared } = await resolveLocalGate(project, manifest, item)
  const name = gateName(declared)
  const dest = join(tars, '.ai', 'gates', name)
  if (existsSync(dest)) throw new Error(`ja' existe no Tars: ${relative(tars, dest)} (promocao nao sobrescreve; revise a mao)`)
  await mkdir(dest, { recursive: true })
  await cp(src, join(dest, basename(src)))
  await writeFile(join(dest, 'GATE.md'), renderGateDoc(name, declared))
  log(`promove gates/${name}: ${declared} -> ${relative(tars, dest)} (GATE.md a completar)`)
  return { area: 'gates', item: name, dest }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const AREA = { memory: promoteMemory, skill: promoteSkill, gate: promoteGate }

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

// `TARS_AS_MODULE` desliga o auto-run quando o `tars.mjs` importa o modulo no modo
// `bun build --compile` (la o import.meta.url de todo modulo embutido vira o do entrypoint).
if (!process.env.TARS_AS_MODULE && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const area = arg('--area')
  const item = arg('--item')
  try {
    if (!AREA[area]) throw new Error(`use --area <${Object.keys(AREA).join('|')}> e --item <nome>`)
    if (!item) throw new Error('falta --item <nome>')
    await AREA[area]({
      tars: resolve(arg('--tars') ?? findTars()),
      project: resolve(arg('--project') ?? process.cwd()),
      item,
    })
    console.log('promocao escrita no working tree do Tars (nao commitada: revise antes).')
  } catch (err) {
    console.error(`tars promote: ${err.message}`)
    process.exit(1)
  }
}
