---
name: legenda-termos-tecnicos
description: "Termos de LLM, busca e testes (recall, MRR, FP, embedding, RRF, oracle...) sempre explicados entre parênteses ou numa legenda no início/fim da resposta"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f29330d0-976d-4ab3-ae60-1fb6ed52c4ae
  modified: 2026-10-01T19:01:50.912Z
---

Ao usar termos técnicos de LLM, busca semântica ou testes/benchmarks (recall, r@1, MRR, falso positivo, oracle, ponta a ponta, ouro, embedding, vetor, RRF, BM25, FTS, chunk/trecho, MaxP, fan-out, reranker, top-K, juiz, calibração etc.), colocar o significado entre parênteses na primeira menção ou numa legenda curta no início ou no fim da resposta.

**Why:** pedido do dono em 01/10 ("recall, quero que sempre que falar dos termos relacionados a LLM/busca/testes coloque o significado").

**How to apply:** toda resposta com esses termos ganha a explicação; preferir legenda no fim quando houver vários termos. Ver [[responder-em-portugues]].
