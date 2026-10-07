---
name: segtools-database
description: Regras e filosofia de banco/SGBD do segtools (PostgreSQL-first, camadas bronze→gold, índices, migrations, ETL/ingestão, jobs, roles). Carregar ANTES de mexer em schema, migration, query, índice, ETL/pipeline de dados ou job no repo segtools.
---

# Banco / SGBD do segtools — quando carregar e o que ler

**Fonte única:** `docs/DATABASE.md`. Esta skill só **orienta** (não duplica a regra — evitar drift).

## Quando carregar
Qualquer trabalho com: schema/tabela, migration, query, índice/performance de banco, ETL/pipeline de dados,
fila/ingestão, jobs, backup/persistência, escolha de ORM.

## O que ler por situação
| Situação | Ler |
|---|---|
| Criar/alterar tabela, chave, schema | `docs/DATABASE.md` §1–2, §9 (perguntas), §10 (anti-padrões) |
| Índice/performance/query lenta | §3 (BRIN/partial/covering/statistics/EXPLAIN) |
| Migration | §7 + `tools/framework/db/migrate.mjs`, `apps/hub/migrations/`, ledger `platform.module_migrations` |
Em **produção** a migration exige **duas** variáveis explícitas: ambiente marcado como prod **e** flag de
autorização de migration em prod — segunda trava para o passo mais destrutivo e irreversível do ciclo.
(fonte: farmega/docs/strategy/roadmap-decisions.md:186)
| Largura de coluna × dado de runtime | §7 — o gate confere todo par coluna/largura: `varchar(36)` ×
  43 chars do runtime (`ER_DATA_TOO_LONG`) só aparece no caminho real; PEM multilinha em campo de texto
  corrompe em silêncio (use anexo de arquivo). (fonte: fabber/tests/contracts/test_identity_column_widths.py:4,88, fabber/HANDOFF-HISTORY.md:8955,6556) |
`core.actors` é **VIEW** desde a 0011 → migration nova **não pode** ter FK para ele (FK só aponta para
tabela; guarde o handle como texto). Migration de identidade combina `kind` com default e
`password_hash NOT NULL` num CHECK com CASE. (fonte: docs/projects-ui/proj-ui-3-lessons.md:11, docs/projects/iam-users-1-lessons.md:27,33)
| Regra de negócio no banco (`COMMENT ON`, nome de constraint/trigger) | `docs/STANDARDS.md` §12 (marcador `BR-*`: id no `COMMENT ON` **e** no nome do objeto, declarado **na migration**) |
| ETL/ingestão/auditoria de alvo | §1, §4, §4b (temporalidade/linhagem/governança), §4c (fila/pipe) |
| Jobs | §5 + `packages/core` (jobs/messaging) |
| Roles/segredos/hardening | §6 + `docs/security/*` |
| Escolher ORM/query-builder | `BACKLOG.md` → `DB-ORM` + `docs/DB-DECISION.md` |
| Onde o estado vive / backup | `docs/PERSISTENCE.md` |
| Padrões gerais de código | `docs/STANDARDS.md` |

## Filosofia (resumo; detalhe no doc)
- **PostgreSQL-first**; schema = fronteira de uso (não pasta).
- **Camadas**: bronze(`staging`) → silver(normalized) → gold(`core`) → diamond(`projection`); importers escrevem
  bronze/silver; **promoters** escrevem o gold; projections **só leem**.
- **Regras físicas**: PK `bigint identity`; FK interna `bigint`; `uuid` só público; dims `smallint`; JSON **fora** do
  hot path; `ondelete` = lifecycle (`CASCADE`/`SET NULL`); **sem triggers/lógica de negócio no DB**.
- **Ingestão**: bitemporal (`valid_from/valid_to` × `observed_at`), linhagem por `payload_hash`, governança
  (diff→review→promotion), fila durável (`SKIP LOCKED`+heartbeat+stalled+dead-letter), pipe-and-filters
  (**pipe = Postgres**; RabbitMQ/Redis descartáveis).
- **Nunca**: inferir domínio no SQL com `LIKE`; esconder regra principal em `JSONB`; dashboard como histórico;
- **Nunca** deixar o sistema de tipos do upstream decidir a coluna: `number` do Better Auth sempre vira
  INT (32 bits) e estoura em ms de timestamp — sem `bigint` no ORM, o fix upstream é impossível; use um
  `ALTER` idempotente no deploy, provado por caso negativo em container. (fonte: fabber/DELIVERED.md:340,741,733,745)
  rollback destrutivo como rotina; string repetida em hot path.
- **Determinismo do derivado**: registrar `transform_version`; separar derivado × origem (origem não se reconstrói).
- **A fonte carrega sua natureza** (oficial/regulatória, comercial, manual, derivada) — ela alimenta a
  fila de revisão, a precedência entre propostas concorrentes e o rigor do override; correção manual em
  dado de fonte oficial é **override auditado** (motivo estruturado, ator). (fonte: farmega/docs/strategy/roadmap-decisions.md:274,278,258,268)

## Proveniência (R1)
`farmega.v2` — `AN-006/008/009/013/016/019`, `BP-002`, `ADR-FV2-003/005/006/009/011`; `seo-expert` — `ADR-035/037/049`
+ `docs/operations/{data-foundation,database-environments}`. (Repos de terceiros: **somente leitura**.)
