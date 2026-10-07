---
name: revisar-contexto-inteiro-antes-de-apontar-defeito
description: "Antes de apontar um defeito no código de um worker, ler o trecho inteiro (a função/bloco), não só a linha do grep"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a43ab404-8270-4852-85e4-466c7dc32dd4
  modified: 2026-09-26T03:26:20.996Z
---

Ler o bloco completo (função, componente, server action) antes de afirmar um defeito; um `grep` com a linha solta não basta.

**Why:** em 2026-09-26 afirmei que `runDueJobs()` executava no render de `/admin/jobs` com base num grep da linha 18; a chamada estava dentro de uma server action (`"use server"`). O worker DeepSeek conferiu e me corrigiu — o coordenador errou justamente a regra "verificar no artefato, não no resumo".
**How to apply:** em toda revisão, abrir o arquivo no trecho relevante (Read com contexto) antes de reportar; se a afirmação vem de busca, confirmar lendo o entorno.
