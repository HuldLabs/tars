---
name: so-homolog-e-do-dono
description: No fluxo do canal SEG só a homologação (qa-done/homolog-doing → done) é do dono; todos os outros status eu movo
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T12:33:33.357Z
---

No fluxo do canal SEG, **só a homologação é do dono** (de `qa-done`/`homolog-doing` para `done`). Todas as outras etapas — aceitar o veredito do revisor e mover para `qa-done`/`qa-doc-done`, mandar para `fix-needed`, levar à homologação — eu executo sem pedir.

**Why:** 02/10 o dono disse "apenas homolog é comigo, as outras você deve atuar". No mesmo dia, com 457 itens acumulados em `qa-done`, ele mandou fechar todos como `done` em lote ("não tenho como homologar manualmente todas") e disse que **de agora em diante homologa de forma constante**.

**How to apply:** revisão PASS → `qa-done` e sigo; FIX → `fix-needed` + redespacho. O que já estava em `qa-done` até 02/10 foi fechado em lote (bulk `qa-done`→`done`, notify false). Daqui em diante NÃO fecho `done` por conta própria: deixo em `qa-done` para o dono homologar no ritmo dele, e aviso quando a fila crescer. Relacionado: [[papel-po-operacional-e-opus]], [[papeis-po-coordenador]].
