// MODO LINHA DE BASE para ADOCAO — `tars gates baseline` (plano de release do Tars, item B3.3
// do eixo de gates: "zero resultado nao e' sucesso").
//
// O PROBLEMA QUE ISTO RESOLVE: adotar um gate num repo que JA' tem divida vira um "tudo
// vermelho" que ninguem conserta e todo mundo aprende a pular. O `--no-verify` nasce daqui.
// A linha de base grava as violacoes EXISTENTES num arquivo VERSIONADO (`.ai/gates-baseline.json`)
// e o gate passa a reprovar SO' o que NAO esta' na base — o commit novo paga a conta, a divida
// velha fica nomeada e visivel (`tars doctor` mostra o tamanho).
//
// RATCHET (a base so' ENCOLHE): violacao da base que sumiu e' removida na proxima gravacao — a
// divida nao pode voltar. Gravacao (`baseline`) so' acrescenta o que ja' estava reprovando;
// quem conserta nunca reabre. `--prune` tira da base o que ja' nao reprova.
//
// A CHAVE e' `arquivo:linha` + HASH DO TRECHO (nao o numero da linha sozinho): a linha anda
// quando outra pessoa edita o arquivo acima, e uma base por numero cru liberaria o achado
// errado (ou barraria o certo). O hash amarra a isencao ao CONTEUDO — mudou o trecho, a
// isencao cai e o gate volta a cobrar.
//
// NAO E' LUGAR DE ESCONDER VIOLACAO: a base e' dado versionado, revisado em PR como qualquer
// outro arquivo. Violacao NOVA nunca entra sozinha — so' pelo `baseline` explicito do dono.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { command, planGates, target } from './tars-hooks.mjs'
import { jsRuntime } from './tars-runtime.mjs'
import { parseToml } from './tars-sync.mjs'

/** O nome do arquivo, na raiz do projeto. Versionado de proposito (o diff e' a revisao). */
export const BASELINE_FILE = '.ai/gates-baseline.json'

/** Formato da base (v1). `findings` e' por GATE: `{ "<gate>": [{ key, hash }] }`. */
const VERSAO = 1

/** O hash do TRECHO isento — a ancora de conteudo (a linha sozinha nao basta). Pura. */
export function hashTrecho(trecho) {
  // `\r\n` normalizado: o mesmo trecho no Windows e no Linux tem de amarrar a MESMA isencao,
  // senao a base migra sozinha entre plataformas (a classe do incidente de paridade).
  return createHash('sha256').update(String(trecho).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)
}

/** A chave canonica de um achado: `arquivo:linha`. O gate pode emitir `arquivo:linha:col`. */
export function chaveDe(achado) {
  const s = String(achado).trim()
  const m = /^(.*?):(\d+)(?::\d+)?$/.exec(s)
  return m ? `${m[1]}:${m[2]}` : s
}

/** Le a base do disco. Ausente ou corrompida = base VAZIA (o gate cobra tudo — nunca o
 *  contrario: base ilegivel que isenta seria o verde falso). `{}` por gate ausente. */
export function lerBaseline(project) {
  const f = join(project, BASELINE_FILE)
  if (!existsSync(f)) return { versao: VERSAO, gates: {} }
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    if (!j || typeof j !== 'object' || typeof j.gates !== 'object' || j.gates === null) return { versao: VERSAO, gates: {} }
    return { versao: j.versao ?? VERSAO, gates: j.gates }
  } catch {
    return { versao: VERSAO, gates: {} }
  }
}

/** Grava a base (deterministica: gates e chaves ordenados — diff revisavel, sem ruido). */
export function gravarBaseline(project, base) {
  const gates = {}
  for (const nome of Object.keys(base.gates).sort()) {
    const itens = base.gates[nome] ?? []
    if (!itens.length) continue // gate sem divida nao entra: a base so' carrega o que existe
    gates[nome] = [...itens].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }
  const conteudo = JSON.stringify({ versao: VERSAO, gates }, null, 2) + '\n'
  mkdirSync(join(project, '.ai'), { recursive: true })
  writeFileSync(join(project, BASELINE_FILE), conteudo, 'utf8')
  return { caminho: join(project, BASELINE_FILE), gates: Object.keys(gates).length, itens: Object.values(gates).reduce((n, l) => n + l.length, 0) }
}

/** Os achados de UM gate, rodando-o em `--findings` (a saida `<arquivo>:<linha>` por linha,
 *  exit 0 mesmo com achado). Gate que nao conhece o modo devolve vazio — nao inventa isencao.
 *  `spawn` injetavel para o teste. */
export function achadosDoGate(gate, { project, hook = 'pre-commit', spawn = spawnSync } = {}) {
  const dir = target(project, hook, gate)
  if (!existsSync(dir)) return []
  const runtime = jsRuntime()
  if (!runtime) return []
  const cmd = command(dir, hook, runtime)
  if (!cmd) return []
  const r = spawn(cmd[0], [...cmd.slice(1), '--findings'], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, ...runtime.env, TARS_PROJECT: project, TARS_GATE: gate.nome },
  })
  if (r.status !== 0 || typeof r.stdout !== 'string') return []
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

/** Le a linha `arquivo:linha` do disco para amarrar o HASH do trecho. Erro ou arquivo sumido
 *  devolve '' — a isencao cai (o gate volta a cobrar), nunca o contrario. */
export function lerLinha(project, key) {
  const m = /^(.*?):(\d+)$/.exec(key)
  if (!m) return ''
  try {
    return readFileSync(join(project, m[1]), 'utf8').split(/\r?\n/)[Number(m[2]) - 1] ?? ''
  } catch {
    return ''
  }
}

/** Coleta os achados de TODOS os gates declarados no projeto (para o `baseline`). Le o
 *  manifesto (`.ai/tars.toml`) e roda cada gate no modo `--findings`; devolve, por gate,
 *  `{ achados, trechoDe }` — a forma que `consolidar`/`podar` esperam. */
export function coletarProjeto(project) {
  const manifest = lerManifesto(project)
  const coleta = {}
  for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) {
    for (const gate of planGates(manifest, hook)) {
      const achados = achadosDoGate(gate, { project })
      if (!achados.length) continue
      coleta[gate.nome] = { achados, trechoDe: (key) => lerLinha(project, key) }
    }
  }
  return coleta
}

/** O manifesto do projeto e' o `.ai/tars.toml` (mesma leitura do `tars hooks`). */
function lerManifesto(project) {
  const f = join(project, '.ai', 'tars.toml')
  if (!existsSync(f)) return { gates: {} }
  try {
    return parseToml(readFileSync(f, 'utf8'))
  } catch {
    return { gates: {} }
  }
}

/** Separa o que o gate achou em `novos` (reprova) x `isentos` (esta na base, com hash igual).
 *
 *  `achados` e' a lista `<arquivo>:<linha>`; `trechoDe` e' opcional e devolve o texto da linha
 *  para amarrar o hash. Sem `trechoDe`, o hash e' vazio e a isencao vale so' pela chave — modo
 *  degradado, nunca o default.
 *
 *  Pura: nao escreve nada. O gate decide o exit pelo `novos.length`. */
export function filtrarPorBase(achados, baseGate, { trechoDe = null } = {}) {
  const porChave = new Map((baseGate ?? []).map((i) => [i.key, i.hash ?? '']))
  const novos = []
  const isentos = []
  for (const a of achados) {
    const key = chaveDe(a)
    if (!porChave.has(key)) {
      novos.push(a)
      continue
    }
    const esperado = porChave.get(key)
    if (!trechoDe || !esperado) {
      isentos.push(a)
      continue
    }
    // O hash amarra a isencao ao CONTEUDO: o trecho mudou, a isencao cai e o gate cobra de novo.
    const atual = hashTrecho(trechoDe(key))
    if (atual === esperado) isentos.push(a)
    else novos.push(a)
  }
  return { novos, isentos, total: achados.length }
}

/** Consolida achados numa base por gate (para o `baseline`). `coletar` devolve, por gate,
 *  `{ achados: [<arquivo>:<linha>], trechoDe }` — quem sabe ler o trecho e' o gate. */
export function consolidar(coleta) {
  const gates = {}
  for (const [nome, { achados, trechoDe }] of Object.entries(coleta)) {
    gates[nome] = achados.map((a) => {
      const key = chaveDe(a)
      return { key, hash: trechoDe ? hashTrecho(trechoDe(key)) : '' }
    })
  }
  return { versao: VERSAO, gates }
}

/** RATCHET: tira da base o que ja' NAO reprova mais. A base so' encolhe — o conserto nao
 *  reabre a isencao, e a divida nao pode voltar pela porta dos fundos. Pura. */
export function podar(base, coleta) {
  const gates = {}
  for (const [nome, itens] of Object.entries(base.gates ?? {})) {
    const vivos = new Set((coleta[nome]?.achados ?? []).map(chaveDe))
    const restantes = (itens ?? []).filter((i) => vivos.has(i.key))
    if (restantes.length) gates[nome] = restantes
  }
  return { versao: VERSAO, gates }
}

/** O tamanho da divida por gate, para o `tars doctor` mostrar o que a base esconde. */
export function divida(project) {
  const base = lerBaseline(project)
  const linhas = Object.entries(base.gates)
    .map(([gate, itens]) => ({ gate, n: itens.length }))
    .sort((a, b) => b.n - a.n)
  return { linhas, total: linhas.reduce((s, l) => s + l.n, 0) }
}
