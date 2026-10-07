---
name: hub-e-app-de-negocio
description: "apps/hub é app de NEGÓCIO que consome o Sofon; serviço core (IA, jobs, mensageria, IAM) mora no framework (packages/core + packages/platform), nunca no hub"
metadata:
  node_type: memory
  type: project
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T14:37:04.461Z
---

Modelo do dono (29/09):
- **Sofon** é o framework, a base (core + platform + serviços core).
- O **segtools** é composto de módulos de NEGÓCIO que usam o Sofon: o hub, a auditoria (security), a extração e assim por diante.

O `apps/hub` é um desses módulos de negócio. É um módulo que ainda não foi portado para a regra de módulos. O `apps/hub/lib` liga só o que é do hub.

Serviço core do Sofon:
- portas em `packages/core`;
- adaptadores com driver em `packages/platform/<serviço>`;
- composição no bootstrap do framework.

Nunca criar adaptador core novo no hub. A dívida atual (`getDb()`, jobs, mensageria e IAM ainda em `apps/hub/lib`) está no `HANDOFF.md` como "platform PARCIAL", e destrava com a SOFON-B / SEG-33 (2 repos, link `@sofon/*`).

**Why:** o dono corrigiu em 29/09. Eu tinha proposto os adaptadores de IA em `apps/hub/lib` sem ler o handoff; a separação já tinha começado e ficou parada.

**How to apply:** antes de propor onde um arquivo mora, ler `HANDOFF.md` §direção, `config/file_placement.toml` e `docs/TOOLING-LAYOUT.md`. ADR-017 já corrigido. Relacionado: [[kanban-componente-unico]].
