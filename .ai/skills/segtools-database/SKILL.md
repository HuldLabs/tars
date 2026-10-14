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

## Porta tipada por domínio: o SQL mora no adapter

**A porta expõe MÉTODO DE DOMÍNIO, nunca `query(sql)`.** O ponto de entrada do banco no
resto do sistema é uma interface por domínio (`Orders.byId(id)`, `Catalog.search(term)`) —
não um executor que recebe string.

- **Por que a string proibida:** um `query(sql)` expõe o **dialeto** e o **schema** a cada
  chamador. Cada `SELECT` escrito no meio da regra de negócio é uma costura a mais: o
  índice que muda, a coluna que renomeia, o `JOIN` que vira N+1 — nada disso tem fronteira
  para ser corrigido em um lugar. A porta tipada é o que permite **otimizar sem tocar em
  quem chama** (R2: menos código, mesma função, medido).
- **O SQL mora no adapter**, e o adapter é a única camada que conhece o driver
  (`pg`/`kysely`/`postgres`). Quem está acima recebe **tipo de domínio** (a entidade, o DTO),
  nunca linha crua nem builder vazado.
- **O teste que decide:** dá para trocar o índice, fundir duas queries em uma, ou mudar o
  `WHERE` sem editar nenhum arquivo fora do adapter? Se não, a porta está vazando SQL.
- **Regressão cobrável:** import de driver **fora** do diretório de adapters **reprova**. É
  a forma mecânica de manter a fronteira — sem gate, a string volta na primeira pressa.
- Detalhe da porta por domínio: `docs/QUERY-LAYER.md`. (fonte: `coleta-segtools` 5.4,
  `eco.md` N1-N8)

## Reconciliar o schema ANTES de portar (R1 aplicado a banco)

Antes de portar schema de um repo para outro, **reconciliar** — levantar o que **já** foi portado. O
achado do `seo-brain` (2026-10): a base do `seo-expert` já estava portada e o **gap era só o lado cliente**;
portar de novo teria re-feito o que existia. A regra é o R1 ("já existe? onde?") aplicado ao banco, e o
custo de pular é recolocar em produção uma migração que já rodou — e migrations não voltam.

- **Medir o delta antes de escrever qualquer migration.** Compare schema-alvo × schema-origem pelos
  **objetos** (tabela, coluna com tipo/largura, índice, constraint, `COMMENT ON`), não pelo que a doc diz.
  O delta é a única coisa que entra; o resto já está lá.
- **O gap se expressa por lado.** Nomeie o que falta com precisão: *"o gap é só o lado X"* (cliente, servidor,
  ingestão, projection) evita a armadilha de "portar o módulo" quando só uma ponta mudou.
- **A fonte da verdade é o banco vivo, não o repo de origem.** O ledger de migrations
  (`platform.module_migrations`) diz o que foi aplicado; um arquivo de migration no repo de origem não prova
  que ele chegou aqui. Reconcílie contra **o alvo**.
- **Idempotência é a prova.** O resultado é uma migration que, rodada de novo num alvo já reconciliado, não
  muda nada — e um diff de schema **vazio** depois de aplicar é a evidência de que o delta estava certo.
- **Nunca reescreva migration já aplicada** para "encaixar" o delta: ela é imutável (doutrina
  `migration-imutavel`); o delta vira migration **nova**.
  (fonte: seo-brain/HANDOFF.md, seo-brain/docs/BACKUP.md)

## Conexão e carga: as regras que o incidente ensinou

- **Nunca conexão global de longa duração.** Abre → executa → **fecha** por chamada, com o `close()`
  no `finally`. Conexão de vida longa guardada no módulo é o pior dos dois mundos: sobrevive ao erro
  que a corrompeu (transação abortada, `search_path` sujo, timeout de sessão) e a chamada seguinte
  herda o estado sujo **sem sintoma no ponto de uso**. O pool resolve o reuso — não o handle global.
- **Carga em massa em batch, nunca `row-by-row`.** Um `INSERT` por linha troca uma operação por N idas
  ao servidor e transforma o import numa fila de latência: `COPY`, `INSERT ... SELECT` ou lote de N.
  Onde o motor é **estendido** (ex.: `pg_duckdb` lendo Parquet), deixe o hook de extensão interceptar
  em vez de reescrever a ingestão caso a caso.
- **Agendador: dispare o caminho, não espere o relógio.** Teste de job agendado que dorme até o
  horário é lento, instável, e prova o relógio — não o job. Chame o gatilho real (`triggerSchedule`)
  e aguarde o **resultado**: a asserção é sobre o efeito, com o mesmo tratamento de erro do caminho
  agendado.
- **Fail-closed.** Ausência de trava, de gate ou de verificação **REPROVA** — nunca `return` silencioso,
  nunca "não achei nada, então sigo". O par é a doutrina `metodo/contramedida-testada`: a contramedida
  só existe quando um teste **negativo** a cobra.

## Migração destrutiva vai em três fatias: expand → migrate → contract

Renomear coluna, trocar tipo, partir tabela: a mudança que cabe num deploy é a que **não**
derruba quem ainda usa a forma antiga. Fazer tudo numa migration só é o que produz janela
de erro — o instante entre o schema novo e o código novo em que **nenhuma** das duas versões
funciona. A fatia resolve isso em três passos, cada um **sozinho** seguro de aplicar:

1. **expand** — adicione a forma nova sem tocar na antiga (a coluna nova, a tabela nova, o
   índice novo). Nada lê a forma nova ainda, então aplicar é inócuo.
2. **migrate** — backfill dos dados + deploy do código que passa a escrever na forma nova
   **e** ler de ambas. A forma antiga continua viva e correta durante todo o passo: é a
   compatibilidade que permite ir e **voltar** sem perda.
3. **contract** — só depois de o passo 2 estar em produção e estável, remova a forma
   antiga. Se ele falhar, o revert é o passo 2, não um restore de backup.

- **Cada fatia é uma migration própria** — nunca as três num arquivo só, e nunca
  reescrevendo a já aplicada (a imutabilidade vem antes de conveniência).
- **O `contract` espera o relógio do sistema, não o do autor.** Ele depende de o passo 2
  estar de fato rodando em todo lugar; aplicar no mesmo dia é como não ter fatia nenhuma.
- **A prova de cada fatia é a idempotência** — reaplicar não muda nada e o diff de schema
  é vazio; e o passo 2 se prova rodando com as duas formas presentes.

Origem (R1): curadoria 14/10, `seg-agentmem-1` #3.

## Proveniência (R1)
`farmega.v2` — `AN-006/008/009/013/016/019`, `BP-002`, `ADR-FV2-003/005/006/009/011`; `seo-expert` — `ADR-035/037/049`
+ `docs/operations/{data-foundation,database-environments}`. (Repos de terceiros: **somente leitura**.)
