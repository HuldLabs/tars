// `tars adopt` — o ROTEIRO de adocao de um repo PRE-EXISTENTE (dev.19).
//
// POR QUE EXISTE: o `tars init` cria `.ai/tars.toml` minimo num repo que ja' nasceu, e o
// `tars sync` empurra o declarado — mas quem chega com um repo de anos nao sabe O QUE falta
// nem a ORDEM. O roteiro estava espalhado na cabeca de quem adotou o segtools (R3): aqui
// vira dado, um item por capacidade, com a linha de comando ao lado.
//
// SO' LEITURA (regra do dono): diagnostica e nomeia o comando de cada item. NUNCA altera
// nada — nem `.githooks/`, nem `core.hooksPath`, nem o manifesto. Quem altera e' o `tars
// sync`/`tars secrets init`, citados no roteiro e rodados pelo dono.
//
// O julgamento mora AQUI (R3); o `tars.mjs` so' despacha. As sondas reusam as primitivas do
// dono (`hooksPathOf`, `effectiveHooksPath`, `declaredGitHooks`, `OWNED`, `GIT_HOOKS`), para
// que o roteiro e o sync nunca divirjam sobre o que e' um hook do Tars.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  OWNED,
  GIT_HOOKS,
  declaredGitHooks,
  effectiveHooksPath,
  hooksPathOf,
  parseToml,
} from './tars-sync.mjs'

/** Le o `.ai/tars.toml` do projeto (vazio se ausente/ilegivel — o roteiro acusa o que falta). */
export function lerManifest(project) {
  const file = join(project, '.ai', 'tars.toml')
  if (!existsSync(file)) return { file, manifest: null }
  try {
    return { file, manifest: parseToml(readFileSync(file, 'utf8')) }
  } catch {
    return { file, manifest: null, ilegivel: true }
  }
}

/** `git` do projeto quando houver; fora de repo nao ha' hook nem `core.hooksPath` a julgar. */
function temGit(project) {
  return existsSync(join(project, '.git'))
}

/**
 * Os hooks do git FORA do Tars: arquivo que existe em `core.hooksPath` mas NAO traz a marca
 * de autoria do sync (`OWNED`). E' o hook manual que o `writeGitHooks` recusa sobrescrever —
 * o roteiro tem de ACUSA-LO antes de o dono rodar o sync e colher o erro.
 *
 * `preparado` e' o que o sync escreveria (o alvo declarado no `[gates]` + o gemeo
 * `prepare-commit-msg`); um arquivo alheio FORA desse alvo tambem entra (hook manual vivo que
 * o sync nem tentaria tocar).
 */
export function hooksAlheios(project, manifest) {
  if (!temGit(project)) return []
  const hp = effectiveHooksPath(project)
  const dir = join(project, hp)
  if (!existsSync(dir)) return []
  const alvos = new Set(GIT_HOOKS)
  // O `prepare-commit-msg` acompanha o `commit-msg` (o par e' uma coisa so', §writeGitHooks).
  if (declaredGitHooks(manifest ?? {}).includes('commit-msg')) alvos.add('prepare-commit-msg')
  const out = []
  for (const hook of [...alvos].sort()) {
    const file = join(dir, hook)
    if (!existsSync(file)) continue
    let corpo
    try {
      corpo = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!corpo.includes(OWNED)) out.push(`${hp}/${hook}`)
  }
  return out
}

/** Item do roteiro: `id` estavel, `estado` (`ok`|`falta`|`aviso`) e o COMANDO que fecha. */
function item(id, titulo, estado, detalhe, comando) {
  return { id, titulo, estado, detalhe, comando }
}

/**
 * Monta o roteiro de adocao — SO' LEITURA. Cada item declara o estado atual (o que ja' existe
 * no repo) e o comando que fecha o que falta; `falta` derruba o exit code, `aviso` nao.
 *
 * A ORDEM e' a de execucao: sem o manifesto nao ha' `[gates]` para declarar, e sem o
 * `core.hooksPath` ligado os hooks no disco nunca rodam (o git engole o commit calado).
 */
export function adopt({ project } = {}) {
  const root = resolve(project ?? process.cwd())
  const { file, manifest, ilegivel } = lerManifest(root)
  const itens = []

  // 1. Manifesto — a raiz de tudo: sem `.ai/tars.toml` o sync nao sabe o que puxar.
  const temManifesto = manifest !== null
  itens.push(
    item(
      'manifesto',
      '.ai/tars.toml (manifesto do consumidor)',
      temManifesto ? 'ok' : 'falta',
      temManifesto
        ? file.replace(`${root}/`, '')
        : ilegivel
          ? `.ai/tars.toml ilegivel: ${file}`
          : 'sem `.ai/tars.toml` — o sync nao tem o que puxar',
      'tars init',
    ),
  )

  // 2. Base do catalogo — o `.ai/base/` e o que o sync copia; sem lock nao ha' versao pinada.
  const temLock = existsSync(join(root, '.ai', 'tars.lock'))
  const temBase = existsSync(join(root, '.ai', 'base')) || temManifesto
  itens.push(
    item(
      'base',
      'base sincronizada do catalogo (.ai/base + .ai/tars.lock)',
      temManifesto && temBase ? (temLock ? 'ok' : 'aviso') : 'falta',
      !temManifesto
        ? 'depende do manifesto (item anterior)'
        : temLock
          ? 'tars.lock presente'
          : 'sem `.ai/tars.lock` — a versao do catalogo nao esta pinada',
      'tars sync',
    ),
  )

  // 3. Hooks do git + core.hooksPath — declarar o gate E' pedir o hook (TARS-BUG-4).
  const gits = declaredGitHooks(manifest ?? {})
  const hp = hooksPathOf(root)
  const usando = hp !== null || existsSync(join(root, '.githooks'))
  const alheios = hooksAlheios(root, manifest)
  const hooksEstado = !temManifesto || !gits.length
    ? 'falta'
    : alheios.length
      ? 'aviso'
      : hp === null
        ? 'falta'
        : 'ok'
  itens.push(
    item(
      'hooks',
      `hooks do git (.githooks + core.hooksPath) [${gits.length ? gits.join(', ') : 'nenhum gate declarado'}]`,
      hooksEstado,
      !gits.length
        ? 'nenhum `[gates].<hook git>` declarado no `.ai/tars.toml`'
        : alheios.length
          ? `hook MANUAL fora do Tars (sem a marca de autoria): ${alheios.join(', ')} — o sync nao sobrescreve; use \`tars sync --adopt <hook>\``
          : hp === null
            ? `core.hooksPath nao aponta para os hooks (${effectiveHooksPath(root)})`
            : `core.hooksPath=${hp}`,
      'tars sync (com --adopt <hook> quando houver hook manual)',
    ),
  )

  // 4. Gates locais do projeto — a politica que so' o consumidor tem (gate com `/` no nome).
  const locais = Array.isArray(manifest?.gates?.local) ? manifest.gates.local : []
  itens.push(
    item(
      'gates-locais',
      '[gates].local (gates do proprio projeto)',
      !temManifesto ? 'falta' : locais.length ? 'ok' : 'aviso',
      locais.length ? locais.join(', ') : 'nenhum gate local declarado — so` a base (aceitavel para adotar)',
      'declarar `[gates].local` no .ai/tars.toml',
    ),
  )

  // 5. Doutrinas do projeto (o par doutrina->gate->prova que o `tars doctor` cobra). A base
  // do catalogo ja' traz as do escopo `catalogo`; o projeto declara as SUAS em `[[doctrine]]`.
  const doutrinasProjeto = Array.isArray(manifest?.doctrine) ? manifest.doctrine.length : 0
  const temDoutrinas = existsSync(join(root, '.ai', 'doctrines.toml')) || doutrinasProjeto > 0
  itens.push(
    item(
      'doutrinas',
      'doutrinas do projeto ([[doctrine]] no .ai/tars.toml)',
      temManifesto ? (temDoutrinas ? 'ok' : 'aviso') : 'falta',
      doutrinasProjeto
        ? `${doutrinasProjeto} doutrina(s) [[doctrine]] declarada(s)`
        : 'sem doutrina propria — as do escopo `catalogo` ja` valem (rodar `tars doctor` para ver)',
      'tars doctor',
    ),
  )

  // 5b. LINHA DE BASE dos gates (B3.3): repo pre-existente ja' tem divida; sem a base o
  // primeiro commit reprova tudo e a saida vira o `--no-verify`. A base nomeia a divida velha
  // e o gate so' reprova o NOVO.
  const temLinhaBase = existsSync(join(root, '.ai', 'gates-baseline.json'))
  itens.push(
    item(
      'baseline',
      'linha de base dos gates (.ai/gates-baseline.json)',
      temManifesto ? (temLinhaBase ? 'ok' : 'aviso') : 'falta',
      temLinhaBase ? 'linha de base gravada — o gate reprova so` o que e` novo' : 'sem linha de base — a divida que ja` existe reprova o primeiro commit',
      'tars gates baseline',
    ),
  )

  // 6. Cofre de segredos — so' quando o repo tem segredo; o `[secrets]` do manifesto o declara.
  const temSecrets = manifest?.secrets != null && typeof manifest.secrets === 'object'
  itens.push(
    item(
      'secrets',
      '[secrets] (cofre cifrado do projeto)',
      temManifesto ? (temSecrets ? 'ok' : 'aviso') : 'falta',
      temSecrets ? 'tabela [secrets] declarada' : 'sem `[secrets]` — so` se o repo tiver segredo',
      temSecrets ? 'tars secrets check' : 'tars secrets init --refs <arquivo-de-refs>',
    ),
  )

  // 7. Memoria da camada de IA — o indice que o boot le (`.ai/memory/INDEX.md`).
  const temMemoria = existsSync(join(root, '.ai', 'memory'))
  const temIndice = existsSync(join(root, '.ai', 'memory', 'INDEX.md'))
  itens.push(
    item(
      'memoria',
      'memoria da camada .ai (.ai/memory/INDEX.md)',
      temMemoria ? (temIndice ? 'ok' : 'aviso') : 'aviso',
      temMemoria ? (temIndice ? '.ai/memory/INDEX.md presente' : 'pasta .ai/memory sem INDEX.md') : 'sem `.ai/memory/`',
      'tars memory audit (ou criar .ai/memory/INDEX.md)',
    ),
  )

  // 8. BACKLOG e HANDOFF — o par que o metodo cobra de repo que ja' anda (novo-repo §3/§7).
  const temBacklog = existsSync(join(root, 'BACKLOG.md'))
  const temHandoff = existsSync(join(root, 'HANDOFF.md'))
  itens.push(
    item(
      'backlog',
      'BACKLOG.md + HANDOFF.md (o par do metodo)',
      temBacklog && temHandoff ? 'ok' : 'aviso',
      [temBacklog ? 'BACKLOG.md' : 'falta BACKLOG.md', temHandoff ? 'HANDOFF.md' : 'falta HANDOFF.md'].join(' · '),
      'tars handoff check',
    ),
  )

  const falta = itens.filter((i) => i.estado === 'falta')
  const aviso = itens.filter((i) => i.estado === 'aviso')
  return { project: root, itens, falta, aviso, ok: falta.length === 0, hooksAlheios: alheios }
}

/** Uma linha por item: `ESTADO  id  titulo` + o detalhe e o comando abaixo. */
export function format({ project, itens, falta, aviso }, log = console.log) {
  log(`tars adopt — roteiro de adocao (SO' LEITURA) · ${project}`)
  const rotulo = { ok: 'OK', falta: 'FALTA', aviso: 'AVISO' }
  for (const i of itens) {
    log(`${rotulo[i.estado].padEnd(6)} ${i.id.padEnd(13)} ${i.titulo}`)
    if (i.detalhe) log(`       ${i.detalhe}`)
    if (i.estado !== 'ok') log(`       -> ${i.comando}`)
  }
  log(
    falta.length
      ? `\n${falta.length} item(ns) FALTANDO (${falta.map((i) => i.id).join(', ')}); ${aviso.length} aviso(s). Nada foi alterado — rode os comandos acima.`
      : `\nnenhum item faltando${aviso.length ? ` (${aviso.length} aviso(s))` : ''}. Nada foi alterado.`,
  )
}
