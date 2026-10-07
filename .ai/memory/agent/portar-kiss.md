---
name: portar-kiss
description: Todo porte de benchmark é KISS — portar a ideia na nossa proporção, estender o que já existe, menor código que resolve a dor de hoje
metadata:
  type: feedback
---

Ao portar algo de um benchmark (REGRA 1), portar a **ideia**, não o código inteiro: a menor implementação que resolve a dor que temos hoje, estendendo a ferramenta que já existe antes de criar pacote novo, numa linguagem só. Recursos que o original tem mas a nossa escala não pede (índices, camadas, retenção, score, similaridade, curadoria automática) ficam de fora até aparecer a dor — e o delivery diz o que ficou de fora de propósito.

**Why:** regra do dono (03/10): "porte as coisas sempre no modo KISS! como isso pode ficar mais curto, eficiente, performático?". Caso: o motor de memória do farmega.v2 tem 4.760 linhas; nós temos 45 entradas. O porte virou uma extensão do `tools/framework/ai-memory.mjs` com meta de < 200 linhas.

**How to apply:** todo prompt de porte traz meta de tamanho, a ferramenta existente a estender e a lista do que NÃO portar. Na revisão, linhas adicionadas (`git diff --stat`) contam como critério. Relacionado: [[sem-legado-sem-retrocompat]], [[estado-da-arte-antes-de-construir]].
