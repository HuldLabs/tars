---
name: segtools-projects-como-canal-de-coordenacao
description: "Proposta do dono (2026-09-26) — terminar a POC do módulo projects e usá-la como canal entre coordenador e worker (tarefas, prompts, comentários)"
metadata:
  node_type: memory
  type: project
  originSessionId: a43ab404-8270-4852-85e4-466c7dc32dd4
  modified: 2026-09-26T03:26:34.847Z
---

Proposta do dono: finalizar a POC do módulo `projects` e deixá-lo operacional com CLI/endpoint documentado, para coordenador (Opus) e worker (DeepSeek) se comunicarem por ele — tarefa = prompt, comentários = perguntas/respostas/correções, estados = fluxo.

Minha avaliação: boa ideia, com ressalvas — precisa de API estável (CLI + endpoint), autoridade de transição (worker só leva até `delivered`; `reviewed` só o coordenador, AI-A4), campos de coordenação (prompt, critério `claim|verify|expect`, worktree/branch, evidência), eventos para notificar; NÃO substitui a caixa de entrada/timeline para correção em tempo real; o BACKLOG.md continua como export/fallback caso o módulo quebre.

**How to apply:** se o dono aprovar, isso vira a próxima tarefa antes/junto do C7; ver [[segtools-coordenacao-opus-deepseek]].
