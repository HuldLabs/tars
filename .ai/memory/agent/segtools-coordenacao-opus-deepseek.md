---
name: segtools-coordenacao-opus-deepseek
description: "Modelo de trabalho do segtools/Sofon — Opus coordena, revisa e despacha; DeepSeek Flash coda; decisões pendentes para assumir a coordenação"
metadata:
  node_type: memory
  type: project
  originSessionId: a43ab404-8270-4852-85e4-466c7dc32dd4
  modified: 2026-09-26T03:49:19.506Z
---

Desde 2026-09-26 o dono quer o segtools/Sofon coordenado como o Fabber: esta sessão (Opus) coordena, revisa no disco e despacha; o worker que coda é o DeepSeek Flash (esforço `low`). Metodologia = skill `agent-coordination` ATUAL do Fabber (`D:\onedrive\clients\fabber\repositorio\.claude\skills\agent-coordination\SKILL.md`, com as correções de 25/09: timeline + inbox, watchdog = ciclo real com worker vivo, progress contract, máx 2 workers pesados). O segtools tem só uma cópia ANTIGA da skill e nenhum mecanismo de despacho (`ds-worker*.sh`, `worker-inbox-hook.sh`, `worker_events.py`, `agent-worktree.sh`, CLI `claude` no devcontainer).

**Decisões pendentes do dono (perguntadas em 2026-09-26, sem resposta ainda):**
1. Como o DeepSeek atual roda (Claude Code apontado p/ DeepSeek? OpenCode?) e qual chave usa — tem de ser chave do segtools/Sofon, nunca a do Fabber (AGENTS R1 proíbe credenciais do Fabber).
2. Onde o worker DeepSeek roda e como eu falo com ele. ATENÇÃO: a sessão "00 - Definicao de DB e estrutura inicial do repo" é ESTA sessão (a do coordenador), não a do worker — o dono confirmou em 2026-09-26. Hoje o dono repassa as mensagens entre nós à mão. Proposta em aberto: usar o módulo `projects` como canal (tarefas, prompts, comentários) — ver [[segtools-projects-como-canal-de-coordenacao]].
3. Escopo: coordenar C7 já; montar a infra de despacho do Fabber como ferramenta genérica (vai p/ o Sofon); SOFON-B só com sinal do dono.

**Atualização 2026-09-26 (decisões 1–3 resolvidas):** chave própria do Sofon no 1Password (item sofon/deepseek) → sops `DEEPSEEK_API_KEY`. Despacho portado em `tools/worker/` (Node, sem Python); worktree `.worktrees/<id>` + symlink de node_modules criado no container; prompts em `.cache/prompts/`. 1ª tarefa: PROJ-CHANNEL-1 (dados+serviço+CLI: comentários tipados com @menção→notificação, anexos prompt/spec/reference/study, eventos, autoridade delivered/reviewed). Fatia 2 = MCP; UI usa `docs/reference/ux/kanban-refs.md` + jira-dot.

**Why:** o worker errava muito em verificação e julgamento (dizer "feito" sem estar, hipóteses sem medir, escopo crescendo, docs contraditórios) — um coordenador que confere no artefato pega isso.
**How to apply:** ao retomar, reler este arquivo e [[segtools-revisao-pendente]], confirmar as decisões acima com o dono antes de despachar, e seguir [[segtools-direcionamento-consolidado]].
