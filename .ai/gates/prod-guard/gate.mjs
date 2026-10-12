// prod-guard — BLOQUEIA comando que MUDA producao sem a ordem direta do dono, via PreToolUse.
//
// DOUTRINA B1.4 (plano de release 11/10): "nada em producao muda sem ordem direta do dono".
// Vale para o que RECRIA/muda estado no host de producao: `docker compose up/down/restart`,
// `docker stack deploy`, `systemctl restart/stop`, `kubectl apply/delete/rollout restart`,
// `helm upgrade/install/uninstall` — e o rollback manual de um deploy. O dono autoriza com a
// flag `TARS_PROD_ORDER=1` (ou a data da ordem em `TARS_PROD_ORDER=<texto>`), que viaja na
// propria linha do comando; sem ela, o comando NAO roda.
//
// PORQUE (R1): um `compose up` sem ordem derruba a stack que o dono administra e o agente nao
// sabe reerguer — o guard e' a versao EM CODIGO da regra, e o escape explicito registra QUEM
// ordenou. A LEITURA (`up -d --dry-run`, `docker ps`, `curl`) nao e' bloqueada: so' a mudanca.
//
// Contrato do hook (igual aos guards de `.ai/guards/` e ao `no-add-all`): stdin = JSON do
// harness {hook_event_name, tool_name, tool_input:{command}}; exit 2 = block (stderr = motivo);
// FALHA ABERTA em payload ruim (guarda-corpo, nao barreira).
import fs from 'node:fs'
import path from 'node:path'

/** Flags que declaram a ordem direta do dono. Qualquer uma presente libera o comando. */
export const ORDEM = /\bTARS_PROD_ORDER\s*=\s*\S+/

/**
 * [regex, nome, o que fazer no lugar]. So' o que MUDA estado em producao; a leitura fica de
 * fora. `compose up -d` recria container; `compose config`/`ps`/`pull` nao.
 */
export const REGRAS = [
  [/\bdocker(-|\s+)compose\b[^;&|]*\b(up|down|restart|rm|stop|kill)\b/, 'docker compose muda producao', 'peca a ordem ao dono e reenvie com `TARS_PROD_ORDER=<data/motivo> <comando>`'],
  [/\bdocker\s+stack\s+(deploy|rm|ps\s+--?\w*\s*deploy)?[^;&|]*/, 'docker stack deploy', 'peca a ordem ao dono e reenvie com `TARS_PROD_ORDER=<data/motivo> <comando>`'],
  [/\bsystemctl\s+(restart|stop|start|reload|disable|mask|kill)\b/, 'systemctl muda servico do host', 'peca a ordem ao dono; leitura (`status`, `is-active`) nao precisa'],
  [/\bkubectl\s+(apply|delete|replace|patch|scale|rollout\s+restart|drain|cordon)\b/, 'kubectl muda o cluster', 'peca a ordem ao dono e reenvie com `TARS_PROD_ORDER=<data/motivo> <comando>`'],
  [/\bhelm\s+(upgrade|install|uninstall|rollback)\b/, 'helm muda o release', 'peca a ordem ao dono e reenvie com `TARS_PROD_ORDER=<data/motivo> <comando>`'],
  [/\bgit\s+push\b[^;&|]*\s(-f|--force(-with-lease)?)(?=\s|$)/, 'force-push reescreve o remoto', 'force-push precisa de ordem direta do dono: `TARS_PROD_ORDER=<motivo> git push --force ...`'],
]

/** Primeira regra violada: {nome, dica, trecho} ou null. Com a ordem do dono, nunca viola. */
export function achar(comando, env = {}) {
  if (typeof comando !== 'string' || !comando.trim()) return null
  const temOrdem = ORDEM.test(comando) || ORDEM.test(env.TARS_PROD_ORDER ?? '')
  if (temOrdem) return null
  for (const [re, nome, dica] of REGRAS) {
    const m = comando.match(re)
    if (m) return { nome, dica, trecho: m[0].trim() }
  }
  return null
}

const mensagem = (a) =>
  [
    `PROD BARRADO: \`${a.trecho}\` (${a.nome}).`,
    '',
    'Nada em producao muda sem a ORDEM DIRETA DO DONO (doutrina B1.4).',
    `No lugar: ${a.dica}.`,
    'A ordem viaja na linha do comando: `TARS_PROD_ORDER=2026-10-11 docker compose up -d`.',
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
