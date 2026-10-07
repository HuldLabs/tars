// `tars check-refs` — o contrato: a decisao citada no prompt tem de estar VISIVEL na arvore.
// O caso que importa e' o NEGATIVO: sha que nao e' ancestral de HEAD (a regra inalcancavel
// do incidente do fabber) e caminho ausente tem de reprovar — senao o check e' decorativo.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { achaCaminhos, achaShas, checkRefs, format } from './tars-check-refs.mjs'

const bases = []
const raiz = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-refs-'))
  bases.push(d)
  return d
}
afterEach(() => { for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

/** `git` falso: `is-ancestor` responde pelo mapa; `rev-parse HEAD` responde `head`. */
const gitFalso = (ancestrais, head = 'abcdef1234567890abcdef1234567890abcdef12') => (args) => {
  if (args[0] === 'rev-parse') return head === null ? { status: 128, stdout: '' } : { status: 0, stdout: head }
  if (args[0] === 'merge-base') return { status: ancestrais.includes(args[2]) ? 0 : 1, stdout: '' }
  return { status: 128, stdout: '' }
}

describe('achaShas', () => {
  it('acha o sha citado e ignora placeholder de hex repetido', () => {
    const s = achaShas('a regra vem do commit 4f8ad582 e vale sempre\nplaceholder 0000000')
    expect(s.map((x) => x.sha)).toEqual(['4f8ad582'])
  })
})

describe('achaCaminhos', () => {
  it('acha caminho com barra e arquivo com extensao conhecida', () => {
    const c = achaCaminhos('veja docs/BENCHMARKS.md e tools/method/worker/dispatch.sh', ['docs','tools']).map((x) => x.caminho)
    expect(c).toContain('docs/BENCHMARKS.md')
    expect(c).toContain('tools/method/worker/dispatch.sh')
  })

  it('nao parte `arquivo.md:12` em dois alvos', () => {
    expect(achaCaminhos('o fato em docs/a.md:12', ['docs']).map((x) => x.caminho)).toEqual(['docs/a.md'])
  })

  it('descarta url, versao e glob', () => {
    expect(achaCaminhos('https://x.dev/a.md v1.2.3 docs/*.md', ['docs']).map((x) => x.caminho)).toEqual([])
  })
})

describe('checkRefs — o que esta visivel na arvore', () => {
  it('CASO POSITIVO: sha ancestral + caminho que existe = ok', () => {
    const dir = raiz()
    fs.mkdirSync(path.join(dir, 'docs'))
    fs.writeFileSync(path.join(dir, 'docs', 'a.md'), 'x')
    const r = checkRefs('a decisao esta em 4f8ad582 e em docs/a.md', { cwd: dir, git: gitFalso(['4f8ad582']) })
    expect(r.ok).toBe(true)
    expect(r.citacoes.every((c) => c.status === 'ok')).toBe(true)
  })

  it('CASO NEGATIVO (SHA): nao-ancestral de HEAD reprova (a regra inalcancavel)', () => {
    const dir = raiz()
    const r = checkRefs('a regra de DNS esta no 4f8ad582', { cwd: dir, git: gitFalso([]) })
    expect(r.ok).toBe(false)
    expect(r.naoVisiveis[0].status).toBe('inalcancavel')
    expect(r.naoVisiveis[0].motivo).toContain('nalcancavel')
  })

  it('CASO NEGATIVO (CAMINHO): arquivo ausente reprova', () => {
    const dir = raiz()
    fs.mkdirSync(path.join(dir, 'tools'))
    const r = checkRefs('porte a logica de tools/nao-existe/x.mjs', { cwd: dir, git: gitFalso([]) })
    expect(r.ok).toBe(false)
    expect(r.naoVisiveis[0]).toMatchObject({ tipo: 'caminho', status: 'inexistente' })
  })

  it('sha desconhecido do repo = inexistente (diferente de nao-ancestral)', () => {
    const dir = raiz()
    const git = (args) => (args[0] === 'rev-parse' ? { status: 0, stdout: 'abc' } : { status: 128, stdout: '' })
    expect(checkRefs('commit deadbeef1', { cwd: dir, git }).naoVisiveis[0].status).toBe('inexistente')
  })

  it('sem repo git: sha e ignorado, caminho ainda e julgado', () => {
    const dir = raiz()
    fs.mkdirSync(path.join(dir, 'docs'))
    const r = checkRefs('4f8ad582 e docs/x.md', { cwd: dir, git: gitFalso([], null) })
    expect(r.citacoes.find((c) => c.tipo === 'sha').status).toBe('ignorada')
    expect(r.ok).toBe(false) // o caminho ausente ainda reprova
  })

  it('format nomeia cada citacao nao visivel', () => {
    const dir = raiz()
    fs.mkdirSync(path.join(dir, 'docs'))
    const t = format(checkRefs('veja docs/nao-existe.md', { cwd: dir, git: gitFalso([]) }))
    expect(t).toContain('NAO visivel')
    expect(t).toContain('docs/nao-existe.md')
  })
})
