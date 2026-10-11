// daneel-acoes — cobra as 3 CONDICOES DE PARADA da Daneel que so' viviam como prosa na
// skill (`daneel/stop-conditions`): force-push, push em repo PUBLICO e escrita no cofre.
// Sem gate, "parar e reportar" era ordem escrita sem prova que reprove (divida nomeada no
// `.ai/doctrines.toml`); aqui vira hook PreToolUse que BLOQUEIA o comando antes do dano.
//
// PORQUE (R1): e' o mesmo mecanismo do `no-add-all` — o checkout e' compartilhado e o agente
// nao decide sobre si. A DHO (doutrina das acoes da Daneel) exige ORDEM EXPRESSA do dono para
// as tres: force-push reescreve historia (INV: o `HuldLabs/.github` so' saiu por force-push
// AUTORIZADO — `HANDOFF.md:22`); repo publico ja' recebeu commit indevido; `op item edit`
// grava no cofre e a SA no dia a dia e' de LEITURA.
//
// Contrato do hook (igual aos guards de `.ai/guards/`): stdin = JSON do harness
// {hook_event_name, tool_name, tool_input:{command}}; exit 2 = block (stderr = motivo);
// FALHA ABERTA em payload ruim (guarda-corpo, nao barreira).
//
// OVERRIDE: so' o OPERADOR, por invocacao — `DANEEL_ALLOW=1 <cmd>`. Um agente setar a variavel
// por conta propria e' exatamente o comportamento que este hook existe para impedir (mesma
// regra do `block-destructive-commands`).
import fs from 'node:fs'
import path from 'node:path'

/** [regex, nome, o que fazer no lugar]. As tres condicoes de parada + o `-T` obrigatorio. */
export const REGRAS = [
  [
    /\bgit\s+push\b[^;&|]*(\s--force(-with-lease)?\b|\s-f(?=\s|$)|\s\+[^\s;&|]+|\s--mirror\b)/,
    'force-push',
    'force-push reescreve historia — exige ORDEM EXPRESSA do dono (HANDOFF.md:22). Sem ordem: pare e reporte.',
  ],
  [
    /\bgh\s+repo\s+(create|edit)\b[^;&|]*(--public\b|\s--visibility[= ]public\b)/,
    'repo publico',
    'publicar repo PUBLICO exige aprovacao — consulte a visibilidade ANTES. Sem ordem: pare e reporte.',
  ],
  [
    /\bgh\s+repo\s+edit\b[^;&|]*--visibility[= ]public\b/,
    'tornar repo publico',
    'tornar repo existente PUBLICO exige aprovacao do dono. Sem ordem: pare e reporte.',
  ],
  [
    /\bop\s+item\s+(edit|create|delete)\b/,
    'escrita no cofre',
    'escrever no cofre exige ORDEM EXPRESSA (a SA no dia a dia e de LEITURA — op read apenas). Sem ordem: pare e reporte.',
  ],
  [
    /\btars\s+secrets\s+set\b/,
    'escrita no cofre (tars secrets set)',
    'escrever segredo exige ORDEM EXPRESSA. Sem ordem: pare e reporte.',
  ],
]

/** Override do OPERADOR: `DANEEL_ALLOW=1` na linha (nunca o agente decide). */
export const OVERRIDE_VAR = 'DANEEL_ALLOW'

/** Bloqueia se o comando casa alguma condicao de parada. Devolve o motivo, ou null. */
export function julga(command) {
  const cmd = String(command ?? '')
  if (!cmd) return null
  if (new RegExp(`(^|[\\s;])(export\\s+)?${OVERRIDE_VAR}=1([\\s;]|$)`).test(cmd)) return null
  if (new RegExp(`(^|[\\s;])env\\s[^;]*${OVERRIDE_VAR}=1`).test(cmd)) return null
  for (const [re, nome, dica] of REGRAS) {
    if (re.test(cmd)) return `BLOCKED (daneel: ${nome}): ${dica}\nOverride (so' o OPERADOR, por invocacao): ${OVERRIDE_VAR}=1 <cmd>`
  }
  return null
}

// --- CLI (mesmo contrato do PreToolUse) ------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const lerPayload = () => {
    try {
      return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
    } catch {
      return null // FALHA ABERTA: payload ilegivel = guarda-corpo, nao barreira
    }
  }
  const payload = lerPayload()
  const cmd = payload?.tool_input?.command
  if (!payload || payload.hook_event_name !== 'PreToolUse' || !['Bash', 'PowerShell'].includes(payload.tool_name) || !cmd) process.exit(0)
  const motivo = julga(cmd)
  if (motivo) {
    process.stderr.write(motivo + '\n')
    process.exit(2)
  }
  process.exit(0)
}
