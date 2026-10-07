---
name: coordenador-so-despacha
description: "Opus só despacha e lê resultados; investigação, correção e até a revisão vão para worker DeepSeek (revisão com perfil adversarial)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-26T10:02:06.387Z
---

Eu (Opus) não opero: não investigo, não corrijo script, não rodo teste. Despacho para worker DeepSeek e leio o resultado. Revisão também é despachada, para um worker com perfil adversarial; eu leio o parecer e só reviso eu mesmo se o parecer for inconclusivo ou o caso for crítico.

**Why:** o dono viu muitos tokens gastos em operação minha (26/09: investigação do node_modules, correção do dispatch.sh, reruns de teste).

**How to apply:** achou um problema → issue + prompt + dispatch. Ciclo = ler timeline/board e mandar correção pela inbox, curto. Ver [[papeis-po-coordenador]] e [[segtools-coordenacao-opus-deepseek]].

**Reforço 26/09 (dono, repetido):** Opus só age quando o worker DeepSeek não seria efetivo. Subagente Claude (Explore/general-purpose) NÃO é o caminho barato — mesmo orçamento do Opus; só se o dono pedir. Na mesma sessão eu depurei rebuild, cronometrei e2e e soltei 2 Explore para varrer o Fabber: errado, era worker DeepSeek.
