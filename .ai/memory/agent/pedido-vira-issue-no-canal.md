---
name: pedido-vira-issue-no-canal
description: "Todo pedido ou ideia do dono vira issue no módulo de projetos na hora, depois de procurar duplicada e épico"
metadata:
  type: feedback
---

Todo pedido, ideia ou capacidade nova que o dono mencionar vira issue no canal (módulo de projetos) na mesma hora. Nada fica só na memória da conversa, nem "faço depois" dito em texto.

Antes de criar: procurar se já existe issue do mesmo assunto (no canal E na conversa recente), decidir se é filho de um épico existente ou se precisa de épico novo, e ligar o pai.

**Why:** em 28/09 o dono pediu para ler as chamadas HTTP do Jira e eu só respondi em texto. Ele lembrou que o módulo de projetos existe justamente para tirar os pedidos da memória.

**How to apply:** pedido novo → buscar duplicada → escolher o pai → `create_issue` → `edit_issue parent` → só então responder, citando a key. Ver [[setas-no-print-sao-pedido]].
