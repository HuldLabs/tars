// Saude das releases do PROJETO (dev.23): o formato que o ecossistema espera, cobrado pelo
// `tars doctor` — o mesmo que a Release do proprio Tars segue.
//
// So' vale DEPOIS da primeira release (tag `v*`): repo que ainda nao publicou nao reprova por
// isso (o dono, 14/10). Com release, cobra:
//   - CHANGELOG.md existe;
//   - todo cabecalho `## ` e' so' a versao (`## 0.0.1-dev.3`): data ou texto no titulo fazia o
//     `release-notes` juntar secoes caladas (Endurance, 14/10);
//   - a ULTIMA tag tem a sua secao (o Kipp publicou `v0.0.2` com o CHANGELOG em `dev.1`);
//   - a secao da ultima tag tem as 4 subsecoes (versionamento-de-extracao.md);
//   - o topo do CHANGELOG nao esta' ATRAS da ultima tag.
// Fonte: as tags do git local — agnostico de forge (GitHub, Forgejo), sem rede.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareVersions, parseChangelog, versionKey } from './tars-upgrade.mjs'

export const SUBSECOES = ['### O que mudou', '### Por que', '### Arquivos impactados', '### O que o consumidor faz']
const CABECALHO_OK = /^##\s+\d+\.\d+\.\d+(?:-dev\.\d+)?\s*$/

/**
 * A versao do PROJETO: `package.json` > `pyproject.toml` ([project]/[tool.poetry]) > `VERSION` na
 * raiz (repo sem stack, ex.: o Endurance). `.ai/VERSION` NAO conta: e' a versao do catalogo do
 * Tars (versionamento-de-extracao.md), e no consumidor costuma ser sobra do esquema antigo.
 */
export function versaoDoProjeto(project) {
  const pkg = join(project, 'package.json')
  if (existsSync(pkg)) {
    try {
      const v = JSON.parse(readFileSync(pkg, 'utf8')).version
      if (v) return { versao: v, fonte: 'package.json' }
    } catch {
      return { versao: null, fonte: 'package.json (JSON invalido)' }
    }
  }
  const py = join(project, 'pyproject.toml')
  if (existsSync(py)) {
    const m = /^\s*version\s*=\s*["']([^"']+)["']/m.exec(readFileSync(py, 'utf8'))
    if (m) return { versao: m[1], fonte: 'pyproject.toml' }
  }
  const raiz = join(project, 'VERSION')
  if (existsSync(raiz)) return { versao: readFileSync(raiz, 'utf8').trim(), fonte: 'VERSION' }
  return { versao: null, fonte: null }
}

export function tagsDoGit(project) {
  const r = spawnSync('git', ['-C', project, 'tag', '-l', 'v*'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split('\n').map((t) => t.trim()).filter(Boolean) : []
}

/** `{ ativo, ultima, linhas: [{nome, ok, detalhe}] }`; sem release, `ativo: false` e nada a cobrar. */
export function releaseHealth(project, { tags = tagsDoGit(project) } = {}) {
  const versoes = tags.map((t) => t.replace(/^v/, '')).filter((v) => versionKey(v) !== null)
  if (!versoes.length) return { ativo: false, ultima: null, linhas: [] }
  const ultima = versoes.sort((a, b) => compareVersions(b, a))[0]
  const linhas = []
  const add = (nome, ok, detalhe) => linhas.push({ nome, ok, detalhe })
  const arq = join(project, 'CHANGELOG.md')
  if (!existsSync(arq)) {
    add('changelog', false, `ha' release (v${ultima}) e nao ha' CHANGELOG.md`)
    return { ativo: true, ultima, linhas }
  }
  const texto = readFileSync(arq, 'utf8')
  const ruins = texto.split('\n').filter((l) => /^##\s/.test(l) && !CABECALHO_OK.test(l))
  add(
    'cabecalho',
    !ruins.length,
    ruins.length ? `cabecalho fora do formato "## X.Y.Z[-dev.N]" (data ou texto no titulo junta secoes): ${ruins.slice(0, 3).join(' | ')}` : 'so\' a versao em cada "## "',
  )
  const blocos = parseChangelog(texto)
  const secao = blocos.find((b) => b.version === ultima)
  add('ultima-tag', !!secao, secao ? `v${ultima} tem secao` : `a ultima release (v${ultima}) nao tem secao "## ${ultima}" no CHANGELOG`)
  if (secao) {
    const faltam = SUBSECOES.filter((s) => !secao.corpo.includes(s))
    add('subsecoes', !faltam.length, faltam.length ? `secao ${ultima} sem: ${faltam.join(', ')}` : 'as 4 subsecoes')
  }
  // A fonte da versao tem de existir e bater com o topo do CHANGELOG (Endurance, 14/10: a versao
  // vivia so' na tag e no CHANGELOG, e nada acusava).
  const fonte = versaoDoProjeto(project)
  const bate = fonte.versao && fonte.versao === blocos[0]?.version
  add(
    'fonte',
    !!bate,
    !fonte.versao
      ? 'sem fonte da versao: crie `VERSION` na raiz (ou a `version` do package.json/pyproject.toml)'
      : bate
        ? `${fonte.fonte} = ${fonte.versao} (= topo do CHANGELOG)`
        : `${fonte.fonte} = ${fonte.versao}, mas o topo do CHANGELOG e' ${blocos[0]?.version ?? '-'}`,
  )
  const topo = blocos[0]?.version
  const atras = topo && versionKey(topo) !== null && compareVersions(topo, ultima) < 0
  add('topo', !atras, atras ? `o topo do CHANGELOG (${topo}) esta' atras da ultima release (v${ultima})` : `topo ${topo ?? '-'}`)
  return { ativo: true, ultima, linhas }
}
