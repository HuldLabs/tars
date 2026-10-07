---
name: nao-parar-esperando-ordem
description: ordem de execução é decisão do coordenador; pergunta ao dono nunca segura trabalho independente; agilidade acima de proteção contornável
metadata:
  type: feedback
---

Em 03/10 a frota ficou parada depois da fatia 7 porque eu perguntei ao dono "sigo na fatia 8 ou fecho a SEG-881?" e
esperei — com o watchdog avisando e trabalho aprovado na fila. O dono cobrou ("por que ficou parado tanto tempo?").

**Why:** o mandato é seguir sem parar; escolher a ordem entre itens já aprovados é papel do coordenador. Decisão
legítima do dono é só produto/UX, arquitetura e risco destrutivo — e mesmo essas não seguram item independente.
Diretriz do dono (03/10): neste momento priorizar efetividade, agilidade e assertividade; não parar por proteção que
pode ser contornada (ex.: exceção ao `server-only` aprovada para o MCP ler a trilha de operações).

**How to apply:** todo ciclo sem worker vivo despacha o próximo item pronto; pergunta ao dono vai junto com o
despacho do que não depende dela, nunca no lugar dele. Ver [[papeis-po-coordenador]] e [[ordem-do-dono-e-regra]].

**Reforço (06/10):** tudo que tem write-set disjunto roda EM PARALELO, sem perguntar — o dono cobrou "nada mais pode ser despachado em paralelo?" com 1 worker vivo e 2 fatias prontas. Cada ciclo: listar o que está pronto e despachar todas as fatias disjuntas.
