---
root: true
targets: ["codexcli", "opencode"]
---

# AGENTS.md — regras operacionais do repo `extracted-3dtools`

Monorepo de **extração de apps (offline)** e **testes de segurança** (clientes autorizados).
Este arquivo é lido por agentes no início da sessão. Siga-o por padrão, sem precisar que o usuário peça.

## R1 — REGRA 1 (perene, a mais importante): já existe? onde? portar a ideia.

**A cada passo, antes de decidir ou criar qualquer coisa, pergunte: "isto já foi resolvido? onde e como?"** — e
**porte a lógica / metodologia / scaffolding**, adaptada à nossa proporção (R2). Reinventar a roda é proibido.

- **Onde procurar, nesta ordem:** (1) o próprio repo (código, testes, docs, memória `.ai/memory/`); (2) os nossos
  outros projetos e benchmarks, somente leitura; (3) o mercado (padrões abertos, papers, repos maduros, docs
  oficiais — skill `senior-research`). Quais são os benchmarks, onde ficam, o que cada um tem de melhor, como
  comparar cópias e o mapa de adoção: **`docs/BENCHMARKS.md`** (fonte única; aqui só o ponteiro).
- **Ler o arquivo real**, nunca recriar de memória nem "pelo que foi dito". Citar no delivery a fonte lida
  (caminho + versão/HEAD) e registrar a adoção no mapa.
- **Fontes ouro além do código:** handoffs, backlogs, roadmaps, worklogs, issues/board e **testes** — os testes
  materializam problemas reais e como evitá-los; leia-os antes de reprojetar lógica, ingestão ou contrato.
- **Vale para conhecimento** (padrões, método, tarefas, design system, API, testes, processo), nunca para runtime.
- **LIMITE DURO:** benchmarks são **SOMENTE LEITURA** — nunca escrever, criar ou apagar nada lá; mensagem para o
  agente de outro projeto vai pelo dono. Porta-se **lógica**, **nunca** credenciais, bancos, dados, segredos,
  arquivos de ambiente, hosts ou infra de outro projeto: cada projeto é apartado.

## R2 — MANTRA KISS (regra do dono, 03/10): menos código, mesma função, mais rápido

**Toda mudança pergunta: "dá para ficar mais curto, mais leve e mais rápido sem perder funcionalidade?"**

- **Estender antes de criar.** Ferramenta, componente ou módulo que já existe ganha a capacidade; pacote/arquivo novo
  só quando não houver onde caber. Uma linguagem por ferramenta.
- **Portar a ideia, não o código** (casa com a R1): a menor implementação que resolve a dor de HOJE. O que o original
  tem e a nossa escala não pede fica de fora, e o delivery diz o que ficou de fora de propósito.
- **Sem abstração antecipada.** Nada de camada, opção, config ou pacote "para o futuro"; entra quando a segunda
  necessidade real aparecer.
- **Apagar é entrega.** Código morto, duplicado, flag sem uso, arquivo órfão: remover vale tanto quanto adicionar.
  Sem legado nem retrocompat (só o dono e o agente usam).
- **Medir, não achar.** Desempenho se prova com número (tempo, tamanho, tokens); "otimização" sem medida não entra.
- **Extração do Sofon chega enxuta (decisão do dono, 03/10).** Toda fatia que move um módulo/pacote para o Sofon:
  (1) **mede antes** — linhas, código morto (`knip`), duplicação (`jscpd`), tempo dos testes; (2) **move e enxuga na
  mesma fatia** — apaga o morto, junta toda lógica/código duplicado numa fonte única que os demais consomem, parte o
  que passa de ~400 linhas, com os testes provando a mesma
  funcionalidade; (3) **mede depois** — o delivery traz a tabela antes × depois. Ferramentas de medida, não gate.
- **Revisão conta linhas.** O `git diff --stat` faz parte do critério: entrega que resolve com menos linhas ganha;
  arquivo que passa de ~400 linhas pede justificativa ou fatiamento.

## R3 — SSOT: fonte única da verdade (regra do dono, 03/10)

**Toda regra, cálculo, validação, lista (padrões de segredo, status, schema, config) e componente existe em UM
lugar; todo o resto importa/consome dele.**

- Duplicação de lógica ou de código é **defeito**, não estilo: quem encontra junta na fonte e troca as cópias por
  consumo, na mesma entrega.
- Antes de escrever, **procurar se já existe** (`rg` dentro do container) e estender o que existe (casa com a R2).
- Vale para docs também: um fato, um lugar; os outros documentos apontam, não repetem.
- Exemplo real (03/10): a lista de padrões de segredo existia no pre-commit e no motor de memória; virou
  `tools/framework/secrets-patterns.mjs`, consumida pelos dois.

## R4 — Falhar rápido para corrigir rápido (regra do dono, 03/10)

**Comece sempre pelo menor caso: 1 ou 2 testes, ou uma pequena parte do escopo. Valide. Só então rode o completo.**

- Quanto mais cedo a falha aparece, mais barato é corrigir.
- Nunca rodar a suíte inteira, o lote inteiro ou o escopo inteiro antes de o caso mínimo passar.
- Vale para teste, ingestão, migração, despacho de worker e renomeação em massa.

## 0. Fechamento obrigatório de sessão (auto-evolução)

**Ao final de TODA sessão de análise / exploração / extração, execute a retrospectiva de
auto-evolução** definida em `.ai/governance/EVOLUTION.md` — **sem esperar o usuário pedir**:

1. Colher cada pergunta, check, controle observado (presente **e** ausente), surpresa e beco sem saída.
2. Mapear contra os bundles como **COVERED / PARTIAL / MISSING / N/A** (com `file:line`).
3. Atualizar os módulos / `hardening-baseline` / playbook / `CHANGELOG.md` para cada lacuna.
4. Escrever `docs/security/<scope>-lessons.md` (segurança) ou o fechamento do `EXTRACTION.md` (extração).
5. Atualizar o `HANDOFF.md` com o estado e o próximo passo.

"Nada novo" só vale se nomear os itens e mostrar que já estão cobertos. É o que mantém a suíte
melhorando a cada cliente.

## 1. Skills (carregar no início)

> **Modo de trabalho / preferências do dono:** **`docs/WORKING-AGREEMENT.md`** (fonte única). Coordenação via Claude Code
> (API): *o dono decida, o agente executa; em conversa não agir sem ordem; não confiar na síntese — ler o arquivo real;
> tudo vira arquivo*. Carregar no início.

- `.ai/skills/security-testing/` — auditoria/pentest (SKILL.md + módulos + `RUNBOOK.md`).
- `.ai/skills/app-extraction/` — extração live→offline.
- `.ai/skills/segtools-frontend/` — **regras REAIS do front do segtools** (DS atômico/Base UI, page models, render burro, config única, registry, tema `seg-v1`). Carregar antes de tocar UI/tema.
- `.ai/skills/segtools-database/` — **regras/filosofia de banco/SGBD** (PostgreSQL-first, camadas, índices, migrations, ETL/ingestão, jobs). Carregar antes de tocar schema/migration/query/índice/ETL/job. Fonte: `docs/DATABASE.md`.
- `.ai/skills/agent-coordination/` — coordenação de workers (skill nossa; origem Fabber registrada).
- `.ai/skills/segtools-sdd/` — **pacote SDD**: template de descrição por tipo/intenção, critério de aceite falsificável e templates de comentário por momento do fluxo. Toda issue nova sai nesse formato. Origem: farmega.v2 `.ai/patterns/sdd` + dotfiles.
- `.ai/skills/segtools-content/` — **escrever e revisar texto de verdade** (rascunho base, revisão crítica anti-IA, variabilidade editorial). Relatórios, docs, UI, descrição longa. Origem: seo-expert (`content-base`, `critical-review`, `editorial-variability`).
- `.ai/skills/segtools-writing/` — **escrita no canal**: título, descrição e comentário de issue (templates por tipo) + humanização. Carregar antes de criar issue, comentar, entregar, revisar ou escrever prompt de worker. Origem: dotfiles (`jira-model.yaml`/`contracts.yaml`/scripts Jira) + seo-expert (anti-IA).
- `.ai/skills/fabber-*` — **transitório**: 9 bundles de front/api/nextjs/debug aguardando absorção nas nossas skills (`BACKLOG:SKILLS-ABSORB`); não criar nada novo aqui.
- `.ai/governance/EVOLUTION.md` — o passo de auto-evolução acima.
- `.ai/skills/shadcn` — skill oficial do shadcn (contexto de `components.json`/registry).
- Pesquisa pessoal: vault `D:\onedrive\obsidian\ai-brain` (skill `senior-research`).

## 2. Contrato com o cliente (segurança)

- **Read-only por padrão.** Writes só **em objetos próprios** e **revertidos**, com re-leitura do post-state.
- **Nunca** exfiltração de dados de terceiros; medir volume/forma, não baixar as linhas. PII mascarada no entregável.
- **Nunca** DoS/flood; rate-limit de login não é medido em volume (registrar como UNTESTED).
- Evidência crua + `sha256` (`docs/security/<scope>-evidence/`). Segredos e sessões fora do entregável.
- Fora de escopo salvo autorização: APIs/serviços de **terceiros**.

## 3. Sessões e portas

- Uma sessão por cliente. **Não** tocar em servidores/portas de outra sessão (ex.: 8081/8090/8091/8092;
  CDP 9695/9699/9700).
- CDP do cliente: porta dedicada (ex.: **9710**) e perfil `%TEMP%\opencode\chrome-cdp-<porta>`.
- Sessão de login: salvar em `apps/<app>/_auth/session.json` (**não apagar**); re-capturar via CDP se expirar.

## 3a. Memória (ADR-019 rev. 2, fonte neutra)

Ler no boot: o índice `.ai/memory/INDEX.md` (só a operacional, uma linha por entrada) e `.ai/memory/agent/MEMORY.md`
(preferências e correções do dono, uma por arquivo). O resto sob demanda: a memória operacional completa
(`.ai/memory/operational-memory.jsonl`, com gate), o ledger de incidentes (`.ai/memory/incident-ledger.jsonl`) e
o índice dele (`.ai/memory/LEDGER-INDEX.md`) ficam fora do boot. A memória nativa de cada ferramenta
não é fonte: a do Claude Code é um symlink para `.ai/memory/agent/`, criado sozinho pelo hook de início
de sessão (`.ai/guards/ensure-memory-link.sh`) e por `task ai:setup`.

## 4. Convenções

- **NUNCA cruzar sistemas de arquivos (regra do dono, 03/10).** Cada processo trabalha no sistema de arquivos onde o
  repo mora: o repo está no ext4 do WSL (`/home/pablo/projects/...`, `/workspace` no devcontainer). Ler, editar, criar,
  buscar, instalar ou rodar teste/watcher a partir do Windows em `\\wsl.localhost\...` (ou do WSL em `/mnt/c|d/...`)
  passa pelo 9P/DrvFs: lentidão extrema, IO alto, eventos de arquivo que não chegam, symlink quebrado. Faça tudo
  **dentro do devcontainer/WSL** (`docker exec ... segtools-dev`); o host Windows só para o que é dele (app desktop,
  navegador, link da memória). Agente em sandbox: idem — a sandbox fica do mesmo lado do repo. Lições:
  `docs/devcontainer-lessons.md` (rounds 13-15), `docs/WSL-MIGRATION.md` (tabela de tempos).

- **PROCEDIMENTO PRÉ-CRIAÇÃO (OBRIGATÓRIO, sempre):** antes de criar **qualquer** arquivo — 1) **classifique na
  matriz** `config/file_placement.toml` (família + `allowed`); 2) se **`nao-classificado`**, **adicione a família
  primeiro** (o gate bloqueia); 3) respeite as **fronteiras de conteúdo**: driver/query-builder (`pg`/`kysely`/`postgres`)
  **só** nas zonas G4: adaptadores de serviço core em `packages/platform/<serviço>` (IA, jobs, mensageria, IAM…),
  dados de módulo em `modules/*/db/`, e `apps/*/lib` só para o que é do próprio app — **nunca** criar adaptador core
  novo no hub (decisão do dono 29/09, SEG-661/ADR-017); portas/DTOs (`packages/core`, `modules`) **sem** driver; core **sem**
  dependências (G3). Rode `node tools/framework/layout-check.mjs` antes do commit. Regra durável: `mem-037`.
- **Local do arquivo (OBRIGATÓRIO):** ANTES de criar/salvar **qualquer** arquivo, decida o **local
  correto**: **global/compartilhado** (`tools/`, `packages/`, `config/`, `.ai/`, `central/`, `docs/`,
  `themes/`, `modules/`) × **app** (`apps/hub/`). **NUNCA** colocar tooling global sob `apps/hub/` (hub é o app).
  Na dúvida, **ingerir do benchmark** (R1) e ver onde os benchmarks colocam. **Gate:** `tools/framework/layout-check.mjs`
  (pre-commit) barra global sob `apps/hub/`, import de `apps/hub/` em temas/módulos, prefixo `Seg*`/`seg_` e
  descartável na raiz. Memória: `tools/framework/ai-memory.mjs --check`.
  **Dentro de `tools/` o destino é decidido por `docs/TOOLING-LAYOUT.md` (SEG-38):** `tools/framework/`
  (o esqueleto do Sofon — o que a plataforma precisa para existir), `tools/method/` (tooling nosso de
  método: extração/pentest/despacho, reusável entre clientes) ou `tools/clients/` (script de cliente).
  Nada de script solto na raiz de `tools/`.
- **Padrões de engenharia (filosofia de código):** fonte única em **`docs/STANDARDS.md`** (specification→conventions→enforcement por linguagem + princípios). Aqui só o ponteiro — não duplicar.
- **Serviços de núcleo (jobs/mensageria/hooks/IAM/lifecycle):** fonte única em **`docs/CORE-SERVICES.md`**. Aqui só o ponteiro — não duplicar.
- **Banco/SGBD/ETL:** fonte única em **`docs/DATABASE.md`** (skill `.ai/skills/segtools-database`). Aqui só o ponteiro — não duplicar.
- **Acesso a dados (porta tipada por domínio):** fonte única em **`docs/QUERY-LAYER.md`** (o SQL mora no adapter; a porta expõe método de domínio, nunca `query(sql)`). Aqui só o ponteiro — não duplicar.
- **Referências no código (rastreio por scan):** regra canônica em **`docs/AGENT-CONTRACT.md`** (§Referências). Aqui só o ponteiro — não duplicar.
- **Regras de negócio (`BR-*`):** convenção (marcador no código, `COMMENT ON` no banco, catálogo gerado e gate) em **`docs/STANDARDS.md` §12**; catálogo em **`docs/business-rules.md`** (gerado). Gerar/verificar: `task rules:catalog` · `task rules:check`. Aqui só o ponteiro — não duplicar.
- Path com acento quebra no PowerShell → use Node/aspas/paths absolutos.
- Relatório de segurança: `docs/security/<scope>-report.md` (formato `querovender-report.md`).
- **Sem dados de cliente nos bundles de skill** (hosts/chaves/tokens/PII) — no máximo o nome como proveniência.
- Confirmar antes de mudanças grandes; não mascarar sintomas; tratar a causa.

## 5. Renomeacao em massa (guard)
- Substituicao GLOBAL de texto (ex.: `fb`->`seg`) **NUNCA** pode passar por arquivos de lock/hash/base64:
  `package-lock.json`, `*.lock`, `*.sops`, `.copier-answers.yml`, nem por valores `"integrity"`/`"hash"`.
  Foi o que corrompeu 32 hashes do lockfile no commit `7e09c38` (npm ci -> EINTEGRITY).
- Depois de QUALQUER renomeacao que toque `package.json`/imports, PROVAR com `bun install --frozen-lockfile` (task verify:lock).
- Gate: `task verify:lock` (roda `bun install --frozen-lockfile` no devcontainer).
- **Padrão exato, nunca a palavra solta.** Trocar só o token do alvo (ex.: `"@segtools/` em import/`paths`/`package.json`),
  nunca `segtools` em qualquer lugar. Em 29/09 (`ebf85db3`) a troca solta virou `e2e@segtools.local` em `@sofon.local`
  (quebra o login do e2e) e editou comentário de migration aplicada.
- **Exclusões obrigatórias**, além dos locks: migrations já aplicadas (imutáveis), identidades de dado (e-mails, handles,
  chaves do banco), `HANDOFF*`/histórico, e arquivos modificados por outra frente (`git status` com `M`/`MM`).
- **Simulação antes:** listar cada token trocado com contagem; qualquer token fora do padrão esperado = para.
- **Árvore limpa** (ou worktree própria) antes de aplicar; commit com pathspec explícito.
- **Prova depois:** `task verify:lock` + typecheck + `task check` completo (int e e2e de login), não só o lock.
- Ferramenta: `tools/framework/rename.py` (simulação obrigatória + exclusões embutidas) — usar quando existir.
