---
name: segtools-revisao-pendente
description: O que ainda precisa ser revisado/conferido no segtools e o que já foi respondido ao worker DeepSeek (estado 2026-09-26)
metadata:
  node_type: memory
  type: project
  originSessionId: a43ab404-8270-4852-85e4-466c7dc32dd4
  modified: 2026-09-26T03:26:07.363Z
---

**Último commit do worker conferido:** `1489345` (SOFON-LAYER-GATE: `tools/layers.mjs` com camadas kernel/platform/module/theme/app + G4/G5 no layout-check). Correto.

**Correção minha registrada:** eu disse que `runDueJobs()` rodava no render de `apps/hub/app/(app)/admin/jobs/page.tsx`; estava ERRADO — está numa server action (`runDue`, "use server", linhas 14–20). Ver [[revisar-contexto-inteiro-antes-de-apontar-defeito]].

**Resposta enviada ao worker sobre o C7 (via dono):** começar pelo runner liga/desliga. Critério de pronto: liga/desliga só com admin, via server action; porta sempre do `tools/ports.mjs`; clone em `<asset>.localhost:<porta>`; desliga por inatividade; registra PID e limpa órfãos no boot; só controla processo que ele iniciou; testes: ligar → iframe mostra o clone; desligar → "clone parado"; e2e de isolamento passando com clone REAL, não stub.

**Ainda a conferir no disco quando o worker entregar:**
- C7 runner + publicação do range 47100–47999 no devcontainer.
- Separação core/platform: hoje só tipos (`packages/platform/src/db/schema.ts`); `getDb()` e adapter de jobs seguem em `apps/hub/lib` — só vira real com SOFON-B.
- Módulo `projects`: UI está no tema do app (`themes/seg-v1/templates/projects*.tsx`, `apps/hub/components/project-board.tsx`) e o banco em `core.*` via `apps/hub/migrations/0005_projects.sql` — para ser módulo oficial do Sofon precisa de templates padrão próprios, schema `mod_projects` e migrações dentro do módulo.
- Docs contraditórios: `DATABASE.md` §0/§11 e `CORE-SERVICES.md` §2/§9 ainda falam de `DbPort` SQL direto (código já é Kysely).
- Comentário do `infra/compose.yaml` ("backup = pg_dump → commit") contradiz P-10.
- Mounts do devcontainer após a mudança `hub/` → `apps/hub/` (node_modules/.next não podem ser pastas reais no OneDrive).

**How to apply:** verificar cada item no artefato (ler o trecho inteiro, rodar o teste) antes de marcar revisado.
