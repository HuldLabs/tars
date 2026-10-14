// Workflow nunca executa script do repo pelo caminho: o bit de execucao nao sobrevive a quem
// cria o arquivo do lado do Windows. Foi a 2a vez (dev.19: binario sem +x na imagem; dev.23:
// `tars-upgrade-real.sh: Permission denied` barrou a Release). Chame por `bash`/`node`.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(import.meta.dirname, '..', '..', '.github', 'workflows')
const DIRETO = /^\s*(?:-\s+run:\s*)?(?:\.\/)?(?:tools|scripts|\.ai)\/[\w./-]+\.sh\b/

export function chamadasDiretas(dir = DIR) {
  const out = []
  for (const f of fs.readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n')
      .forEach((l, i) => DIRETO.test(l) && out.push(`${f}:${i + 1}: ${l.trim()}`))
  }
  return out
}

describe('workflows chamam script pelo interpretador', () => {
  it('nenhuma linha executa tools/x.sh direto', () => {
    expect(chamadasDiretas()).toEqual([])
  })

  it('a linha da dev.23 (sem bash) reprova', () => {
    const d = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'wf-'))
    fs.writeFileSync(path.join(d, 'r.yml'), 'run: |\n  tools/framework/tars-upgrade-real.sh velho novo\n')
    expect(chamadasDiretas(d)).toHaveLength(1)
  })
})
