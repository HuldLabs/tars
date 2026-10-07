---
name: sofon-self-service
description: "Tudo no Sofon (módulos, plugins de módulo, camada de IA) é item de catálogo self-service; cada sistema instala só o que usa"
metadata:
  node_type: memory
  type: project
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T19:30:15.102Z
---

Decisão do dono (02/10/2026): o Sofon é framework, então **cada sistema usa só o que precisa**. Módulos, plugins de módulo (ex.: `projects` + checklist/sdd/workflow/ai-duplicates) e a camada de IA (skills, papéis, guards) são itens versionados de um **catálogo próprio e privado**, instalados por CLI (`sofon add module <x>`, `sofon-ai add skill <y>`) com lockfile e ciclo idempotente (instalar → migrar → registrar config → habilitar, e o inverso). É o "Flex recipes" do `sofon/docs/extraction-prompt.md` Etapa 2.0.

**Why:** o dono, ao discutir o catálogo de skills: "a mesma coisa os módulos e plugins do segtools… é o mesmo modelo self service. O sistema usa o que precisa pois ele é um framework."

**How to apply:** na extração (SEG-661 fase 1, SEG-33 fase 2), todo módulo/plugin extraído tem de nascer instalável e desinstalável sozinho, com manifesto e dependências declaradas; nada de módulo que só funciona porque outro está ligado por acaso. Registrado em SEG-186. Relacionado: [[camada-ai-agnostica]], [[hub-e-app-de-negocio]].
