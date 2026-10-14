#!/usr/bin/env node
// `tars` — o PONTO DE ENTRADA unico do Tars (docs/TARS.md §Agnóstico de runtime).
//
// Por que existe: o consumidor pode ser um repo SO Python (uv/venv, sem Node), e o README
// pedia `node <tars>/tools/framework/tars-sync.mjs`. Aqui nao ha logica nova (R3): o
// arquivo so' DESPACHA para o que ja' existe — `tars-sync.mjs` (init/sync/check),
// `tars-hooks.mjs` (nota de gates) e `tars-promote.mjs` (promocao). Este arquivo tambem e'
// o alvo do `bun build --compile`, e o binario roda sem Node instalado.
//
// Uso:
//   tars init [--tars <dir>] [--project <dir>]
//   tars sync [--check] [--adopt <hook>]... [--tars <dir>] [--project <dir>]
//   tars check [--tars <dir>] [--project <dir>]      # atalho de `sync --check`
//   tars hooks <pre-commit|commit-msg|pre-push|local> [args do hook...]
//   tars promote --area <memory|skill|gate> --item <nome> [--project <dir>] [--tars <dir>]
//   tars --help
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// Os donos de cada comando entram por import ESTATICO: o `bun build --compile` so' embute
// o que enxerga em tempo de build — `await import(join(home(), 'tars-sync.mjs'))` virava
// `/$bunfs/root/tars-sync.mjs` e o binario morria em runtime (Incident: dist/tars perde modulo).
// Este import vem PRIMEIRO e de proposito: ele marca `TARS_AS_MODULE`, que desliga os
// auto-run dos modulos DONOS (no `--compile` o import.meta.url de todo modulo embutido vira
// o do entrypoint, e o guard deles disparava o main no import — `--help` respondia `sync`).
import './tars-as-module.mjs'
import * as promote from './tars-promote.mjs'
import * as curationMod from './tars-curation.mjs'
import * as hooks from './tars-hooks.mjs'
import * as syncMod from './tars-sync.mjs'
import * as gitMod from './tars-git.mjs'
import * as doctorMod from './tars-doctrines.mjs'
import * as verifyMod from './tars-verify.mjs'
import * as memoryMod from './tars-memory.mjs'
import * as refsMod from './tars-check-refs.mjs'
import * as handoffMod from './tars-handoff.mjs'
import * as upgradeMod from './tars-upgrade.mjs'
// `tars gates baseline` (item B3.3 do eixo de gates): a linha de base da adocao — a divida
// velha fica nomeada e o gate so' reprova o que e' novo. O dono mora no modulo proprio.
import * as gatesBaselineMod from './tars-gates-baseline.mjs'
// `tars incident` (TARS-INCIDENTE-AUTO): o ledger deixa de ser escrito a mao. O modulo DONO
// mora em tars-incident.mjs; aqui so' o despacho fino (R3).
import * as incidentMod from './tars-incident.mjs'
// `tars secrets` (dev.9): o cofre do PROJETO, declarado em `[secrets]` do `.ai/tars.toml`.
// Como o doctor, o dono mora no modulo `tars-secrets.mjs`; aqui so' o despacho fino (R3).
import * as secretsMod from './tars-secrets.mjs'
// As operacoes do dia a dia (compare/fingerprint/set/copy/move/rm/scan/import) moram no
// modulo proprio e reusam as primitivas do dono — aqui so' se escolhe QUEM despacha (R3).
import * as secretsOps from './tars-secrets-ops.mjs'
// `tars acessos daneel` (fase 3 da identidade de automacao): GERA o inventario de acessos da
// Daneel. Read-only e sem valor de segredo; o julgamento mora no modulo dono (R3).
import * as acessosMod from './tars-acessos.mjs'
// `tars identity` (TARS-BUG-5): a identidade de automacao do projeto (chave SSH do bot,
// provision/revoke/verify). Reusa o cofre do `tars secrets`; o julgamento mora no modulo
// dono (R3) — aqui so' o despacho fino e a leitura de `[identity]`.
import * as identityMod from './tars-identity.mjs'
// `tars adopt` (dev.19): o ROTEIRO de adocao de repo pre-existente — SO' LEITURA. O
// julgamento mora no modulo dono (tars-adopt.mjs); aqui so' o despacho fino (R3).
import * as adoptMod from './tars-adopt.mjs'
// FATIA 2A: o catalogo EMBUTIDO no binario. O import ESTATICO e' o que faz o
// `bun build --compile` enxerga-lo e embutir (`tars-embedded.mjs` e' GERADO no build por
// `tars-embed-catalog.mjs`; ver `defaultTars`). So' `materializar` e' usado aqui.
import { materializar } from './tars-embedded-runtime.mjs'

// O `import.meta.url` do binario compilado aponta o modulo embutido; `process.execPath`
// cobre o resto. Em ambos os casos a base e' o IRMAO de `tars.mjs`.
const HERE = dirname(fileURLToPath(import.meta.url))
const COMPILED = fileURLToPath(import.meta.url).startsWith('/$bunfs/')

/** Sobe a partir de `start` ate' achar um repo do Tars (`.ai/VERSION`); `null` se nao houver. */
function findRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.ai', 'VERSION'))) return dir
    if (dirname(dir) === dir) return null
  }
}

// Quando COMPILADO, o modulo mora em `/$bunfs/root/...` — sem valor. A raiz do catalogo
// passa a ser o repo onde o BINARIO vive (`process.execPath`), subindo ate' achar `.ai/VERSION`.
// Ordem: `--tars` > `TARS_HOME` > este default > cwd (fonte). Sem ele, rodar o binario fora
// do repo do Tars morria com "nao achei a raiz do Tars" (Incident: dist/tars perde modulo).
//
// FATIA 2A (binario sem checkout): quando o binario NAO vive num checkout (asset da release,
// imagem `FROM scratch` com so' `/tars`), nao ha' repo acima dele. Cai no CATALOGO EMBUTIDO
// (`tars-embedded.mjs`, gerado em build): materializado no cache do usuario, vira o TARS_HOME.
function defaultTars() {
  if (!COMPILED) return null
  return findRoot(dirname(process.execPath)) ?? materializar()
}

const args = process.argv.slice(2)
const cmd = args[0] ?? '--help'

/** A raiz do CATALOGO, quando da' para saber: `TARS_HOME` > repo achado a partir do binario. */
function tarsHome() {
  if (process.env.TARS_HOME) return process.env.TARS_HOME
  const d = defaultTars()
  return d && !d.startsWith('/$bunfs/') ? d : null
}

/** Resolve o caminho base dos modulos: irmão do script ou do binario compilado. */
function home() {
  // `TARS_HOME` (docs/README) manda; senao o diretorio deste arquivo.
  const base = process.env.TARS_HOME ? join(process.env.TARS_HOME, 'tools', 'framework') : HERE
  return base
}

const USAGE = [
  'uso: tars <comando> [opcoes]',
  '',
  '  init                       cria .ai/tars.toml minimo e sincroniza o declarado',
  '  sync [--check]             puxa o declarado para .ai/base/ (--check: so valida)',
  '    --adopt <hook>           adota o hook do projeto (guarda o original em <hook>.bak); sem',
  '                             ele, hook sem a marca de autoria do Tars NAO e sobrescrito',
  '  check                      atalho de `sync --check` (o gate)',
  '  adopt [--json]             roteiro de adocao de repo PRE-EXISTENTE: lista o que falta e',
  '                             o comando de cada item (hooks, gates, baseline, secrets,',
  '                             memoria, doutrinas) e acusa hook manual fora do Tars.',
  '                             SO` LEITURA: diagnostica, nao altera (exit != 0 se falta algo).',
  '  hooks <hook> [args...]     roda os gates do hook (pre-commit|commit-msg|pre-push|local)',
  '  promote --area <> --item   sobe um item comprovado do projeto para o catalogo',
  '  curation [--advance --reviewed <r,..>] [--json]  rotina por PONTEIRO: le so` o delta de conhecimento',
  '                             (<ponteiro>..HEAD) dos repos vizinhos e lista o que andou',
  '  upgrade-notes [--from <>]  imprime as notas de upgrade entre a versao do lock e a atual',
  '  --version                  imprime a versao do Tars',
  '  doctor [--json]            confere doutrina x gate x prova (exit != 0 em PHANTOM/DRIFT)',
  '  gates baseline [--prune]   grava a LINHA DE BASE da adocao (.ai/gates-baseline.json): o',
  '                             gate reprova so` o que NAO esta` na base. `--prune` aplica o',
  '                             ratchet (tira o que ja` nao reprova — a base so` encolhe)',
  '  verify <arquivo>           roda os `verify` de um bloco de claims e cobra o `expect` (exit',
  '                             != 0 em PHANTOM/sem negativo/excesso de [ASSUMED]); `-` le stdin',
  '  check-refs <prompt.md>     cobra que a DECISAO citada no despacho exista na arvore: sha',
  '                             ancestral de HEAD e caminho presente (exit != 0 se invisivel)',
  '  handoff check [HANDOFF.md] valida a secao do TOPO (proximo passo, sha, data, branch no git;',
  '                             intencao opcional); exit != 0 quando o cursor esta morto',
  '  memory audit [--file]      cobra a FONTE de cada fato (arquivo/ancora/hash): reprova em',
  '                             MISSING, ancora ausente ou DRIFT do trecho; sem hash = aviso',
  '  incident add --titulo T    registra a falha no ledger de incidentes do PROJETO (id/data/repo',
  '    --o-que X --causa C        gerados; recusa campo vazio nomeando-o). Marca `recorrencia` e',
  '    --correcao R               imprime RECORRENTE: <ids> quando ja repetiu (>= 2 -> lembrete',
  '    [--tags a,b] [--fonte F]   de harness-postmortem). Tudo em uma linha so.',
  '',
  '  secrets init [--refs <f>]  monta o bloco [secrets] do .ai/tars.toml do arquivo de refs',
  '  secrets refresh            abre o cofre (1Password) e regrava o cache cifrado do projeto',
  '  secrets exec -- <cmd...>   roda <cmd> com o cache decifrado no env SO do filho (sem shell)',
  '  secrets check              julga chave/token/cache/recipient/ambiente SEM abrir o cofre',
  '  secrets rotate             DONO: gera a chave age nova, troca no cofre e recifra os',
  '                             versionados; retomavel por `<dir>/rotate.state`',
  '  secrets token set          DONO: troca o token da service account (lido do stdin oculto)',
  '  secrets compare <a> <b>    compara dois enderecos em tempo constante; imprime so` igual ou',
  '                             diferente (exit 0/1). Enderecos: op://cofre/item/campo, file:<cam>,',
  '                             env:<NOME> e cache:<NOME> (os dois ultimos so` como ORIGEM)',
  '  secrets fingerprint <a>    identidade PUBLICA de uma chave (recipient age / impressao SSH)',
  '  secrets set <op://...>     DONO: grava um valor no cofre (stdin oculto, --from-file 600 ou',
  '                             --from <endereco>); rele` e compara antes do ok',
  '  secrets copy|move <a> <b>  le`, grava e CONFIRMA; move so` apaga a origem apos o compare',
  '  secrets rm <a>             [s/N]: cofre ARQUIVA (--archive), file: apaga, env: tira a linha',
  '                             persistente (--em <arquivo> ou HKCU\\Environment no Windows)',
  '  acessos daneel             GERA o inventario de acessos da Daneel (--out <arquivo.md>): so',
  '                             nomes (cofres/campos/repos/hosts), nunca valor de segredo',
  '  acessos check [--out <f>]  TESTA cada acesso e compara com o inventario commitado;',
  '                             divergencia = drift (exit != 0)',
  '  identity show [--json]     IDENTIDADE de automacao do projeto: ator, ref do cofre,',
  '                             impressao PUBLICA da chave, hosts (nunca valor de segredo)',
  '  identity verify [--host H] confere chave (0600) x cofre x known_hosts (pinned) x',
  '                             autorizacao no host; read-only; exit != 0 no que faltar',
  '  identity provision         DONO (TTY): escreve a chave do bot (0600) a partir do cofre',
  '  identity revoke            DONO: apaga a chave local e NOMEIA os hosts a limpar',
  '  identity sign-setup        assinatura de commit por SSH: gpg.format/signingkey/',
  '                             allowedSignersFile no git do projeto; idempotente; --force',
  '',
  '  secrets scan [--onde X]    procura segredo em rc/profile, historico, transcripts, git',
  '                             (gitleaks) e templates; reporta so` arquivo:linha + o padrao',
  '  secrets import <env>       DONO: grava cada NOME=VALOR como campo do --item op://cofre/item',
  '  secrets exec -- <cmd...>   idem; fora de TTY (ou com --redact) a saida do filho e redigida',
  '',
  '  --help                     esta ajuda',
  '',
  'Opcoes comuns: --tars <dir> (raiz do catalogo), --project <dir> (raiz do consumidor).',
  'Sem Node instalado, e o que o binario compilado (`dist/tars`) responde.',
].join('\n')

/** Delegacao: importa o modulo DONO do comando e chama a funcao exportada (nada reimplementado). */
async function sync(action, rest, project) {
  const mod = syncMod
  const opts = {
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? mod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project),
  }
  if (action === 'init') return void (await mod.init(opts))
  const r = await mod.sync({ ...opts, check: rest.includes('--check'), adopt: argValues(rest, '--adopt') })
  if (rest.includes('--check')) {
    const bad = r.missing.length || r.stale.length || r.absent.length
    if (bad) {
      console.error('\nbase do Tars inconsistente (rode `tars sync`).')
      process.exit(1)
    }
    console.log('base do Tars ok.')
  }
}

async function runHooksCommand(rest, project) {
  const [hook, ...rawArgs] = rest
  if (!hook) throw new Error('falta o hook: use `tars hooks <pre-commit|commit-msg|prepare-commit-msg|pre-push|local> [args]`')
  const mod = hooks
  const { parseToml } = syncMod
  // `--project` tambem vale aqui: sem ele o repo consumidor so' era encontravel por TARS_PROJECT.
  // E sai da lista de args: eles vao inteiros para o gate (o `--project` nao e' do gate).
  const at = rawArgs.indexOf('--project')
  const hookArgs = at === -1 ? rawArgs : rawArgs.filter((_, i) => i !== at && i !== at + 1)
  let start = (at === -1 ? null : rawArgs[at + 1]) ?? project ?? process.env.TARS_PROJECT
  if (!start) {
    // O hook do GIT cai aqui: ele roda com o cwd do consumidor e nao exporta projeto nenhum
    // (incident 11/10: o `prepare-commit-msg` gerado pelo sync morria com "nao achei o
    // projeto"). O cwd E' o projeto quando tem manifesto; fora disso, erro alto como antes.
    if (existsSync(join(process.cwd(), '.ai', 'tars.toml'))) start = process.cwd()
  }
  if (!start) throw new Error('nao achei o projeto (use --project <dir> ou TARS_PROJECT=<dir>)')
  if (existsSync(join(start, 'tars.toml'))) start = dirname(start)
  const found = mod.findProject(start)
  const manifest = parseToml(readFileSync(found.file, 'utf8'))
  const r = mod.runHooks({ hook, manifest, project: found.project, args: hookArgs })
  process.exit(r.ok ? 0 : 1)
}

async function promoteCommand(rest, project) {
  const mod = promote
  const area = argValue(rest, '--area')
  const item = argValue(rest, '--item')
  if (!mod.AREA?.[area]) throw new Error(`use --area <memory|skill|gate> e --item <nome>`)
  if (!item) throw new Error('falta --item <nome>')
  await mod.AREA[area]({
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? mod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project),
    item,
  })
  console.log('promocao escrita no working tree do Tars (nao commitada: revise antes).')
}

/** `tars curation` — rotina por PONTEIRO (docs/CURATION.md): mede o delta, nao generaliza. */
async function curationCommand(rest, project) {
  const mod = curationMod
  const tars = resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? syncMod.findTars())
  const reposDir = resolve(argValue(rest, '--repos') ?? join(tars, '..'))
  const stateFile = resolve(argValue(rest, '--state') ?? join(tars, '.ai', 'curation.json'))
  const reviewed = (argValue(rest, '--reviewed') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const r = mod.curate({ reposDir, stateFile, reviewed, advance: rest.includes('--advance') })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else mod.report(r)
}

/** `tars git prune` — despacho fino para o modulo dono (nada de logica de git aqui). */
async function gitCommand(rest, project) {
  const sub = rest[0]
  if (sub !== 'prune') throw new Error(`use \`tars git prune [--remote] [--dry-run]\` (recebi '${sub ?? ''}')`)
  await gitMod.gitPrune({
    project: resolve(project ?? process.cwd()),
    remote: rest.includes('--remote'),
    dryRun: rest.includes('--dry-run'),
  })
}

/**
 * O modulo DONO do doctor e' carregado na HORA: o `import` estatico acima entra no bundle do
 * `bun build --compile` e, sem Node, um `./dist/tars doctor` antigo nao enxerga o modulo novo
 * (Incident: dist/tars perde modulo — a familia do import estatico). Em fonte e' identico; no
 * binario, o arquivo ao lado do executavel vence. Falha aqui (sem rede/arquivo) volta ao estatico.
 */
async function doctorModulo() {
  if (COMPILED && tarsHome()) {
    try {
      return await import(pathToFileURL(join(tarsHome(), 'tools', 'framework', 'tars-doctrines.mjs')).href)
    } catch {
      /* cai no estatico */
    }
  }
  return doctorMod
}

/** `tars doctor` — despacho fino para o modulo dono (a classificacao mora la', nao aqui). */
async function doctorCommand(rest, project) {
  const r = (await doctorModulo()).doctor({
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? syncMod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project ?? process.cwd()),
  })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else doctorMod.format(r)
  if (r.faltando.length) process.exit(1)
}

/**
 * `tars gates baseline [--prune] [--json]` — a LINHA DE BASE da adocao (item B3.3).
 *
 * Numa adocao a divida ja' existe: exigir tudo verde de uma vez vira o `--no-verify`. Aqui as
 * violacoes de HOJE vao para `.ai/gates-baseline.json` (versionado, por gate, `arquivo:linha` +
 * hash do trecho) e o gate passa a reprovar so' o que NAO esta' na base. `--prune` aplica o
 * ratchet: tira da base o que ja' nao reprova (a base so' encolhe).
 *
 * O que COLETA mora no modulo dono (`tars-gates-baseline.mjs`); aqui so' se despacha (R3).
 */
async function gatesCommand(rest, project) {
  const root = resolve(argValue(rest, '--project') ?? project ?? process.cwd())
  const coleta = gatesBaselineMod.coletarProjeto(root)
  if (rest.includes('--prune')) {
    const base = gatesBaselineMod.podar(gatesBaselineMod.lerBaseline(root), coleta)
    const r = gatesBaselineMod.gravarBaseline(root, base)
    if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
    else console.log(`tars gates: base podada — ${r.itens} isencao(oes) em ${r.gates} gate(s) (${r.caminho})`)
    return
  }
  const base = gatesBaselineMod.consolidar(coleta)
  const r = gatesBaselineMod.gravarBaseline(root, base)
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else {
    console.log(`tars gates: linha de base gravada — ${r.itens} violacao(oes) em ${r.gates} gate(s)`)
    console.log(`  ${r.caminho}`)
    console.log('  O gate reprova so` o que NAO esta` na base. Conserte e rode --prune (a base encolhe).')
  }
}

/** `tars verify <arquivo>` — despacho fino: o parser e o julgamento moram no modulo dono. */
async function verifyCommand(rest) {
  const mod = verifyMod
  const cwd = argValue(rest, '--cwd')
  const arquivo = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--cwd')[0]
  if (!arquivo) throw new Error('uso: tars verify <arquivo|-> [--cwd <dir>] [--json]')
  const r = mod.verify({
    caminho: arquivo === '-' ? null : resolve(arquivo),
    texto: arquivo === '-' ? readFileSync(0, 'utf8') : undefined,
    cwd: resolve(cwd ?? process.cwd()),
  })
  if (rest.includes('--json')) console.log(JSON.stringify({ ...r, claims: r.claims.map(({ saida, ...c }) => c) }, null, 2))
  else mod.format(r)
  if (r.falhas.length) process.exit(1)
}

/** `tars memory audit [--file <jsonl>] [--json]` — despacho fino (o julgamento mora no modulo dono). */
async function memoryCommand(rest, project) {
  const sub = rest[0]
  if (sub !== 'audit') throw new Error(`use \`tars memory audit [--file <jsonl>] [--json]\` (recebi '${sub ?? ''}')`)
  const raiz = resolve(project ?? process.env.TARS_PROJECT ?? process.cwd())
  const file = resolve(argValue(rest, '--file') ?? join(raiz, '.ai', 'memory', 'operational-memory.jsonl'))
  const r = memoryMod.auditMemory(file, { root: raiz })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else console.log(memoryMod.format(r))
  if (!r.ok) process.exit(1)
}

/** `tars incident add ...` — despacho fino: o julgamento mora no modulo dono (tars-incident). */
async function incidentCommand(rest, project) {
  const sub = rest[0]
  if (sub !== 'add') throw new Error(`use \`tars incident add --titulo T --o-que X --causa C --correcao R [--tags a,b] [--fonte F]\` (recebi '${sub ?? ''}')`)
  const raiz = resolve(project ?? process.env.TARS_PROJECT ?? process.cwd())
  // O ledger e' do PROJETO consumidor (`.ai/memory/incident-ledger.jsonl`), nunca o do catalogo.
  const file = resolve(argValue(rest, '--file') ?? join(raiz, '.ai', 'memory', 'incident-ledger.jsonl'))
  const r = incidentMod.incidentAdd({
    titulo: argValue(rest, '--titulo'),
    o_que: argValue(rest, '--o-que'),
    causa: argValue(rest, '--causa'),
    correcao: argValue(rest, '--correcao'),
    tags: argValue(rest, '--tags'),
    fonte: argValue(rest, '--fonte'),
    repo: argValue(rest, '--repo') ?? basename(raiz),
    hoje: argValue(rest, '--data') ?? new Date().toISOString().slice(0, 10),
    file,
  })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else console.log(incidentMod.format(r))
}

/** `tars check-refs <prompt.md|->` — despacho fino: o parse e o julgamento moram no modulo dono. */
async function checkRefsCommand(rest, project) {
  const cwd = argValue(rest, '--cwd')
  const arquivo = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--cwd')[0]
  if (!arquivo) throw new Error('uso: tars check-refs <prompt.md|-> [--cwd <dir>] [--json]')
  const r = refsMod.checkRefs(arquivo === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(arquivo), 'utf8'), {
    cwd: resolve(cwd ?? project ?? process.cwd()),
  })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else console.log(refsMod.format(r))
  if (!r.ok) process.exit(1)
}

/** `tars handoff check [HANDOFF.md]` — despacho fino: o julgamento mora no modulo dono. */
async function handoffCommand(rest, project) {
  const sub = rest[0]
  if (sub !== 'check') throw new Error(`use \`tars handoff check [HANDOFF.md] [--cwd <dir>] [--json]\` (recebi '${sub ?? ''}')`)
  const arquivo = rest.slice(1).filter((a, i, l) => !a.startsWith('--') && l[i - 1] !== '--cwd')[0]
  // O `cwd` do git e' o do PROJETO (o HANDOFF fala dos shas/branches do repo dele), nao o
  // de quem chamou: rodar o binario de dentro do Tars sobre o HANDOFF de outro repo tinha de
  // julgar o outro repo. Sem `--cwd`, o diretorio do proprio HANDOFF manda.
  const cwd = resolve(argValue(rest, '--cwd') ?? project ?? (arquivo ? dirname(resolve(arquivo)) : process.cwd()))
  const dias = argValue(rest, '--dias')
  const r = handoffMod.checkHandoff(resolve(arquivo ?? join(cwd, 'HANDOFF.md')), { cwd, dias: dias ? Number(dias) : undefined })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else console.log(handoffMod.format(r))
  if (!r.ok) process.exit(1)
}

/**
 * `tars secrets <refresh|exec|check>` — despacho fino: o julgamento mora no modulo dono. A
 * tabela `[secrets]` e' lida do `.ai/tars.toml` do PROJETO pelo parser do sync (R3: um
 * parser so'); a config resolvida e' que vai para o modulo.
 */
async function secretsCommand(rest, project) {
  const raiz = resolve(project ?? process.env.TARS_PROJECT ?? process.cwd())
  const file = join(raiz, '.ai', 'tars.toml')
  const tabela = existsSync(file) ? syncMod.parseToml(readFileSync(file, 'utf8')).secrets ?? {} : {}
  const cfg = secretsMod.lerConfig(tabela, { project: raiz })
  const sub = rest[0]
  // Dois donos, um despacho: o ciclo do cofre (refresh/check/rotate/token) fica no modulo
  // original; a manipulacao de segredo, no de operacoes. `exec` e' do segundo porque e' la'
  // que mora a REDACAO da saida do filho.
  const mod = secretsOps.SUBCOMANDOS.includes(sub) ? secretsOps : secretsMod
  const r = await mod.run({ sub, rest: rest.slice(1), cfg, tabela, em: argValue(rest, '--em') })
  if (r.saida) console.log(r.saida)
  process.exit(r.status ?? 0)
}

/** `tars acessos daneel|check` — despacho fino: o julgamento mora no modulo dono (tars-acessos). */
function acessosCommand(rest) {
  const mod = acessosMod
  const r = mod.runAcessos({ sub: rest[0], rest: rest.slice(1) })
  // `check` marca `ok:false` no retorno; o modulo ja' setou `process.exitCode = 1`.
  process.exit(r ? (r.ok === false ? 1 : 0) : 1)
}

/**
 * `tars identity show|verify|provision|revoke` (TARS-BUG-5): a identidade de automacao do
 * PROJETO. A tabela `[identity]` vem do `.ai/tars.toml` (o `bot` reusa a ref do cofre que o
 * `tars secrets` ja' conhece). O julgamento mora no modulo dono (tars-identity).
 */
function identityCommand(rest, project) {
  const raiz = resolve(argValue(rest, '--project') ?? project ?? process.env.TARS_PROJECT ?? process.cwd())
  const file = join(raiz, '.ai', 'tars.toml')
  const toml = existsSync(file) ? syncMod.parseToml(readFileSync(file, 'utf8')) : {}
  const cfg = toml.identity ?? {}
  // O `allowed_signers` e' o do cofre (mesma ref do `tars secrets`), lido da mesma tabela:
  // o sign-setup nao tem config propria (R3).
  const allowed_signers = toml.secrets?.allowed_signers ?? null
  const r = identityMod.runIdentity({
    sub: rest[0],
    rest: rest.slice(1),
    cfg: { ...cfg, raiz, allowed_signers },
  })
  process.exit(r && r.ok === false ? 1 : 0)
}

/** `tars adopt` — despacho fino: o roteiro (so' leitura) mora no modulo dono (tars-adopt). */
function adoptCommand(rest, project) {
  const r = adoptMod.adopt({ project: resolve(argValue(rest, '--project') ?? project ?? process.cwd()) })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else adoptMod.format(r)
  if (r.falta.length) process.exit(1)
}

/** Le o valor de `--nome <v>` da lista de rest (o mesmo `arg` dos scripts originais). */
function argValue(list, name) {
  const i = list.indexOf(name)
  return i === -1 ? null : list[i + 1]
}

/** Le TODOS os valores de `--nome <v>` (repetivel) — `--adopt` pode nomear varios hooks. */
function argValues(list, name) {
  const out = []
  for (let i = 0; i < list.length; i++) if (list[i] === name && list[i + 1]) out.push(list[i + 1])
  return out
}

/** `tars upgrade-notes [--from <>]` — as notas de upgrade do catalogo (modulo dono). */
async function upgradeCommand(rest, project) {
  const r = upgradeMod.upgradeNotes({
    tars: resolve(argValue(rest, '--tars') ?? process.env.TARS_HOME ?? defaultTars() ?? syncMod.findTars()),
    project: resolve(argValue(rest, '--project') ?? project ?? process.cwd()),
    from: argValue(rest, '--from'),
  })
  if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else upgradeMod.format(r)
  if (r.faltando) process.exit(1)
}

/** `tars --version` — a versao do catalogo (fonte: `package.json`). */
function versionCommand() {
  const tars = resolve(process.env.TARS_HOME ?? defaultTars() ?? syncMod.findTars())
  const v = syncMod.readVersion(tars)
  console.log(v ?? 'desconhecida')
}

/** Monta as funcoes de despacho por comando; `check` e' `sync` com `--check` forcado. */
const COMMANDS = {
  init: (rest, project) => sync('init', rest, project),
  sync: (rest, project) => sync('sync', rest, project),
  check: (rest, project) => sync('sync', [...rest, '--check'], project),
  adopt: adoptCommand,
  hooks: runHooksCommand,
  promote: promoteCommand,
  curation: curationCommand,
  doctor: doctorCommand,
  gates: gatesCommand,
  verify: verifyCommand,
  memory: memoryCommand,
  incident: incidentCommand,
  secrets: secretsCommand,
  acessos: acessosCommand,
  identity: identityCommand,
  'check-refs': checkRefsCommand,
  handoff: handoffCommand,
  'upgrade-notes': upgradeCommand,
  git: gitCommand,
}

async function main() {
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    versionCommand()
    return
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(USAGE)
    return
  }
  const handler = COMMANDS[cmd]
  // O gate roda `node .ai/gates/<nome>/gate.mjs`: esse argv[1] NAO e' nosso comando — sem este
  // guarda o `TARS_GATE` (posto pelo `runHooks`) faria o CLI tentar despachar o caminho do gate.
  if (!handler && !process.env.TARS_GATE) throw new Error(`comando desconhecido: '${cmd}' (use ${Object.keys(COMMANDS).join(' | ')})`)
  if (!handler) return
  // Sem `--project` e sem TARS_PROJECT: quando rodado como CLI o padrao e' o cwd; importado
  // como biblioteca nao ha projeto implicito (o cwd ali e' o do runner de teste).
  const asCli = COMPILED || (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  await handler(args.slice(1), process.env.TARS_PROJECT ?? (asCli ? process.cwd() : undefined))
}

// Executa so' quando chamado como processo (import num teste nao dispara o despacho).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    await main()
  } catch (err) {
    console.error(`tars ${cmd}: ${err.message}`)
    process.exit(1)
  }
}

export { COMMANDS, USAGE, argValue, main }
