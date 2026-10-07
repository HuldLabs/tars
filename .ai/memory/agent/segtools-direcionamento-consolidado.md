---
name: segtools-direcionamento-consolidado
description: "Direção decidida para segtools e Sofon (framework × app, modelo B, camadas, Kysely, prioridades do produto)"
metadata:
  node_type: memory
  type: project
  originSessionId: a43ab404-8270-4852-85e4-466c7dc32dd4
  modified: 2026-09-26T05:10:38.766Z
---

Decidido pelo dono até 2026-09-26:
- **Sofon = framework** (modelo Laravel/Symfony/Rails): núcleo em pacotes versionados `@sofon/*`, app nasce de esqueleto (`sofon new`, Copier) e fica apartado; o framework nunca escreve nas pastas do app. Repo `sofon-ops/sofon` (privado), local `\\wsl.localhost\Ubuntu-24.04\home\pablo\projects\sofon`; e-mail do projeto `sofon.ops@gmail.com`; PAT em `op://secrets/sofon/github/sofon-pat-full` (ler só com a conta pessoal do op, sem OP_CONNECT/OP_SERVICE_ACCOUNT do Fabber). Commits assinados via `op-ssh-sign-wsl.exe`.
- **segtools = incubadora e primeiro app do Sofon.** Direção: **modelo B** — o código do framework passa a morar no repo do Sofon e o segtools consome por link local; nunca copiar o histórico do segtools para o Sofon (tem dados de clientes, P-10).
- **Camadas:** `packages/core` (kernel, sem dependências) · `packages/platform` (runtime do banco, migrador, jobs/auth/tenancy) · `modules/<id>` (dono de migrações, porta e adapter em `db/**`) · temas · app só monta.
- **Banco:** SQL-first (migrações SQL são a fonte, por módulo, com ledger, advisory lock e validador pós-migração) + Kysely (instância única `getDb()`, tipos via `kysely-codegen`), ports & adapters por domínio, sem adapter em memória para dados. Driver `pg`; postgres.js só por gatilho medido. Sofon oferece catálogo de provedores por capacidade (bancos, linguagens, Temporal e alternativas, linters).
- **Gerenciador de pacotes:** Bun (decisão do dono).
- **Só dev local** até amadurecer; OneDrive é lugar provisório do repo (vai para VM).
- **Prioridade do produto:** C7 → C4 (RLS) → terminar LEG → primeiro relatório R1 real. Módulo `projects`: candidato a primeiro módulo oficial do Sofon.

- **Pendente (26/09, dono pediu para NÃO alterar ainda):** a regra "Python proibido" (ADR-003 + `config/file_placement.toml` família `script-python`, criada por worker em 25/09) contradiz o Sofon poliglota (Python + TS). Proposta: app segtools segue Node/TS; Python liberado para tooling/dados/infra/pacotes Python do Sofon. Só aplicar quando o dono mandar. **Posição do dono:** Python > sh (todo host/prod tem Python; venv traz deps; mais linear entre hosts) — seguir o Fabber (tooling `.sh`→`.py` em venv). Registrado em `BACKLOG:LANG-POLICY` (refinando).

**Why:** evitar reconstruir a base a cada sistema e manter o produto andando enquanto o framework nasce.
**How to apply:** toda revisão/despacho segue isto; mudanças de rumo só com o dono.
