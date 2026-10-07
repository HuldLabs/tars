---
name: mcp-projects-fica-velho
description: O servidor MCP `projects` da minha sessão roda o código de quando subiu; depois de entregas no módulo, reiniciar para pegar o código novo
metadata:
  type: feedback
---

O `bun scripts/projects-mcp.ts` da minha sessão é um processo longo: não recarrega código. Em 28–29/09 ele rodava o código das 18:05 UTC e o `apply_sdd_preset` criava abas AC/DEL vazias, embora a SEG-520 já estivesse no `main`.

**Why:** eu achei que o preset estava quebrado; era o servidor velho.

**How to apply:** depois de entregas que mexem em `scripts/projects*.ts`, `packages/core` ou plugins do projects, reiniciar: achar o pid em `/proc` do container (`*projects-mcp*`) e `docker exec segtools-dev node -e "process.kill(<pid>)"`; o harness sobe de novo na próxima chamada. Tools novas (ex.: `upsert_rule`, `bind_rule`) só aparecem depois disso.
