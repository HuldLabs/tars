// TMPDIR proprio por rodada da suite: os workers herdam o ambiente, entao todo os.tmpdir() dos
// testes cai aqui, e o teardown apaga tudo de uma vez (ver vitest.config.mjs).
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Alguns testes deixam arquivo sem permissao de escrita; sem isto o rm falha no meio.
function liberaEscrita(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    const st = statSync(p, { throwIfNoEntry: false })
    if (!st) continue
    chmodSync(p, st.mode | 0o700)
    if (st.isDirectory()) liberaEscrita(p)
  }
}

export default function setup() {
  const raiz = mkdtempSync(join(tmpdir(), 'tars-suite-'))
  process.env.TMPDIR = raiz
  return () => {
    liberaEscrita(raiz)
    rmSync(raiz, { recursive: true, force: true })
  }
}
