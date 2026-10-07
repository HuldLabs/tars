---
name: modo-fast-ativo
description: "Modo FAST do segtools está ativo — despacho só via tools/method/worker/fast.py, sem watchdog/heartbeat/worktree/e2e obrigatório"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-27T14:26:56.392Z
---

Modo FAST ativo (ordem do dono, 26/09/2026, reforçada no mesmo dia): despachar DeepSeek Flash só por
`tools/method/worker/fast.py` (run_in_background), sem worktree, sem watchdog/heartbeat, sem e2e obrigatório, sem pipeline
pesado. O ritual §0 da skill agent-coordination (cron/heartbeat) NÃO se aplica enquanto o FAST estiver ativo.

**Why:** o pipeline completo levou tarefas de 1–3 min para 20+; o dono quer agilidade "como antes do WSL".
Exceção (dono, 26/09): mesmo no FAST, manter um ciclo recorrente a cada 10 min (CronCreate) que SEMPRE pergunta
"dá para paralelizar algo agora?" e despacha o que não colide.
Desde SEG-223 (27/09): `fast.py` exige `--issue SEG-N` (ou `--sem-canal` explícito) e sonda a credencial efêmera
antes de subir; sem isso falha. Para tarefa nova sem issue, criar a issue antes ou usar `--sem-canal`.
**How to apply:** ao recarregar a skill agent-coordination, não recriar watchdog/heartbeat; `dispatch.sh` só se o dono
trocar o modo. Ver [[coordenador-so-despacha]], [[ajuste-simples-direto-no-hmr]].
