---
name: papeis-po-coordenador
description: "REGRA ATUAL (dono, 26/09 02:5x): responder TODA mensagem do dono primeiro e NÃO agir sem confirmar com ele antes"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a43ab404-8270-4852-85e4-466c7dc32dd4
  modified: 2026-09-26T05:52:06.175Z
---

**Regra vigente (dono, 2026-09-26 ~02:55 BRT), substitui a anterior:**
1. **Nunca ignorar mensagem do dono.** Toda mensagem dele — inclusive as que chegam no meio de uma tarefa — é respondida PRIMEIRO, ponto a ponto, antes de qualquer outra coisa.
2. **Não agir sem confirmar antes.** Antes de executar/despachar/commitar/merge/editar, dizer o que pretende fazer e esperar o ok explícito. Heartbeat/watchdog não autorizam ação nova.

**Why:** na mesma noite eu (a) segui corrigindo e ignorei pedidos dele várias vezes, (b) despachei workers quando ele só tinha pedido uma lista para decidirmos juntos, (c) marquei revisão como feita antes de conferir. Ele proibiu explicitamente.
**How to apply:** ao receber mensagem: parar, responder cada ponto, propor o próximo passo e aguardar. Ciclos automáticos: no máximo leitura/relato, sem agir. A regra anterior ("coordenador decide sozinho, só pede ok em arquitetura/produto") está REVOGADA. Ver [[segtools-coordenacao-opus-deepseek]].
