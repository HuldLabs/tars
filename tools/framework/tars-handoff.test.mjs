// `tars handoff check` — o contrato: o cursor do topo tem estado + proximo + branch que bate
// com o git. O caso que importa e' o NEGATIVO: HANDOFF velho, branch apagada ou sha inventado
// tem de reprovar — senao o check nao protege o sucessor de retrabalho.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkHandoff, dataDoTopo, format, intentDoTopo, temProximoPasso, topoDoHandoff } from './tars-handoff.mjs'

const bases = []
const raiz = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-handoff-'))
  bases.push(d)
  return d
}
afterEach(() => { for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

const escreve = (dir, nome, texto) => {
  const f = path.join(dir, nome)
  fs.writeFileSync(f, texto)
  return f
}
/** `git` falso: commits e branches conhecidas. */
const gitFalso = ({ commits = [], branches = [] } = {}) => (args) => {
  if (args[0] === 'cat-file') {
    const sha = args[2].replace(/\^\{commit\}$/, '')
    return { status: commits.includes(sha) ? 0 : 128, stdout: '' }
  }
  if (args[0] === 'rev-parse') {
    const nome = String(args[3] ?? '').replace('refs/heads/', '').replace('refs/remotes/origin/', '')
    return { status: branches.includes(nome) ? 0 : 1, stdout: '' }
  }
  return { status: 128, stdout: '' }
}
const HOJE = new Date(Date.UTC(2026, 9, 7)) // 07/10/2026

const HANDOFF_OK = `# HANDOFF — cursor vivo

## Estado em 07/10

**Branch: \`chore/ecossistema\`**
**Proximo passo:** fechar a fatia 4 do TARS-CONSUME.
Commit de referencia \`4f8ad582\`.
`

describe('topoDoHandoff — so a secao do cursor', () => {
  it('para no segundo cabecalho (o historico nao conta)', () => {
    const md = '# HANDOFF\n\n## Estado\nProximo passo: x\n\n## Historico antigo\nProximo passo: NAO CONTA\n'
    expect(topoDoHandoff(md)).not.toContain('NAO CONTA')
  })
})

describe('temProximoPasso / dataDoTopo / intentDoTopo', () => {
  it('acha "Proximo passo" (com e sem acento)', () => {
    expect(temProximoPasso('**Próximo passo:** x')).toBe(true)
    expect(temProximoPasso('**Proximo passo:** x')).toBe(true)
    expect(temProximoPasso('nada aqui')).toBe(false)
  })

  it('le a data DD/MM/YYYY e usa a mais recente', () => {
    expect(dataDoTopo('Estado em 07/10/2026; antes 05/10/2026').toISOString().slice(0, 10)).toBe('2026-10-07')
  })

  it('le a intencao declarada, ou null', () => {
    expect(intentDoTopo('Intencao: implement-change')).toBe('implement-change')
    expect(intentDoTopo('sem campo')).toBe(null)
  })
})

describe('checkHandoff — o cursor bate com o git', () => {
  it('CASO POSITIVO: proximo passo + sha + branch + data recente = ok', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', HANDOFF_OK)
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ commits: ['4f8ad582'], branches: ['chore/ecossistema'] }) })
    expect(r.ok).toBe(true)
    expect(r.branch).toBe('chore/ecossistema')
  })

  it('CASO NEGATIVO (PROXIMO): sem "Proximo passo" reprova', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', '# HANDOFF\n\n## Estado em 07/10/2026\nBranch: `chore/ecossistema`\n')
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ branches: ['chore/ecossistema'] }) })
    expect(r.ok).toBe(false)
    expect(r.erros.join()).toContain('Proximo passo')
  })

  it('CASO NEGATIVO (SHA): sha que nao existe no repo reprova', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', HANDOFF_OK)
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ commits: [], branches: ['chore/ecossistema'] }) })
    expect(r.erros.join()).toContain('4f8ad582')
  })

  it('CASO NEGATIVO (BRANCH): branch citada que sumiu reprova', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', HANDOFF_OK)
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ commits: ['4f8ad582'], branches: [] }) })
    expect(r.ok).toBe(false)
    expect(r.erros.join()).toContain('chore/ecossistema')
  })

  it('CASO NEGATIVO (DATA): cursor velho reprova', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', '# HANDOFF\n\n## Estado em 20/09/2026\nBranch: `chore/ecossistema`\nProximo passo: x\n')
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ branches: ['chore/ecossistema'] }) })
    expect(r.erros.join()).toContain('velho')
  })

  it('intencao valida passa; invalida reprova', () => {
    const dir = raiz()
    const base = '# HANDOFF\n\n## Estado em 07/10/2026\nBranch: `chore/ecossistema`\nProximo passo: x\n'
    const git = gitFalso({ branches: ['chore/ecossistema'] })
    expect(checkHandoff(escreve(dir, 'a.md', base + 'Intencao: implement-change\n'), { cwd: dir, hoje: HOJE, git }).ok).toBe(true)
    expect(checkHandoff(escreve(dir, 'b.md', base + 'Intencao: fazer-tudo\n'), { cwd: dir, hoje: HOJE, git }).ok).toBe(false)
  })

  it('CASO POSITIVO (MAIN): projeto so-main valida com branch `main` citada', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', '# HANDOFF\n\n## Estado em 07/10/2026\n**Branch: `main`**\n**Proximo passo:** rodar a regua.\n')
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ branches: ['main'] }) })
    expect(r.erros).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.branch).toBe('main')
  })

  it('CASO NEGATIVO (MAIN): branch main que nao existe ainda reprova', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', '# HANDOFF\n\n## Estado em 07/10/2026\n**Branch: `main`**\n**Proximo passo:** rodar a regua.\n')
    const r = checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ branches: [] }) })
    expect(r.ok).toBe(false)
    expect(r.erros.join()).toContain('main')
  })

  it('HANDOFF ausente reprova ruidoso', () => {
    const r = checkHandoff(path.join(raiz(), 'nao-existe.md'), { git: gitFalso() })
    expect(r.ok).toBe(false)
    expect(r.erros[0]).toContain('nao encontrado')
  })

  it('format traz os numeros e cada problema', () => {
    const dir = raiz()
    const f = escreve(dir, 'HANDOFF.md', HANDOFF_OK)
    expect(format(checkHandoff(f, { cwd: dir, hoje: HOJE, git: gitFalso({ commits: ['4f8ad582'], branches: ['chore/ecossistema'] }) }))).toContain('ok')
  })
})
