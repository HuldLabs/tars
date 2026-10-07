// no-add-all — RECUSA `git add` amplo (e `git commit -a`) no Bash do agente, via PreToolUse.
//
// PORQUE (R1): o checkout e' COMPARTILHADO — varios workers commitam na mesma arvore. Um
// `git add -A`/`git add .`/`git commit -a` leva o arquivo de OUTRA frente (01/10: o README de
// um worker entrou no commit de outro). O POP exige pathspec explicito; esta guarda e' a
// versao EM CODIGO daquela regra. O `git add -f` entra na mesma lista: ele atravessa o
// .gitignore, e foi assim que `.cache/` foi parar na main 3x em 02/10 (INV-CACHE).
//
// Contrato do hook (igual aos guards de `.ai/guards/`): stdin = JSON do harness
// {hook_event_name, tool_name, tool_input:{command}}; exit 2 = block (stderr = motivo);
// FALHA ABERTA em payload ruim (guarda-corpo, nao barreira).
//
// Portado do segtools `tools/method/worker/worker-destructive-guard.mjs` — SO' a familia
// add/commit amplo. As regras que dependem da topologia do segtools (docker volumes,
// DROP/TRUNCATE, lane gate, caminho de .cache/) ficaram de fora de proposito: aquilo e' do
// projeto, nao do catalogo.
import fs from 'node:fs'
import path from 'node:path'

/** [regex, nome, o que fazer no lugar]. */
export const REGRAS = [
  [/\bgit\s+add\b[^;&|]*\s(-A|--all|-u|--update|\.(?=\s|$|;)|:\/(?=\s|$))/, 'git add amplo', 'adicione os SEUS arquivos pelo nome: `git add -- <arquivo>...`'],
  [/\bgit\s+add\s*(\.|-A|--all)?\s*$/, 'git add amplo', 'adicione os SEUS arquivos pelo nome: `git add -- <arquivo>...`'],
  [/\bgit\s+add\b[^;&|]*\s(-f|--force|-[a-zA-Z]*f[a-zA-Z]*)(?=\s|$)/, 'git add -f', 'o arquivo esta no .gitignore de proposito: nao commite; se precisa versionar, mova para fora do ignorado'],
  [/\bgit\s+commit\b[^;&|]*\s(-[a-zA-Z]*a[a-zA-Z]*|--all)(?=\s|$)/, 'git commit -a', 'commit com pathspec: `git commit -F <msg> -- <arquivo>...`'],
]

/** Primeira regra violada: {nome, dica, trecho} ou null. */
export function achar(comando) {
  if (typeof comando !== 'string' || !comando.trim()) return null
  for (const [re, nome, dica] of REGRAS) {
    const m = comando.match(re)
    if (m) return { nome, dica, trecho: m[0].trim() }
  }
  return null
}

const mensagem = (a) =>
  [
    `ADD AMPLO BARRADO: \`${a.trecho}\` (${a.nome}).`,
    '',
    "O checkout e' compartilhado: isto levaria o arquivo de OUTRA frente para o seu commit.",
    `No lugar: ${a.dica}.`,
    '',
  ].join('\n')

const lerPayload = () => {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return null
  }
}

// So' roda como hook; o teste importa `achar` sem disparar a leitura do stdin.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const payload = lerPayload()
  const cmd = payload?.tool_input?.command
  if (!payload || payload.hook_event_name !== 'PreToolUse' || payload.tool_name !== 'Bash' || !cmd) process.exit(0)
  const achado = achar(cmd)
  if (!achado) process.exit(0)
  process.stderr.write(mensagem(achado))
  process.exit(2)
}
