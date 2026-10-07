---
name: prints-do-dono
description: Todo print/insight que o dono mandar sobre uma demanda vai para docs/reference/ux/<tema> + README E vira anexo (attach) na issue
metadata:
  node_type: memory
  type: feedback
  originSessionId: e3c9eb95-84b0-4e85-a492-88c75ab39612
  modified: 2026-10-02T11:37:49.583Z
---

O dono autorizou em 26/09: "pode salvar todos os prints que eu mandar". Salvar sem perguntar.

**02/10 (dono):** "temos área de anexo nas issues; por que as evidências de bugs e insights de funcionalidades que mando não estão lá?" — o arquivo no repo não basta: **todo print ligado a uma demanda vira anexo da issue** (`attach`, `kind: reference` para referência externa como Jira; `kind: evidence` para bug/estado do nosso sistema), no mesmo passo em que a issue é criada ou atualizada. A exceção antiga ("print do nosso sistema não se salva") vale só para print que não é sobre demanda nenhuma (ex.: "está rodando").

**How to apply:** copiar da pasta de imagens da sessão para `docs/reference/ux/<tema>/` (via `docker cp`; a pasta pode já existir — **acrescentar** ao README, nunca sobrescrever), commit, e `attach` na issue com título que diga o que o print mostra. Insight/link do dono → `attach` com `url` ou citação no corpo. Regra também na skill `segtools-sdd` §Anexos. Relacionado: [[issue-sempre-com-sdd]], [[pedido-vira-issue-no-canal]].
