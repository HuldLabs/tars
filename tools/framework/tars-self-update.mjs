// `tars self-update` (dev.23) — atualizar o Tars com UM comando, sem `gh` e sem compilar.
//
// Baixa a Release mais nova (ou `--version V`), escolhe o binario da maquina (x86/ARM, glibc
// ou musl), confere o sha256 contra o `sha256sums` da mesma Release, troca o proprio
// executavel (rename atomico) e roda `sync --upgrade` no projeto atual, se ele tiver
// `.ai/tars.toml`. Ja' na versao pedida = nada muda (idempotente).
//
// Repo: `TARS_REPO` (default HuldLabs/tars). Token (repo privado): GH_TOKEN > GITHUB_TOKEN >
// `gh auth token`. O token nunca vai para argv, log ou URL — so' no header da requisicao.
//
//   tars self-update [--version 0.0.1-dev.23] [--no-sync] [--check]
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { compareVersions } from './tars-upgrade.mjs'

const REPO = process.env.TARS_REPO ?? 'HuldLabs/tars'
const API = 'https://api.github.com'

/** Nome do asset para a maquina. musl = Alpine (sem glibc). */
export function assetName({ arch = process.arch, musl = isMusl() } = {}) {
  const a = { x64: 'amd64', arm64: 'arm64' }[arch]
  if (!a) throw new Error(`self-update: arquitetura sem binario publicado: ${arch}`)
  return `tars-linux-${a}${musl ? '-musl' : ''}`
}

export function isMusl() {
  if (existsSync('/etc/alpine-release')) return true
  const r = spawnSync('ldd', ['--version'], { encoding: 'utf8' })
  return /musl/i.test(`${r.stdout ?? ''}${r.stderr ?? ''}`)
}

/** sha256 do `nome` dentro do texto do `sha256sums`; ausente = erro alto. */
export function shaDe(sums, nome) {
  const linha = sums.split('\n').find((l) => l.trim().split(/\s+/)[1]?.replace(/^\*/, '') === nome)
  if (!linha) throw new Error(`self-update: ${nome} ausente do sha256sums da Release`)
  return linha.trim().split(/\s+/)[0]
}

export function token(env = process.env) {
  if (env.GH_TOKEN) return env.GH_TOKEN
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN
  const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

/** Escolhe a Release: a versao pedida, ou a mais recente (pre-release inclusa — o ecossistema vive nelas). */
export function escolher(releases, version) {
  const tag = version ? `v${version.replace(/^v/, '')}` : null
  const r = tag ? releases.find((x) => x.tag_name === tag) : releases.find((x) => !x.draft)
  if (!r) throw new Error(`self-update: Release ${tag ?? '(nenhuma)'} nao encontrada em ${REPO}`)
  return r
}

export async function selfUpdate({ atual, version = null, exe = process.execPath, fetchFn = fetch, env = process.env, log = console.log, nome = assetName() } = {}) {
  // Rodando pelo fonte (`node tars.mjs`), o execPath e' o node: trocar seria sobrescrever o runtime.
  if (/(^|\/)(node|bun)(\.exe)?$/.test(exe)) throw new Error("self-update: so' o binario publicado se atualiza (rodando pelo fonte: git pull).")
  const tk = token(env)
  if (!tk) throw new Error('self-update: sem token para o GitHub (defina GH_TOKEN ou faca `gh auth login`).')
  const h = { Authorization: `Bearer ${tk}`, 'X-GitHub-Api-Version': '2022-11-28' }
  const get = async (url, accept) => {
    const r = await fetchFn(url, { headers: { ...h, Accept: accept } })
    if (!r.ok) throw new Error(`self-update: ${r.status} em ${url.replace(/\?.*/, '')}`)
    return r
  }
  const rel = escolher(await (await get(`${API}/repos/${REPO}/releases?per_page=20`, 'application/vnd.github+json')).json(), version)
  const alvo = rel.tag_name.replace(/^v/, '')
  // Sem `--version`, so' para FRENTE: quem esta' numa versao mais nova que a ultima Release fica.
  if (alvo === atual || (!version && atual && compareVersions(alvo, atual) < 0)) {
    log(`self-update: ja' em ${atual} (nada muda).`)
    return { mudou: false, versao: atual }
  }
  const asset = (n) => {
    const a = rel.assets.find((x) => x.name === n)
    if (!a) throw new Error(`self-update: ${rel.tag_name} nao tem o asset ${n}`)
    return a.url
  }
  const sums = await (await get(asset('sha256sums'), 'application/octet-stream')).text()
  const bin = Buffer.from(await (await get(asset(nome), 'application/octet-stream')).arrayBuffer())
  const got = createHash('sha256').update(bin).digest('hex')
  if (got !== shaDe(sums, nome)) throw new Error(`self-update: sha256 de ${nome} NAO bate com o sha256sums — nada trocado.`)
  // pid no nome: dois self-update no mesmo HOME (container compartilhado) nao disputam o mesmo .tmp
  const tmp = join(dirname(exe), `.tars-${alvo}.${process.pid}.tmp`)
  writeFileSync(tmp, bin)
  chmodSync(tmp, 0o755)
  renameSync(tmp, exe) // atomico: quem roda o binario velho nao ve arquivo pela metade
  log(`self-update: ${atual} -> ${alvo} (${nome}, sha256 conferido) em ${exe}`)
  return { mudou: true, versao: alvo }
}

// --- CLI (despacho fino em tars.mjs) ---------------------------------------
export async function cli(rest, { atual, project = process.cwd() } = {}) {
  const i = rest.indexOf('--version')
  const version = i === -1 ? null : rest[i + 1]
  const r = await selfUpdate({ atual, version })
  if (!r.mudou || rest.includes('--no-sync')) return r
  if (!existsSync(join(project, '.ai', 'tars.toml'))) return r
  // O binario NOVO faz o sync: e' ele quem carrega o catalogo da versao nova.
  const s = spawnSync(process.execPath, ['sync', '--upgrade'], { cwd: project, stdio: 'inherit' })
  if (s.status !== 0) throw new Error('self-update: binario trocado, mas o `sync --upgrade` falhou — rode-o e confira.')
  return r
}
