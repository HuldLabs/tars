#!/usr/bin/env node
// `tars identity` — a IDENTIDADE de automacao do projeto: qual chave SSH, quem a
// autoriza, como provisionar e como revogar (TARS-BUG-5 / END-CLI-1, 14/10).
//
// PORQUE EXISTE: o Endurance trava a v0.1.0 no `tars identity` (docs/decisoes-20260810
// §Sequence/§SSH). A doutrina e' "as features `secrets`/`signing` sao FINAS: instalam o
// `tars`, montam o volume e chamam `tars secrets …`/`tars identity …`; logica propria de
// identidade no consumidor e' DEFEITO". Hoje nao ha' de onde chamar — o consumidor
// reinventa a chave do bot (caminho fixo, autorizacao a mao, revogacao no escuro).
//
// R1 (o que ja' existia): o `tars secrets` ja' tem o bot no cofre (`[secrets].bot`), o
// `fingerprintDe` (impressao PUBLICA de chave) e o `spawnOp`. Aqui NAO se reinvents nada
// disso: a identidade LE' o bot do cofre pela mesma porta e so' formata/verifica.
//
// GARANTIAS:
//   1. NUNCA imprime VALOR de chave (nem privada, nem do cofre): `show` só a impressao
//      PUBLICA; a saida passa por `assertSemSegredo` (a mesma lista do pre-commit).
//   2. `provision`/`revoke` são DONO (TTY): escrevem chave/`authorized_keys`. Fora de TTY
//      recusam — automacao nao gera identidade sozinha.
//   3. `verify` é READ-ONLY e serve o `doctor`/postCreate: confere que a chave existe, o
//      bit está 0600, a impressão casa com o cofre e o `authorized_keys` do host autoriza
//      (por `ssh -o BatchMode=yes`), sem nunca mostrar o segredo.
//
// Escopo desta fatia (P0): `show`, `verify`, `provision`, `revoke`. O `tars identity rename`
// e a rotacao agendada ficam registrados como dívida nomeada no BACKLOG.
//
// Uso:
//   tars identity show [--json]          imprime a identidade (nomes/impressões, nunca valor)
//   tars identity verify [--host H]      confere chave x cofre x autorizacao no host (read-only)
//   tars identity provision [--out F]    DONO: escreve a chave do bot (0600) a partir do cofre
//   tars identity revoke [--host H]      DONO: revoga (apaga a chave local; lembra o host)
//   node tools/framework/tars-identity.mjs show
//
// Testes rodam SEM REDE/cofre: `op`/`ssh`/`ssh-keygen` são injetados (o default fala com o
// mundo de verdade). Ver `tars-identity.test.mjs`.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertSemSegredo } from './tars-acessos.mjs'
import { fingerprintDe } from './tars-secrets-ops.mjs'

/** Os escopos da identidade: a do PROJETO (cofre) ou a da MAQUINA (gerada local). */
export const ESCOPOS = ['bot', 'owner']

/**
 * A impressão de host SSH conhecida (pinned `known_hosts`) — o Endurance proibe TOFU na LAN
 * (`decisoes-20260808` §SSH). Ausente = `verify` avisa, nunca falha calado.
 */
export function lerKnownHosts(arquivo, { fs = { existsSync, readFileSync } } = {}) {
  if (!arquivo || !fs.existsSync(arquivo)) return null
  const linhas = fs
    .readFileSync(arquivo, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  const hosts = new Set()
  for (const l of linhas) {
    const partes = l.split(/\s+/)
    if (partes.length >= 3) for (const h of partes[0].split(',')) hosts.add(h)
  }
  return hosts
}

/**
 * A identidade do PROJETO: quem e' (impressao publica), de onde vem (ref no cofre), onde
 * mora (chave local) e quem autoriza (hosts). Montada a partir do que o consumidor declara
 * em `[identity]` do `.ai/tars.toml`; campo ausente vira `null`, nunca inventado.
 */
export function montarIdentidade({ cfg = {}, keyFile = null, chaveDisponivel = false, impressao = null } = {}) {
  return {
    actor: cfg.actor ?? null,
    origem: cfg.bot ?? null, // ref `op://` do cofre (a ref, nunca o valor)
    chave: keyFile,
    chave_disponivel: chaveDisponivel,
    impressao, // só a pública: `SHA256:... comment` ou `age1...`
    hosts: cfg.hosts ?? [],
    hosts_autorizados: cfg.hosts_autorizados ?? [], // declarados no manifesto (prova por host)
  }
}

/** Render honesto: campo ausente vira `(nao declarado)`, nunca um inventario mentiroso. */
export function renderIdentidade(id) {
  const ou = (v) => (v === null || v === undefined || v === '' ? '(nao declarado)' : v)
  const lista = (v) => (v.length ? v.join(', ') : '(nenhum)')
  return [
    `# Identidade do projeto (gerada por \`tars identity\`)`,
    '',
    `- ator: ${ou(id.actor)}`,
    `- origem no cofre: ${ou(id.origem)}`,
    `- chave: ${ou(id.chave)}${id.chave ? ` (${id.chave_disponivel ? 'presente' : 'AUSENTE'})` : ''}`,
    `- impressao publica: ${ou(id.impressao)}`,
    `- hosts: ${lista(id.hosts)}`,
    `- hosts autorizados (declarado): ${lista(id.hosts_autorizados)}`,
    '',
  ].join('\n')
}

/**
 * `verify` — READ-ONLY: a identidade declarada CONFERE com a realidade? Julga 4 coisas:
 *   1. a chave existe e e' 0600 (chave de grupo/outro le' = falha);
 *   2. a impressao publica casa com a do cofre (o bot nao foi trocado sob os pes);
 *   3. o `known_hosts` cobre cada host declarado (sem TOFU);
 *   4. o `authorized_keys` do host autoriza (via `ssh -o BatchMode=yes true`).
 * Devolve `{ ok, itens }`; cada item nomeia o que faltou (R4: falha alta, nada calado).
 */
export function verify({ id, sshDeHost = () => ({ ok: false, out: 'sem sonda' }), knownHosts = null } = {}) {
  const itens = []
  if (!id.chave) itens.push({ nome: 'chave declarada', ok: false, motivo: 'nenhuma chave em [identity].key_file' })
  else if (!id.chave_disponivel) itens.push({ nome: 'chave presente', ok: false, motivo: `${id.chave} nao existe` })
  else itens.push({ nome: 'chave presente', ok: true })

  if (id.chave && id.chave_disponivel) {
    try {
      const modo = statSync(id.chave).mode & 0o777
      const restrito = (modo & 0o077) === 0
      itens.push({ nome: 'bit 0600', ok: restrito, motivo: restrito ? undefined : `modo ${modo.toString(8)} permite grupo/outro` })
    } catch (e) {
      itens.push({ nome: 'bit 0600', ok: false, motivo: e.message })
    }
  }

  if (!id.impressao) itens.push({ nome: 'impressao publica', ok: false, motivo: 'nao derivei a publica (cofre indisponivel?)' })
  else if (!id.origem) itens.push({ nome: 'impressao publica', ok: false, motivo: 'sem ref `op://` do bot para comparar' })
  else itens.push({ nome: 'impressao publica', ok: true, motivo: id.impressao })

  for (const h of id.hosts) {
    if (!knownHosts) {
      itens.push({ nome: `known_hosts:${h}`, ok: false, motivo: 'sem known_hosts (TOFU proibido na LAN)' })
    } else if (!knownHosts.has(h)) {
      itens.push({ nome: `known_hosts:${h}`, ok: false, motivo: `${h} nao esta' fixado` })
    } else {
      itens.push({ nome: `known_hosts:${h}`, ok: true })
    }
    const r = sshDeHost(h)
    itens.push({ nome: `ssh:${h}`, ok: r.ok, motivo: r.ok ? undefined : `${h}: ${r.out}` })
  }
  return { ok: itens.every((i) => i.ok), itens }
}

/** Sonda default do host: `ssh -o BatchMode=yes -o ConnectTimeout=10 <h> true`. */
export function sshDeHostDefault(host, { env = process.env, spawn = spawnSync } = {}) {
  const r = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'true'], {
    encoding: 'utf8',
    timeout: 15000,
    env,
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-1)[0] ?? ''
  return { ok: r.status === 0, out: out || `exit ${r.status}` }
}

/**
 * O `op read` do bot: devolve o VALOR so' para uso interno (fingerprint/escrita), NUNCA
 * ecoado. Injetavel para o teste rodar sem cofre.
 */
export function botDeCofre(ref, { op = null, env = process.env } = {}) {
  if (!ref) return null
  if (op) return op(ref)
  const r = spawnSync('op', ['read', ref], { encoding: 'utf8', timeout: 20000, env })
  if (r.status !== 0) return null
  return r.stdout.replace(/\r?\n$/, '')
}

/**
 * `provision` — DONO (TTY): escreve a chave do bot (0600) a partir do cofre. Fora de TTY
 * recusa: automacao nao gera identidade sozinha (a doutrina e' a feature FINA chamar isto).
 */
export function provision({ id, valor, tty = process.stdin.isTTY, fs = { existsSync, writeFileSync, mkdirSync } } = {}) {
  if (!tty) throw new Error('tars identity provision: comando do DONO (TTY) — automacao nao gera identidade')
  if (!id?.chave) throw new Error('provision: [identity].key_file nao declarado no .ai/tars.toml')
  if (!valor) throw new Error(`provision: o cofre (${id.origem ?? 'sem ref'}) nao devolveu a chave`)
  fs.mkdirSync(dirname(id.chave), { recursive: true })
  fs.writeFileSync(id.chave, valor.endsWith('\n') ? valor : valor + '\n', { mode: 0o600 })
  return { escrito: id.chave, modo: '0600' }
}

/**
 * `revoke` — DONO: apaga a chave local e NOMEIA o host onde a `authorized_keys` ainda a
 * carrega (o humano remove la'; o Tars nao escreve no host de terceiro sem ordem — doutrina
 * `nada-em-prod-sem-ordem`). Nunca promete revogacao remota que nao fez.
 */
export function revoke({ id, fs = { existsSync, rmSync } } = {}) {
  if (!id?.chave) throw new Error('revoke: [identity].key_file nao declarado')
  const existia = fs.existsSync(id.chave)
  if (existia) fs.rmSync(id.chave, { force: true })
  return {
    removido: existia ? id.chave : null,
    pendente_nos_hosts: id.hosts ?? [],
    aviso: 'remova a linha correspondente do `authorized_keys` em cada host (o Tars nao escreve no host sem ordem)',
  }
}

/** Monta a identidade a partir do manifesto + disco + cofre (o efeito, isolado do CLI). */
export function carregarIdentidade({ cfg = {}, op = null, env = process.env, fs = { existsSync, readFileSync } } = {}) {
  const keyFile = cfg.key_file ?? null
  const chaveDisponivel = Boolean(keyFile && fs.existsSync(keyFile))
  const valor = botDeCofre(cfg.bot, { op, env })
  let impressao = null
  try {
    if (valor) impressao = fingerprintDe(valor).identidade
    else if (chaveDisponivel) impressao = fingerprintDe(fs.readFileSync(keyFile, 'utf8')).identidade
  } catch {
    impressao = null // chave ilegivel/cofre mudo: verify nomeia, nao estoura
  }
  return montarIdentidade({ cfg, keyFile, chaveDisponivel, impressao })
}

/** O CLI. `deps` permite ao teste injetar `op`/`ssh`/`fs` sem cofre nem rede. */
export function runIdentity({ sub, rest = [], cfg = {}, deps = {}, env = process.env, log = console.log } = {}) {
  const id = carregarIdentidade({ cfg, op: deps.op, env, fs: deps.fs })
  const saida = (texto) => {
    assertSemSegredo(texto)
    return texto
  }
  if (sub === 'show' || !sub) {
    const texto = rest.includes('--json') ? JSON.stringify(id, null, 2) + '\n' : renderIdentidade(id)
    log(saida(texto))
    return id
  }
  if (sub === 'verify') {
    const idHost = rest.indexOf('--host')
    const hosts = idHost === -1 ? id.hosts : [rest[idHost + 1]]
    const knownHosts = lerKnownHosts(cfg.known_hosts, deps.fs ? { fs: deps.fs } : {})
    const sshDeHost = deps.sshDeHost ?? ((h) => sshDeHostDefault(h, { env, spawn: deps.spawn }))
    const r = verify({ id: { ...id, hosts }, sshDeHost, knownHosts })
    log(saida(renderVerify({ ...id, hosts }, r)))
    if (!r.ok) process.exitCode = 1
    return r
  }
  if (sub === 'provision') {
    const valor = deps.valor ?? botDeCofre(cfg.bot, { op: deps.op, env })
    const r = provision({ id, valor, tty: deps.tty ?? process.stdin.isTTY, fs: deps.fs })
    log(`identity provision: ${r.escrito} (${r.modo})`)
    return r
  }
  if (sub === 'revoke') {
    const r = revoke({ id, fs: deps.fs })
    log(saida(renderRevoke(r)))
    return r
  }
  throw new Error(`use \`tars identity show|verify|provision|revoke\` (recebi '${sub ?? ''}')`)
}

export function renderVerify(id, r) {
  const linhas = [`# Identidade — verify (${r.ok ? 'OK' : 'FALHA'})`, '']
  for (const i of r.itens) linhas.push(`- ${i.ok ? 'ok' : 'FALHA'}  ${i.nome}${i.motivo && !i.ok ? ` — ${i.motivo}` : ''}`)
  linhas.push('')
  return linhas.join('\n')
}

export function renderRevoke(r) {
  const linhas = [`# Identidade — revoke`, '']
  linhas.push(r.removido ? `- removido: ${r.removido}` : '- chave local ja’ ausente')
  if (r.pendente_nos_hosts.length) {
    linhas.push(`- PENDENTE nos hosts (remova a linha do authorized_keys): ${r.pendente_nos_hosts.join(', ')}`)
    linhas.push(`  ${r.aviso}`)
  }
  linhas.push('')
  return linhas.join('\n')
}

// Auto-run: só quando chamado como processo (import num teste não dispara o CLI).
if (process.argv[1] && process.argv[1].endsWith('tars-identity.mjs')) {
  const [sub = 'show', ...rest] = process.argv.slice(2)
  try {
    runIdentity({ sub, rest, cfg: {} })
  } catch (err) {
    console.error(`tars identity: ${err.message}`)
    process.exit(1)
  }
}
