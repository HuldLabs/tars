---
name: falta-de-uso-nao-e-falta-de-peca
description: Peça do DS sem consumidor pede adoção, não peça nova; o DS guarda tudo e a adoção é cobrada na tela
metadata:
  type: feedback
---

Peça que existe e ninguém usa pede adoção, nunca peça nova. O DS guarda tudo (mesmo sem consumidor; cada app
escolhe o que usa); a entrada exige ficha completa, e a adoção é cobrada na tela.

**Why:** decisão do dono, 06/10. Antes o `ds-gate` reprovava peça com < 2 consumidores; o dono tirou o gate e
manteve a contagem como informação (campo `consumers` da ficha).

**How to apply:** antes de criar, procurar em `packages/ui`; peça sem uso gera adoção na tela, não peça nova. Ver
[[design-nao-bloqueia]], [[componente-nao-e-dado]].
