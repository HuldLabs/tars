// doutrina-operacao — a DOUTRINA DE OPERACAO DE HOST como DADO (B1.1 layout, B1.2 compose).
//
// Duas regras que ate' agora so' existiam na cabeca de quem escreveu o `compose up`:
//
//   B1.1 — o dado de um app mora em `/srv/<amb>/<app>/{data,conf}` (amb em `dev|stg|prod`).
//          Volume NOMEADO do Docker esconde o dado dentro do engine: backup, `du` e a
//          inspecao do host deixam de ver o arquivo, e ninguem sabe quanto ocupa nem onde
//          esta'. Por isso o bind mount e' a doutrina e o volume nomeado e' o defeito.
//
//   B1.2 — o AMBIENTE e' um PROJETO COMPOSE com `name: <app>-<amb>`; o `profiles:` do
//          compose NAO serve (profile nao muda topologia de armazenamento nem separa
//          projeto: `up` sem profile sobe a stack errada em silencio). Todo bind tem
//          `source:` — mount sem fonte e' volume anonimo, o dado orfao do host.
//
// ESTE MODULO E' DADOS: o `esquema` de cada regra e' o que a prova LITERAL do
// `.ai/doctrines.toml` reproduz (copiar o `exemplo` e ver reprovar). Nada aqui le' arquivo
// do projeto — quem le' o host e' o consumidor, que declara a doutrina com a propria fonte
// (`.ai/governance/doutrina-operacao.md`) e a propria prova (`linter --path /srv`).
import path from 'node:path'
import { readFileSync } from 'node:fs'

/** Ambientes validos do layout: o resto (`local`, `homolog`) e' apelido que ninguem resolve. */
export const AMBIENTES = ['dev', 'stg', 'prod']

/** `/srv/<amb>/<app>` exige um app; `/srv/dev`, `/srv/data` e `/srv` sozinho nao dizem de quem. */
export const APP_RE = /^[a-z][a-z0-9-]*$/

/**
 * B1.1 — o caminho esta' no layout? Julga o caminho do HOST (o `source:` do bind), nunca o
 * de dentro do container (o bind pode montar `/srv/dev/app/data` em `/app/data`).
 */
export function julgaLayout(caminho, { ambientes = AMBIENTES } = {}) {
  const c = String(caminho ?? '').trim()
  if (!c.startsWith('/')) return { ok: false, porque: `caminho relativo '${c}': o layout e' do host — comece com /srv` }
  const partes = c.split('/').filter(Boolean)
  const [srv, amb, app] = partes
  if (srv !== 'srv') return { ok: false, porque: `'${c}' esta' fora de /srv — o dado do app mora em /srv/<amb>/<app>/{data,conf}` }
  if (!amb || !ambientes.includes(amb)) return { ok: false, porque: `ambiente '${amb ?? '(vazio)'}' desconhecido (use ${ambientes.join('|')})` }
  if (!app) return { ok: false, porque: `'${c}': falta o <app> — organize por app, nao por tipo de dado` }
  if (!APP_RE.test(app)) return { ok: false, porque: `app '${app}' fora do padrao [a-z][a-z0-9-]*` }
  return { ok: true, amb, app, porque: `'${c}' esta' no layout` }
}

/**
 * B1.2 — a face do COMPOSE: nome do projeto e os binds declarados.
 *   nome  — `name: <app>-<amb>` (o ambiente e' o projeto; `profiles:` nao separa projeto)
 *   binds — cada `source:` (ou o volume longo `type: bind`) tem de estar no layout B1.1
 */
export function julgaCompose({ nome, binds = [], ambientes = AMBIENTES } = {}) {
  if (!nome) return { ok: false, porque: 'o compose nao declara `name: <app>-<amb>` — o projeto e a unidade do ambiente' }
  const m = String(nome).match(/^([a-z][a-z0-9-]*)-(dev|stg|prod)$/)
  if (!m) return { ok: false, porque: `name '${nome}' fora do padrao <app>-<amb> (ex.: nuc-prod)` }
  if (!ambientes.includes(m[2])) return { ok: false, porque: `ambiente '${m[2]}' desconhecido (use ${ambientes.join('|')})` }
  for (const b of binds) {
    // Sem `source:` o compose cria volume ANONIMO — o dado sai do layout e vira orfao.
    if (!b || !String(b.source ?? '').trim()) return { ok: false, porque: `servico '${b?.servico ?? '?'}': bind sem 'source:' — volume anonimo, o dado do host fica invisivel` }
    const l = julgaLayout(b.source, { ambientes })
    if (!l.ok) return { ok: false, porque: `${b.servico ?? '?'}: ${l.porque}` }
  }
  return { ok: true, app: m[1], amb: m[2], porque: `'${nome}' e' projeto <app>-<amb> com ${binds.length} bind(s) no layout` }
}

/** Caminho de dado (`/srv/<amb>/<app>` ou `/srv/<amb>/<app>/data`) — filtro do linter offline. */
export const CAMINHO_SRV = /\/srv\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/

/**
 * O guard EXIGE uma FONTE (-path, -source, -name, -h com o nome, ou --compose <arquivo>) —
 * quem audita decide o que auditar. O modo de EXEMPLO entra pelo `esquema`: a prova do
 * `.ai/doctrines.toml` reproduz o exemplo e exige reprovar.
 */
export function parseArgs(argv = []) {
  const valor = (nome) => (argv.includes(nome) ? argv[argv.indexOf(nome) + 1] : undefined)
  const amb = valor('--amb')
  return {
    raiz: valor('--path'),
    fonte: valor('--source'),
    nome: valor('--name'),
    compose: valor('--compose'),
    grep: argv.includes('-h') ? valor('-h') : valor('--grep'),
    str: valor('--str'),
    ambientes: amb ? amb.split(',').map((s) => s.trim()).filter(Boolean) : AMBIENTES,
    json: argv.includes('--json'),
  }
}

/** Uso: o linter NAO roda sem fonte — o default e' o erro, nao uma varredura silenciosa. */
export const USO =
  'uso: doutrina-operacao.mjs --path <raiz> | --source <dir> | --name <app-amb> | --compose <arquivo> | -g <nome> [-h <arquivo>] | --str <caminho>\n' +
  '  --path <raiz>     : audita o host sob a raiz (ex.: --path /srv no NUC)\n' +
  '  --source <dir>    : audita UM projeto compose (procura compose.y*ml dentro)\n' +
  '  --name <app-amb>  : julga o nome do projeto compose (ex.: --name nuc-prod)\n' +
  '  --compose <arq>   : julga um arquivo compose (name + binds)\n' +
  '  -g <nome> -h <arq>: procura o volume NOMEADO no compose (exit 1 se achar)\n' +
  '  --str <caminho>   : julga UM caminho contra o layout /srv/<amb>/<app>/{data,conf}\n' +
  '  --amb a,b         : ambientes validos (default dev,stg,prod)'

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const a = parseArgs(process.argv.slice(2))
  if (a.nome) {
    // Face B1.2 pelo nome do projeto: julga `<app>-<amb>` e reprova o apelido que nao diz o
    // ambiente (`local`, `homolog`). O julgamento completo (binds) exige o compose, que e' do
    // consumidor.
    const r = julgaCompose({ nome: a.nome, ambientes: a.ambientes })
    console.error(r.ok ? `OK ${r.porque}` : `FORA DO PADRAO (B1.2): ${r.porque}`)
    process.exit(r.ok ? 0 : 1)
  }
  if (a.json || a.raiz || a.source || a.compose) {
    // A varredura do host mora no CONSUMIDOR (o Tars nao tem host): aqui so' declaramos que
    // sem o linter do projeto instalado nao ha o que reprovar — falha alta nomeia o que falta.
    console.error(`doutrina-operacao: ${USO}\nO linter do host mora no consumidor (${a.raiz ?? a.source ?? a.compose}); o Tars traz a regra e a prova.`)
    process.exit(2)
  }
  if (a.str !== undefined) {
    const r = julgaLayout(a.str, { ambientes: a.ambientes })
    console.error(r.ok ? `OK ${r.porque}` : `FORA DO LAYOUT: ${r.porque}`)
    process.exit(r.ok ? 0 : 1)
  }
  if (a.grep) {
    // Prova de volume NOMEADO: achou a declaracao no compose => o dado esta' fora do /srv.
    const txt = a.raiz ? readFileSync(a.raiz, 'utf8') : ''
    console.error(`volume nomeado '${a.grep}' declarado em ${a.raiz ?? '(fontes)'} — o dado deve estar em bind /srv/<amb>/<app>`)
    process.exit(txt.includes(a.grep) ? 1 : 0)
  }
  console.error(USO)
  process.exit(2)
}
