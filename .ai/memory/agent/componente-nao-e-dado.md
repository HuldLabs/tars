---
name: componente-nao-e-dado
description: Todo componente de UI é do Sofon (@sofon/ui); app e módulos só fornecem dados/config que o componente renderiza
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T15:11:06.306Z
---

Componente é sempre do framework (`@sofon/ui`). O app (hub) e os módulos não têm componente próprio: fornecem DADOS/config (itens do menu, colunas, campos) que o componente genérico renderiza — render burro, config única, registry.

**Why:** em 29/09 classifiquei `app-sidebar` "com o menu do hub" como componente do app; o dono corrigiu: "você está confundindo componente com dado. O hub não tem um menu, usa o componente menu e renderiza seus dados".

**How to apply:** ao decidir onde um componente mora, separar o desenho (Sofon) do dado (módulo/app). Componente que "sabe" de issue/board está errado: vira genérico + dado vindo do módulo. Relacionado: [[hub-e-app-de-negocio]], [[kanban-componente-unico]].
