// Resolvedor UNICO do runtime JS que executa um gate `.mjs` (R3: um lugar so').
//
// PORQUE EXISTE (Incident: `dist/tars` roda gate com `process.execPath` = ele mesmo): no
// `bun build --compile` o `process.execPath` e' o PROPRIO binario `tars`, NAO um runtime JS.
// O motor montava `[process.execPath, <gate>.mjs, ...]`; o binario entao recebia o caminho do
// gate como ARGUMENTO de CLI, nao reconhecia o comando, saia 0 — e o motor anunciava
// "1 gate(s) ok." sem NENHUM gate ter rodado (o commit saia sem emoji, sem trailer e sem
// segredo varrido). Falha calada e' o que a R4 proibe: gate que nao roda tem de GRITAR.
//
// ORDEM DE RESOLUCAO (a mais fiel primeiro):
//   1. `BUN_BE_BUN=1` + o proprio executavel — so' quando ELE e' um binario bun compilado.
//      A flag faz o binario compilado agir COMO `bun` (a doc do bun: "BUN_BE_BUN=1 ... forces
//      the compiled executable to act like the bun CLI"), entao ele executa `.mjs` normalmente.
//      E' o unico caminho quando o consumidor nao tem Node nem bun no PATH (repo so' Python).
//   2. `process.execPath` — fonte: e' o proprio node/bun.
//   3. `node`/`bun` no PATH — ultimo recurso (ex.: binario compilado sem a flag funcionar).
//   4. NADA: devolve `null` e quem chama GRITA nomeando o gate. Nunca exit 0 calado.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** O proprio processo E' um binario `bun build --compile`? (import.meta.url cai em `/$bunfs/`). */
export function isCompiledBun() {
  if (!process.versions?.bun) return false
  try {
    return fileURLToPath(import.meta.url).startsWith('/$bunfs/')
  } catch {
    return false
  }
}

/** O binario no PATH responde? (spawnSync devolve `error`, nao `status`, quando nao existe.) */
function disponivel(bin) {
  try {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' })
    return !r.error
  } catch {
    return false
  }
}

/**
 * O runtime JS para rodar `.mjs`. Devolve `{ cmd, env }` (env ja' com `BUN_BE_BUN=1` quando
 * o binario compilado se reexecuta) ou `null` quando NENHUM existe — quem chama nomeia o gate
 * e falha alto. `compiled`, `execPath` e `tem` sao injetaveis para o teste.
 */
export function jsRuntime({
  compiled = isCompiledBun(),
  execPath = process.execPath,
  tem = disponivel,
} = {}) {
  if (compiled) return { cmd: execPath, env: { BUN_BE_BUN: '1' } }
  if (!execPath?.startsWith('/$bunfs/')) return { cmd: execPath, env: {} }
  for (const bin of ['node', 'bun']) if (tem(bin)) return { cmd: bin, env: {} }
  return null
}
