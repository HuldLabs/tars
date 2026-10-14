// `tars release-notes` — as notas da Release geradas, nunca escritas a mao (dono, 14/10).
//
// Toda tag do ecossistema sai com notas de release madura: destaques, downloads (arquivo, para
// quem, tamanho, sha256), imagem por digest, instalar, atualizar, adotar, a secao inteira do
// CHANGELOG, verificacao e comparacao. A FONTE e' o que ja' existe (R3): a secao da versao no
// `CHANGELOG.md` e os artefatos do build. O comando so' monta; o workflow publica.
//
//   tars release-notes --version 0.0.1-dev.20 [--dist <dir>] [--image ghcr.io/o/r@sha256:...]
//                      [--repo Org/repo] [--run <url>] [--prev <tag>] [--changelog <arquivo>]
//                      [--bin <nome>] [--kind bin|image] [--out <arquivo>]
//
// O nome sai de `--bin`, senao do `--repo` (HuldLabs/kipp -> kipp): fora do Tars o titulo
// dizia "tars" (Kipp, 14/10). `--kind image` e' para quem publica IMAGEM (base, feature):
// sem "binario em /<bin>", sem COPY, e a verificacao fala da imagem (Endurance, 14/10).
// A imagem vai so' por DIGEST: a tag mutavel tinha convencao diferente por repo (com e sem `v`).
//
// Asset desconhecido (fora da tabela PUBLICO) entra na lista sem "para quem" — nunca some.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseChangelog } from './tars-upgrade.mjs'
import { versaoDoProjeto } from './tars-release-health.mjs'

/** Para quem e' cada asset, pelo sufixo do nome. A ordem e' a da tabela. */
const PUBLICO = [
  [/-linux-amd64$/, 'Ubuntu, WSL, Debian (x86-64)'],
  [/-linux-arm64$/, 'Ubuntu/Debian ARM (Raspberry/Orange Pi, Graviton)'],
  [/-linux-amd64-musl$/, 'Alpine x86-64 (precisa de `libstdc++`)'],
  [/-linux-arm64-musl$/, 'Alpine ARM (precisa de `libstdc++`)'],
  [/-darwin-arm64$/, 'macOS Apple Silicon'],
  [/-windows-amd64\.exe$/, 'Windows x86-64'],
]
const paraQuem = (nome) => PUBLICO.find(([re]) => re.test(nome))?.[1] ?? ''
const ordem = (nome) => {
  const i = PUBLICO.findIndex(([re]) => re.test(nome))
  return i === -1 ? PUBLICO.length : i
}
const tamanho = (bytes) => (bytes >= 1048576 ? `${Math.round(bytes / 1048576)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Assets do `dist`: nome, bytes, sha256 (o `sha256sums` em si fica fora da tabela). */
export function assets(dist) {
  if (!dist || !existsSync(dist)) return []
  return readdirSync(dist)
    .filter((n) => n !== 'sha256sums' && statSync(join(dist, n)).isFile())
    .map((nome) => {
      const buf = readFileSync(join(dist, nome))
      return { nome, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
    })
    .sort((a, b) => ordem(a.nome) - ordem(b.nome) || a.nome.localeCompare(b.nome))
}

/** A secao `## <versao>` do CHANGELOG; ausente = erro alto (release sem notas nao sai). */
export function secao(changelog, version) {
  const ruins = changelog.split('\n').filter((l) => /^##\s/.test(l) && !/^##\s+\d+\.\d+\.\d+(?:-dev\.\d+)?\s*$/.test(l))
  if (ruins.length) throw new Error(`CHANGELOG com cabecalho fora do formato "## X.Y.Z[-dev.N]" (sem data/texto): ${ruins.slice(0, 3).join(' | ')}`)
  const b = parseChangelog(changelog).find((x) => x.version === version)
  if (!b) throw new Error(`CHANGELOG sem a secao "## ${version}" — escreva as notas antes de cortar a tag.`)
  return b.corpo
}

/** Os destaques: o primeiro paragrafo em negrito de cada item de "O que mudou". */
export function destaques(corpo) {
  const m = /### O que mudou\n([\s\S]*?)(\n### |$)/.exec(corpo)
  if (!m) return []
  return m[1]
    .split('\n')
    .filter((l) => /^- \*\*/.test(l))
    .map((l) => l.replace(/^- /, '').replace(/\*\*(.+?)\*\*.*/, '$1').replace(/\.$/, ''))
    .slice(0, 6)
}

export function gerar({ version, changelog, dist = null, image = null, repo = null, run = null, prev = null, bin = null, kind = 'bin' }) {
  bin = bin ?? (repo ? repo.split('/').pop().toLowerCase() : 'tars')
  const corpo = secao(changelog, version)
  const tag = `v${version}`
  const pre = /-/.test(version)
  const lista = assets(dist)
  const L = []
  L.push(`# ${bin} ${version}`, '')
  if (pre) L.push('> **Pré-release.** Fixe a versão exata (e a imagem por digest); `latest` não se move em pré-release.', '')
  const d = destaques(corpo)
  if (d.length) L.push('**Destaques**', ...d.map((x) => `- ${x}`), '')

  if (lista.length) {
    L.push('## Downloads', '', '| Arquivo | Para quem | Tamanho | sha256 |', '|---|---|---|---|')
    for (const a of lista) L.push(`| \`${a.nome}\` | ${paraQuem(a.nome)} | ${tamanho(a.bytes)} | \`${a.sha256.slice(0, 12)}…\` |`)
    L.push('| `sha256sums` | conferência de todos | — | — |', '')
  }
  if (image) {
    L.push(kind === 'image' ? '**Imagem OCI** (por digest):' : `**Imagem OCI** (binário em \`/${bin}\`, por digest):`, '', '```', image, '```', '')
  }

  const principal = lista.find((a) => /-linux-amd64$/.test(a.nome))?.nome
  if (kind === 'image' && image) L.push('## Usar', '', '```sh', `docker pull ${image}`, '```', '')
  if (kind === 'bin' && principal && repo) {
    L.push('## Instalar', '', '```sh', `V=${version}`, `gh release download v$V -R ${repo} -p ${principal} -p sha256sums`,
      'sha256sum -c --ignore-missing sha256sums    # tem de dizer OK', `install -m 0755 ${principal} ~/.local/bin/${bin}`,
      `${bin} --version`, '```', '')
    if (image && kind === 'bin') L.push('Numa imagem, sempre por digest:', '', '```dockerfile', `COPY --from=${image} /${bin} /usr/local/bin/${bin}`, '```', '')
  }

  L.push('## O que mudou (CHANGELOG)', '', corpo, '')

  const ver = []
  if (run) ver.push(kind === 'image' ? `- CI da tag: ${run} — a imagem foi publicada e conferida no registro antes da Release.` : `- CI da tag: ${run} — cada binário provado rodando na sua libc e arquitetura antes de publicar.`)
  if (lista.length) ver.push('- `sha256sum -c sha256sums` confere todos os arquivos desta página.')
  if (ver.length) L.push('## Verificação', '', ...ver, '')
  if (repo && prev) L.push(`**Comparação completa:** [\`${prev}...${tag}\`](https://github.com/${repo}/compare/${prev}...${tag})`, '')
  return L.join('\n')
}

// --- CLI (despacho fino em tars.mjs) ---------------------------------------
export function cli(rest, { cwd = process.cwd(), log = console.log } = {}) {
  const v = (n) => {
    const i = rest.indexOf(n)
    return i === -1 ? null : rest[i + 1]
  }
  if (v('--kind') && !['bin', 'image'].includes(v('--kind'))) throw new Error('uso: --kind bin|image')
  const version = v('--version') ?? versaoDoProjeto(cwd).versao
  if (!version) throw new Error('uso: tars release-notes --version <X.Y.Z[-dev.N]> (ou a versao no package.json/pyproject.toml/VERSION do projeto)')
  const changelog = readFileSync(resolve(cwd, v('--changelog') ?? 'CHANGELOG.md'), 'utf8')
  const md = gerar({
    version,
    changelog,
    dist: v('--dist') ? resolve(cwd, v('--dist')) : null,
    image: v('--image'),
    repo: v('--repo'),
    run: v('--run'),
    prev: v('--prev'),
    bin: v('--bin'),
    kind: v('--kind') ?? 'bin',
  })
  if (v('--out')) writeFileSync(resolve(cwd, v('--out')), md)
  else log(md)
  return md
}
