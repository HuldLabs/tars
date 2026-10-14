# Curadoria do ecossistema → Tars · fase 1 COLETA (recorte: segtools + sessões)

Só leitura. Coleta em 2026-10-11T17:03Z. Baseline do Tars: última curadoria 08/10 23:34; aqui só o que
entrou **depois**. Fontes lidas (caminho + HEAD citados):

| Fonte | HEAD | Papel |
|---|---|---|
| `/projects/tars` | `7b4dce79` (11/10 13:53) | destino; baseline de cobertura |
| `/workspace` (segtools) | branch `chore/ecossistema-huldlabs` | recorte principal |
| `/workspace/.cache/hi` (homelab) | `6c79988b` (11/10 13:16) | recorte homelab |
| `/projects/huldlabs` | `50638daf` (11/10 11:04) | recorte huldlabs (repo central) |
| `/projects/kipp` | `a091e609` (11/10 13:53) | recorte kipp |

Legenda de tipo: **lição** · **decisão** · **regra** · **contexto** · **armadilha**.
Classificação: **G→Tars** (genérico) · **E→huldlabs** (transversal da org) · **P** (fica no projeto).
Cobertura no Tars: **COBERTO** (citei arquivo:linha) · **PARCIAL** · **FALTANDO**.

---

## 0. Estado do Tars pós-08/10 (baseline do delta)

Commits do Tars depois de 08/10 (todos já na `main` dele, `7b4dce79`): doutrina de segredos
(`.ai/governance/segredos-e-identidade.md`, 15 itens, com gate), `licoes-plataforma.md`, 4 memórias perennial
(CRLF, ssh-format, wsl.exe, worktree-windows), `doctrines.toml` (25 doutrinas), `tars secrets`, sync por
catalogo na dev.11. O **delta** abaixo é o que ainda NÃO está lá.

---

## 1. ACESSOS DA DANEL: registro completo (obrigatório — hoje ausente do Tars)

**Fato central:** o Tars tem a *doutrina* de identidade (quem pode), mas **não tem o inventário de acessos**
(quais hosts/chaves/tokens/orgs a automação enxerga). O inventário existe como **plano + script**, não como
documento no catálogo. Tipo: **decisão/contexto** — **G→Tars** (qualquer projeto que a automação atende) ·
**FALTANDO**.

### 1.1 O que existe hoje (fontes)

| Peça | Onde | O que é |
|---|---|---|
| Arquitetura da Daneel (pesquisa senior) | `/workspace/.cache/daneel-arquitetura.md` (10/10) | spec completa: identidade, contrato, NHI, inventário, memória |
| Script gerador (Fase 3, **no Tars**) | `/projects/tars/.worktrees/hook/tools/framework/tars-acessos.mjs` | gera o inventário; read-only; recusa gravar se casar padrão de segredo |
| Teste do gerador | `.worktrees/hook/tools/framework/tars-acessos.test.mjs` | roda sem rede (gh/op/ssh/run injetados) |
| Skill da Daneel | `.worktrees/hook/.ai/skills/daneel/SKILL.md` | existe na worktree `hook`, **não** na `main` do Tars |
| Worker prompt | `/workspace/.cache/prompts/w-daneel.md` | tarefa Fase 1-3 (skill + inventário) — “aguarda ok final para despachar” |

### 1.2 Registro de acessos (o conteúdo que falta no Tars)

Do `tars-acessos.mjs` (constantes + coletores) e do `daneel-arquitetura.md` §4/§6:

- **GitHub:** conta `daneel-bot` (PAT classic `op://secrets/daneel-bot/pat-classic-daneel-bot-automation`;
  recomendação 2026 = App `daneel-bot[bot]` com token `ghs_` de 1h). Orgs: **`HuldLabs`, `growthsbr`,
  `FabberLabs`** (`ORGS_PADRAO` em `tars-acessos.mjs`). Inventário = orgs/repos com nível
  pull/push/admin, privado/público, convites pendentes.
- **SSH dos hosts:** `nuc.czul.net` (`HOSTS_PADRAO`); user `daneel`, **sudo NOPASSWD**
  (`/etc/sudoers.d/daneel`, fonte `hi/hosts/nuc.py`). Acesso via `daneel-ssh.sh` (chave lida do 1P para
  `/dev/shm`, `trap rm`, `IdentitiesOnly=yes`). Comando indireto: **`nuc.sh`** (`bash .cache/nuc.sh 10.0.0.220`).
- **1Password:** cofre `secrets`, item `daneel-bot`. SA token em `~/.config/tars/automation/op-sa.token`
  (leitura); RW só sob ordem. Cofres/itens entram no inventário **por nome**, nunca valor.
- **Ferramentas inventariadas:** `op`, `gh`, `git`, `docker`, `uv` (versão).
- **Garantias do gerador:** (1) read-only (GET/list/read); (2) nunca imprime valor de segredo — GitHub pela
  API, 1P por NOME, saída passa por `assertSemSegredo` (reusa `secrets-patterns.mjs`, R3); (3) falta
  credencial vira seção `(indisponivel: <motivo>)`, nunca inventário mentiroso.
- **Destino do inventário gerado:** repo privado `HuldLabs/huldlabs` → `acessos/daneel.md` (a skill
  **aponta** para ele; nunca lista acesso à mão).
- **Drift:** `diff` de duas gerações = detecção de drift (padrão nhi-scan/Steampipe, citado no doc).

### 1.3 O que precisa subir ao Tars

- **G→Tars FALTANDO:** a `SKILL.md` da Daneel (`main` do Tars não a tem — só `.worktrees/hook/`); o
  `tars-acessos.mjs` idem. Promover da worktree `hook` para o catálogo.
- **G→Tars FALTANDO:** o **documento** `acessos/daneel.md` (inventário gerado) — hoje inexistente em
  qualquer repo versionado.
- **Cobertura parcial:** a doutrina `segredos-e-identidade.md` já cobre itens 7/8/9/11/14 (transporte por
  ator, commit do bot, push na hora, nunca imprimir segredo, SA de escrita). O que **não** tem lar é o
  **inventário como snapshot** e a **lista de orgs/hosts** como dado.

---

## 2. DECISÕES TRANSVERSAIS DA ORG (E→huldlabs)

Repo central `/projects/huldlabs` (privado) = SSOT do ecossistema. Conteúdo novo (aa8a989, 69e7e29, 50638da):

| # | Item | Tipo | Fonte | Destino |
|---|---|---|---|---|
| 2.1 | **As cinco peças**: Tars (método), Tomo (DS), Sofon (Next), Pion (Python), Kipp (trabalho). Futuras: Lazarus (busca), Bulq (segredos), **Murph** (backup), **Endurance** (devcontainer único), **Morse** (mensageria), **Brand**, **Phonon** (PHP) | contexto | `huldlabs/README.md` | **E→huldlabs** (COBERTO lá) |
| 2.2 | **Catálogo, não pacote fechado** — projeto declara o que importa; sync puxa só o declarado, com versão+hash em lock | decisão | `huldlabs/README.md` | **G→Tars** — COBERTO (`.ai/tars.toml`+lock, `tars sync`) |
| 2.3 | **Nada exige um runtime de quem não o usa** — repo só-Python e só-Node são caso de primeira classe | decisão | `huldlabs/README.md` | **G→Tars** — COBERTO (`tars` já é binário único; `ecossistema-agnostico-de-runtime`) |
| 2.4 | **Ferramenta transversal sai como binário único** (`tars`, `kipp`, `tars-secrets`) | decisão | `huldlabs/README.md` | **G→Tars** PARCIAL (tars é; kipp/secrets "virão") |
| 2.5 | **Distribuição no GitHub Packages privado, escopo `@huldlabs`**; versão `0.0.1-dev.N` | regra | `huldlabs/README.md` | **G→Tars** FALTANDO (o lock existe; o padrão de escopo/versão não está escrito no Tars) |

### 2.6 ADR-0001 — Mensageria e jobs (`huldlabs/adr/0001`, proposto 10/10)

Decisões de produto/arquitetura **transversais** (E→huldlabs), com lições genéricas embutidas (G→Tars):

- **D1** três donos: `communication` / `notifications` / `jobs`; outbox é transporte, não quarto dono.
- **D2** corte interno×externo está no destinatário: in-app no núcleo do app; externo num app próprio (**Morse**).
- **D3** um contrato só (`CommunicationRequest`); surface desconhecida **levanta**, canal indisponível
  **degrada** (nunca silencia).
- **D4** intenção sai pelo outbox **na mesma transação** do efeito (`emit(tx,…)`); drain fora da transação.
- **D5** jobs: **o motor do segtools vira o padrão do ecossistema** — fila no Postgres, 7 verbos, `FOR UPDATE
  SKIP LOCKED`+lease, `retryDecision` fonte única, DLQ, agenda como dado, `reconcile`. +3 chaves de
  idempotência (dedupe/concurrency/idempotency), lease por CHECK, terminal⇔`finished_at`, run criado antes de
  enfileirar.
- **D7** ordem dos providers: ntfy → e-mail → (Telegram/WhatsApp/Slack).
- **Armadilhas que não podem voltar** (§Consequências): GET com efeito colateral, sucesso falso sem entrega,
  credencial no adapter, `attempt` fixo em 1, campo de contrato copiado e nunca lido, canal default fora do catálogo.
- **Pesquisa-fonte:** `segtools/.cache/msg-pesquisa/*` (11 relatórios). Spike Novu **descartado** (Mongo exige
  AVX, ausente no Celeron J4005). **Apprise adotado** como camada de entrega.
- Classificação: **E→huldlabs** (decisão transversal) + lições genéricas **G→Tars PARCIAL** — COBERTO em
  parte: `docs/CORE-SERVICES.md` (fonte única de jobs/mensageria no segtools), ADR-017 (IA como serviço core).
  FALTANDO no Tars: a doutrina "outbox na mesma transação" e "canal indisponível degrada, não silencia".

### 2.7 ADR-0002 — Binário portátil, standalone ou plugado (aceito 10/10)

A régua de arquitetura de toda peça que sai de um app (**E→huldlabs**, e o padrão é **G→Tars**):

- **D1** o produto é o binário (HTTP+CLI+MCP+tela); fonte única da regra = código do binário.
- **D2** dois modos, mesmo binário (standalone × plugado).
- **D3** o binário publica o próprio **manifesto como dado** (`GET /manifest`, `manifest --json`).
- **D4** **um adaptador genérico por framework**, não um módulo por produto (Sofon/Pion/Phonon).
- **D5** fronteira transacional fica no hospedeiro (outbox/jobs = especificação + impl. nativa + teste de conformidade).
- **D7** dados: **o SGBD é do ambiente**; binário recebe DSN, é dono das próprias tabelas, aplica migrations.
  `table_prefix` opcional (padrão = nome do produto). Hospedeiro nunca lê o schema do binário (garantido por role).
- **D8** Tars é do **repo**, não do binário; **vendorizar o binário é proibido** (submodule/cópia); schema do
  manifesto + teste de conformidade **moram no catálogo do Tars**.
- **Regras de operação:** assíncrono entre peças (outbox/evento; síncrono só p/ consulta); contrato testado nos
  dois modos; versão em tudo (adaptador falha alto); identidade (token por app chamador); operação pelo motor.
- Classificação: **E→huldlabs** + **G→Tars FALTANDO** — este ADR **já devia morar no catálogo do Tars** (ele
  próprio diz D8.3); hoje só existe em `huldlabs/adr/0002`.

### 2.8 Backlog do ecossistema (`huldlabs/BACKLOG.md`)

- **Segurança:** token de bot do Slack commitado — `homelab-devops/.../slack-provider.yaml:16`
  (`/srv/repos/homelab-devops.git` no NUC) → revogar (dono), tirar do arquivo, limpar histórico se público.
  **Fonte:** `segtools/.cache/msg-pesquisa/g5-infra.md`. **P** (ação pontual) + **G→Tars** já COBERTO
  (`block-secret-dump` + gitleaks).
- **Consolidação:** o `seo-expert` completo só existe no disco do crash (`/mnt/e/BKP/...`, `/mnt/e/recuperado/...`);
  `/srv/repos/seo-expert-bkp.git` tem só o vault. Consolidar em `/srv/repos/seo-expert.git`. **P**.
- **Fundação dos binários (ADR-0002):** schema do manifesto versionado no Tars; adaptador "módulo externo" do
  Sofon; teste de conformidade no Tars. **E→huldlabs** + **G→Tars FALTANDO**.
- **Ideias a portar do iageny** (item 2.9).

### 2.9 Estudo iageny/ai-workstation (`huldlabs/estudos/2026-10-10-iageny-ideias.md`)

Esboço externo; ideias a portar **como gates do Tars** (G→Tars FALTANDO / PARCIAL):

1. **Ficha de agente verificável** (ações permitidas/proibidas, stop conditions, approval triggers,
   `done_when`+checks) → **G→Tars** — hoje **FALTANDO** (busca `human_approval|stop_condition` = zero no Tars).
   Vira a **skill da Daneel** (§1).
2. **Ledger retomável de trabalho de IA** (doing/done/log) + gate que falha com item aberto → **G→Tars**
   PARCIAL (`BACKLOG`/`HANDOFF`/`DELIVERED` texto humano; sem máquina). Destino: Kipp + Tars.
3. **Correlação worklog × roadmap** (registro + gate) → **G→Tars** FALTANDO.
4. **Gate de paridade CI × Taskfile** (CI só roda o que existe como `task`) → **G→Tars** FALTANDO.
5. **Contrato único de tempo/locale** para todos os projetos → **G→Tars** FALTANDO.
6. **MCP do ecossistema** no modelo Atlassian v2 (`estudos/2026-10-10-mcp-ecossistema-atlassian-v2.md`) → **E→huldlabs**.

### 2.10 Mercado (`huldlabs/estudos/…`, `segtools/.cache/mercado-homelab-2026.md`)

Filtro nº1: **toda ferramenta que só se configura por GUI, ou exige DB de estado fora do Git, quebra o
princípio** (cada app declara tudo nas labels do próprio compose). Coolify/Portainer/Zoraxy/NPM descartados por
isso. `Komodo` (GPL-3, v2.2) adotado como reconciliador. **E→huldlabs** (COBERTO no huldlabs).

---

## 3. DECISÕES DO HOMELAB (recorte homelab → parte E, parte G)

Repo `hi` (`/workspace/.cache/hi`, = `pabloaugusto/homelab`, oficial). `docs/decisoes.md` é a SSOT.

### 3.1 Layout por ambiente — CONTRADIÇÃO RESOLVIDA (marco)

- **Decisão 11/10:** `/srv/<ambiente>/<app>/` (`/srv/prod/<app>`, `/srv/dev/<app>`) — **substitui** o antigo
  `/srv/apps/<app>`. Fonte: `hi/docs/decisoes.md:§Layout por ambiente` + pesquisa
  `segtools/.cache/pesquisa-ambientes.md`.
- **CONTRADIÇÃO a marcar:** `segtools/.cache/hermes-migracao.md:§Formato final` ainda diz
  **`/srv/apps/<app>/{compose.yaml,envfile,conf,data}`** — escrita **antes** de 11/10. A memória
  `estado-exige-datadir.md` do Tars e o README do hermes falam `/srv/data/<app>` (versão ainda mais antiga).
  → **há 3 grafias** circulando: `/srv/data/<app>` (antiga) × `/srv/apps/<app>` (hermes-migracao) ×
  `/srv/<amb>/<app>` (atual, 11/10). **A que vale é `/srv/<amb>/<app>`;** as outras são dívida de doc.
  Fonte canônica: `hi/docs/decisoes.md` (revisado 11/10).
- Outros diretórios: `/opt/<app>` (código por ref de release, NUNCA `master` móvel); `/srv/repos` (só espelho
  git, nunca executa); `/srv/state` (arquivo frio de coleta). **G→Tars** (convenção de homelab, mas
  replicável) — **FALTANDO** no Tars como doutrina.

### 3.2 Ambientes prod/dev/stg na mesma máquina

- Ambiente = **projeto Compose distinto** (`name: <app>-<ambiente>`, versionado). **`profile` NÃO serve** (serviço
  sem profile sobe sempre; `down` não derruba a stack toda).
- **O que o nome isola:** containers, rede default, volumes nomeados. **O que NÃO:** `container_name:` fixo
  (proibido), **porta do host** (distinta por ambiente), rede/volume `external`.
- **Bind mount SEMPRE** (nunca volume nomeado — some com `down -v`/`prune` e cria a órfã).
- **Dado de dev nunca é o de prod** (vazio ou retrato por dump/restore).
- **Limite de recurso por serviço** (`mem_limit`/`cpus`; não `deploy.resources.limits` — arrasta Swarm).
- **Segredos por ambiente** (nunca compartilhados; thood carrega chaves reais de IA).
- **prod imutável** (digest; bump só por ordem do dono); **dev evolui**; teste real = apontar cliente p/ dev.
- Classificação: **E→huldlabs** (operação) + **G→Tars PARCIAL** — COBERTO em `docs/DATABASE.md`? não; a
  doutrina Docker/compose NÃO está no Tars. **FALTANDO**.

### 3.3 Produção 100% Docker; banco por produto; host descartável

- Host de prod só tem **docker + compose plugin** (nada de systemd/unit de app/`/usr/local`). Recriar a máquina
  = instalar docker e restaurar `/srv`.
- **Uma stack e um banco por produto**, conversando pela rede `homelab` (external) por alias; nunca publica porta
  p/ o host; banco não compartilhado entre produtos.
- **Banco por app (11/10):** cada app tem a **sua instância** de banco (Postgres ~40 MB, Mongo ~84 MB medido).
- **G→Tars PARCIAL** (princípio "host descartável" é genérico; COBERTO conceitualmente em R2/prod-sempre-docker,
  sem doutrina escrita). **FALTANDO** como regra do catálogo.

### 3.4 Segredos e identidade no homelab (lições de incidente)

- **Incidente 09/10 — commits da automação assinados com a chave do dono** (`105f20a..ec8a381`, autor `daneel-bot`,
  chave SSH `pablo-dotfiles`). Causa: `commit.gpgsign=true` + `gpg.ssh.program=op-ssh-sign` global do WSL.
  **Correção:** `commit.gpgsign=false`+`tag.gpgsign=false` no `.git/config` do repo, antes do 1º commit de cada
  repo onde a automação commita. **Prova:** `git log -1 --format=%G?` = `N`. Fonte: `hi/docs/decisoes.md`
  §Incidente. → **G→Tars COBERTO** (`segredos-e-identidade.md` item 8: commit é do bot, chave própria).
- **ntfy fase 1:** ntfy.sh **público com tópico secreto** (tópico = senha; só no cofre + `/etc/homelab/ntfy.toml`
  600). POST **in-process** (urllib), nunca `curl <url>` (argv limpo). Erros logam só o TIPO da exceção.
  **Falha de rede não propaga** (sai 0); `--teste` é a exceção. Ligação genérica: `homelab-falha@.service` +
  `OnFailure=`. → **G→Tars PARCIAL** — COBERTO item 11 (nunca imprimir/argv de segredo); **FALTANDO** a
  regra "alerta que falha não derruba o job; canal de alerta não é o próprio host" (heartbeat externo).
- **restic + rclone:** senha por `RESTIC_PASSWORD_FILE` (nunca argv/env de valor); **prova de restore** (sentinela
  SHA-256) semanal, não só existência; `check --read-data-subset=5%`. Repos git NÃO entram. → **G→Tars FALTANDO**
  (doutrina de backup: "um backup que não restaura não é backup").

### 3.5 Motor de deploy: Komodo (GitOps, sem K8s)

- **Decisão 8 (10/10):** reconciliador = **Komodo** (Core no NUC + Periphery por host, ARM64); git = fonte da
  verdade; aplica só o que mudou; alerta no ntfy. pyinfra fica com a base do host + bootstrap. Sem K8s (peso).
- **Dockhand retirado (11/10)** — substituído pelo Komodo; princípio mantido: **a fonte é o IaC, edição na tela
  é sobrescrita**.
- **Komodo = FerretDB v2** (Mongo 4.4 EOL, sem AVX p/ 5.0+). Migração por `km database copy`, opt-in, Mongo antigo
  intacto, rollback = trocar `KOMODO_DATABASE_ADDRESS`. → **P/E**.
- **Receita = procedimento documentado do fabricante** (dono, 11/10): doc/CLI/API/compose oficiais da versão
  pinada, fonte citada; receita nova provada por reprodução local ou validador oficial. → **G→Tars** (princípio
  "documented-first") — **FALTANDO** como doutrina explícita (rumo a `ler-docs-oficiais-sempre`, que é memória do
  segtools, não do Tars).

### 3.6 Lições de apply (dono, 10/10) — viram arquivo, não memória

- Regra: **falha no apply vira lição em arquivo** — `docs/estudos/licoes-apply-<data>.md`, formato
  **sintoma → causa raiz → classe → prevenção → onde a prevenção mora**; a prevenção **entra no código** (teste)
  ou no POP. Fonte: `hi/docs/decisoes.md` §9.
- 3 regras duráveis: (1) o que não tem teste vira checklist; (2) **erro de leitura nunca vira "ausente"**
  (checagem privilegiada que falha por permissão **aborta** o apply — foi o que anexou 7 cópias da chave do
  Authelia); (3) **o coordenador lê o log do apply e manda a causa `arquivo:linha` no despacho** (worker que
  investiga morre no teto de turnos).
- → **G→Tars PARCIAL** — COBERTO: `incidente-vira-prevencao.md` (incidente vira prevenção antes de seguir) e
  `fail/erro-nao-se-engole` (doctrine 61). **FALTANDO:** a regra (2) "erro de leitura ≠ ausente" como doutrina
  de gate; e a (3) "coordenador manda a causa no despacho".

---

## 4. RECORTE SEGTOOLS (lições/decisões pós-08/10)

### 4.1 Infra/dev (do git log + trailers)

| # | Item | Tipo | Fonte | Classificação |
|---|---|---|---|---|
| 4.1.1 | `devcontainer up` travava **para sempre** com Docker v29+ (CLI 0.80.1); CLI passou a exigir **>=0.80.2** | lição | trailer `Incident:` (commit `251335a0`… R16); `.cache/tars-promocao-devrca.md` | **G→Tars FALTANDO** — proposta pronta: *recriar o dev é task versionada com CLI fixada + timeout que falha alto*. `docs/devcontainer-lessons.md` R16 |
| 4.1.2 | commits do `tars#4` e `kipp#1` saíram como **`deepseek-worker`** (achado pelo coord KIPP 11/10) | lição | trailer `Incident:` | **G→Tars COBERTO** (`segredos-e-identidade.md` item 8; e `tools/method/worker/*` exporta `GIT_AUTHOR_*`) |
| 4.1.3 | **limite que o dono não pediu não nasce como padrão** (`--max-turns` só cortava rodadas no meio; 10/10 ~12 cortes) | lição | trailer `Lesson:` | **G→Tars PARCIAL** — memória `limite-300k-so-avisa`; **FALTANDO** como doutrina |
| 4.1.4 | o **`--sem-canal` pulava `escrever_settings`**: sem teto de turnos/custo e sem guards destrutivo/escopo; regra só no texto do prompt **não** segura worker — o hook existia mas a env nunca era passada | lição/armadilha | trailer `Lesson:` (`7c3ff610`, `f23fa452`, `e5e38b24`) | **G→Tars COBERTO** (`incidente-vira-prevencao.md`: guard > doctor > env > gate > skill) |
| 4.1.5 | `indice do boot zerado pelos arquivos do proprio boot` (3f5245fa e 08/10); `530455d8` regerou INDEX sobre 484 fatos e gravou `(vazio)` calado por cima de 314 linhas | armadilha | trailer `Incident:` | **G→Tars PARCIAL** — `fail/erro-nao-se-engole` cobre o "falhar alto"; **FALTANDO** a regra "gerador de índice não sobrescreve com vazio silencioso" |
| 4.1.6 | **gate de camadas enfraquecido para contornar worktree sem `node_modules`** | armadilha | trailer `Incident:` | **G→Tars COBERTO** (`ai-layer-check.mjs`; solução: `bun install --backend=copyfile`) |
| 4.1.7 | queda de luz 07/10 — **watchdog contava rodada morta como viva** (vivos=3/4 falso) | lição | trailer `Incident:` | **P** (infra de worker do segtools) |
| 4.1.8 | a recuperação do disco de 08/10 **apagou `.cache/`** (descartável por desenho) | lição | trailer `Incident:` | **G→Tars COBERTO** (`segtools/cache-descartavel`, doctrine 239) |

### 4.2 Worker/modelo (memória agent/*.md + runs)

Fontes: `/workspace/.ai/memory/agent/*.md` (~105 arquivos), `var/worker-runs/*/resumo.txt` (~492 runs),
`.cache/prompts/`. Itens genéricos candidatos ao Tars:

- `busca-local-pendentes.md` / `buscar-dentro-do-container.md` / `nao-cruzar-filesystems.md` — **G→Tars
  PARCIAL** (COBERTO em menor grau por `licoes-plataforma.md` item 4; o "buscar só dentro do container, `git
  grep`, nunca `\\wsl.localhost`" é regra de método).
- `coordenador-so-despacha.md` / `skill-so-coordenador.md` / `uma-subtask-por-worker.md` /
  `worktree-por-worker-sempre.md` — **G→Tars FALTANDO** (método de despacho; hoje só memória do segtools +
  skill `agent-coordination` no Tars).
- `falha-vira-prevencao-propagada.md`, `scripts-sem-falha-silenciosa.md`, `scripts-sem-falha-silenciosa`,
  `conferir-dependencias-antes-de-liberar-recurso.md` — **G→Tars PARCIAL**.
- `convencao-idioma.md`, `responder-em-portugues.md` — **G→Tars COBERTO** (`segtools/idioma`, doctrine 136 e
  STANDARDS §3 citado no boot).
- `task-e-superficie.md`, `taskstop-nao-mata-o-container.md`, `comandos-longos-em-segundo-plano.md` — **G→Tars
  FALTANDO** (regra "o comando de subida é `task`, e `TaskStop` não mata o container").
- `mcp-projects-fica-velho.md`, `segtools-projects-como-canal-de-coordenacao.md` — **P** (módulo projects).
- `prod-sempre-em-docker.md`, `infra-nuc-producao.md`, `so-homolog-e-do-dono.md`, `app-de-prod-so-com-autorizacao.md`
  — **G→Tars PARCIAL** (cruza com §3.3 do homelab; "nada em prod sem ordem direta do dono" é doutrina nossa).

**Armadilhas de worker (§11 do `kipp/docs/contexto.md`, coordenador 11/10) — G→Tars FALTANDO:**
- Worker relata o que **não** fez e marca verde teste que só confere **string** → exigir teste comportamental e
  conferir no sistema rodando.
- Verificação do `fast.py` marca **PHANTOM** quando o worker usa `python3` sem pytest → reprovar com `uv`.
- Prompt de leitura precisa dizer **"PROIBIDO escrever"** com exemplos (chave, banco, restart).
- `.ai/base/` não é versionado: worktree nova precisa de **`tars sync` antes do 1º commit**.
- Worktree sem `node_modules` não passa no gate de camadas.
- Saldo da DeepSeek pode acabar no meio da rodada (**402**): worker morre sem commit.

### 4.3 Sessões (relatórios `.cache/*.md`) — achados de auditoria/reconciliação

- **`nexus-reconciliacao.md` (11/10):** 8 cópias do nexus em lugares diferentes; a **mais nova** é
  `recuperado/hermes-1010/wip` (`1544ad1`), não o `main` (`3edb5e9` de 01/10). **Lição:** "o mesmo repo tem
  cópias em versões diferentes; compare pela data e use a mais nova" — **G→Tars COBERTO** (é a regra R1/BENCHMARKS
  do boot). Achado: nexus **promete `pg_duckdb` que não existe no desenho** (`compose:41-50` + `vars.py:76`).
- **`auditoria/` (waudit5):** hermes_agent **reinventa a imagem oficial** (`npx hermes` + flags inventadas) em
  vez de `nousresearch/hermes-agent`; ntfy duplica a guarda de placeholder do pihole. **G→Tars PARCIAL** —
  "documented-first" (§3.5) e R1 (não reinventar).
- **`msg-pesquisa/` (g4-seobrain):** o **seo-brain não tem mensageria** (só `ops.operation_events` + motor DBOS
  atrás de porta); zero canal externo. `idempotency_key` sem índice único (lacuna). Melhor peça: **lease
  obrigatório por CHECK** + terminal⇔`finished_at`. → insumo direto do **ADR-0001 D5**.
- **`panorama/A-canal.md` (panoA, 09/10):** 5 mais graves do canal — SEG-92 (segredos sem rotação, 12 dias),
  SEG-876 (10 units vermelhos), SEG-348 (9 e2e vermelhos), SEG-565 + duplicatas, **~19 itens Kipp congelados
  mostrados como ativos**. **P** (canal segtools) + lição genérica "board não pode mostrar item congelado como
  ativo" (**G→Tars PARCIAL**).

---

## 5. RECORTE KIPP (extração do projects) — decisões que valem ao ecossistema

Repo `/projects/kipp` (`a091e609`). `docs/contexto.md` + `BACKLOG.md` (decisões do dono 11/10):

| # | Item | Classificação |
|---|---|---|
| 5.1 | **Pacote único `@huldlabs/kipp`** (HTTP+CLI+MCP+manifesto) | E→huldlabs (COBERTO em huldlabs/ADR-0002) |
| 5.2 | Kipp fica em **DEV** até aprovação; **nada do ecossistema aponta p/ ele antes**; board do segtools segue vivo | E |
| 5.3 | **Escopo por projeto no IAM** (obrigatório antes de 2º consumidor) | E |
| 5.4 | Migração de dados por **dump/restore com keys intactas** (nunca recriar por `create_issue`) | E |
| 5.5 | DEV local (Ryzen/WSL, compose `kipp-dev`); **NUC é só produção** (`/srv/prod/kipp`), **só com ordem do dono** | E/P |
| 5.6 | **NUC não tem AVX**; smoke test no NUC antes do 1º deploy de prod | E/P (cruza com Novu/Komodo/FerretDB) |
| 5.7 | Linguagem: **TypeScript, `bun build --compile`** (x64+arm64) | P |
| 5.8 | **Fundação antes do binário:** schema do manifesto v1 + teste de conformidade no **catálogo do Tars** (fatia K0) | **G→Tars FALTANDO** |
| 5.9 | **Jira é o guia de produto** (key `^[A-Z][A-Z0-9]+$` ≤10; só admin cria/edita/arquiva) | P (régua de produto) |
| 5.10 | **Pesquisa Atlassian MCP v2** (`huldlabs/estudos/2026-10-10-mcp-ecossistema-atlassian-v2.md`) | E |

**Armadilha registrada (Kipp BACKLOG):** `dbf679f` re-sync Tars dev.10; `31ee5f7` — **"o sync quebra o
`prepare-commit-msg`"**. → **G→Tars FALTANDO** (bug do hook de sync no consumidor) — ver também o commit
`93d3059` do Tars ("hook do catalogo acha o motor fora do consumidor").

---

## 6. COBERTURA NO TARS — matriz-resumo do delta

| # | Aprendizado | Tipo | Classificação | Cobertura no Tars | Onde / gap |
|---|---|---|---|---|---|
| A | inventário de acessos da Daneel (hosts/orgs/chaves/PAT) | decisão | **G→Tars** | **FALTANDO** | só em `.worktrees/hook/tools/framework/tars-acessos.mjs` + `SKILL.md` (não na `main`) |
| B | orgs servidas (HuldLabs/growthsbr/FabberLabs) + host nuc.czul.net | contexto | **G→Tars** | **FALTANDO** | `tars-acessos.mjs:ORGS_PADRAO` |
| C | skill da Daneel (identidade/contrato/stop conditions) | decisão | **G→Tars** | **FALTANDO** (na main) | `.worktrees/hook/.ai/skills/daneel/SKILL.md` |
| D | ficha de agente verificável (allowed/prohibited/stop/approval/done_when) | regra | **G→Tars** | **FALTANDO** | iageny §2.9-1; nada com `stop_condition` no Tars |
| E | ADR-0002 (binário portátil, manifesto, SGBD do ambiente, D8 Tars no catálogo) | decisão | **G→Tars** | **FALTANDO** | mora só em `huldlabs/adr/0002` (ele próprio manda vir pro Tars) |
| F | outbox na mesma transação; canal indisponível degrada | regra | **G→Tars** | **FALTANDO** | `huldlabs/adr/0001` D3/D4; `docs/CORE-SERVICES.md` cobre o motor |
| G | jobs: lease por CHECK, terminal⇔finished_at, 3 idempotências, run antes de enfileirar | regra | **G→Tars** | **FALTANDO** | `huldlabs/adr/0001` D5 |
| H | layout `/srv/<amb>/<app>` (+`/opt`, `/srv/repos`, `/srv/state`) | regra | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` (11/10) |
| I | ambiente = projeto Compose (`name:`), não `profile`; bind mount sempre | regra | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` + `pesquisa-ambientes.md` |
| J | prod 100% Docker; uma stack+banco por produto; host descartável | decisão | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` |
| K | receita = procedimento documentado do fabricante | regra | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` |
| L | dev:recreate = task + CLI pinada + timeout que falha alto | lição | **G→Tars** | **FALTANDO** | `.cache/tars-promocao-devrca.md` (proposta pronta) |
| M | backup: dump cifrado, prova de RESTORE (sentinela SHA-256), nunca dado vivo | regra | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` §restic; `segredos-e-identidade` item 10 (PARCIAL) |
| N | alerta que falha não derruba o job; canal ≠ próprio host (heartbeat externo) | lição | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` §ntfy |
| O | erro de leitura ≠ "ausente"; checagem privilegiada que falha ABORTA | armadilha | **G→Tars** | **PARCIAL** | `fail/erro-nao-se-engole` cobre o "não engolir"; falta a regra de leitura |
| P | incidente vira prevenção ANTES de seguir; falha de apply vira arquivo | regra | **G→Tars** | **COBERTO** | `.ai/governance/incidente-vira-prevencao.md` (Tars) |
| Q | commit de IA é do bot, chave própria; prova `%G?`=`N` | regra | **G→Tars** | **COBERTO** | `.ai/governance/segredos-e-identidade.md` item 8 |
| R | nunca imprimir/hashear/argv de segredo | regra | **G→Tars** | **COBERTO** | `segredos-e-identidade.md` itens 11/13 |
| S | CRLF em chave SSH → `error in libcrypto` | lição | **G→Tars** | **COBERTO** | `.ai/governance/licoes-plataforma.md` item 1 |
| T | `wsl.exe` expande `$VAR` | lição | **G→Tars** | **COBERTO** | `licoes-plataforma.md` item 3 |
| U | worktree Windows vista do WSL | lição | **G→Tars** | **COBERTO** | `licoes-plataforma.md` item 4 |
| V | `.cache` é descartável | regra | **G→Tars** | **COBERTO** | `doctrines.toml` `segtools/cache-descartavel` |
| W | coordenador manda a causa `arquivo:linha` no despacho | regra | **G→Tars** | **FALTANDO** | `hi/docs/decisoes.md` §9-3 + memória `revisar-contexto…` |
| X | `--sem-canal` deve carregar settings/guards (regra no texto ≠ segura) | lição | **G→Tars** | **COBERTO** | `incidente-vira-prevencao.md` |
| Y | gate de paridade CI × Taskfile; contrato único de time/locale | ideia | **G→Tars** | **FALTANDO** | `huldlabs/BACKLOG.md` §iageny 4/5 |
| Z | ledger retomável de trabalho de IA com gate de item aberto | ideia | **G→Tars** | **PARCIAL** | BACKLOG/HANDOFF/DELIVERED (texto, sem máquina) |
| AA | sync do Tars quebra o `prepare-commit-msg` do consumidor | armadilha | **G→Tars** | **FALTANDO** | `kipp/BACKLOG.md` (`31ee5f7`); Tars já mexeu no hook (`93d3059`) — confirmar |

---

## 7. CONTRADIÇÕES ENTRE REPOS (marcar)

1. **Layout de app — 3 grafias:** `/srv/data/<app>` (Tars `estado-exige-datadir.md`, antiga) ×
   `/srv/apps/<app>` (`segtools/.cache/hermes-migracao.md`, pré-11/10) × **`/srv/<amb>/<app>`** (atual,
   `hi/docs/decisoes.md`). **Vale a de 11/10.** Os docs antigos são dívida.
2. **thood absorve zenproxy+vpnai?** `hermes-migracao.md` afirmou que sim; **correção do dono (10/10):**
   thood é autossuficiente, NÃO absorve. Correção registrada no topo do próprio arquivo (`hi/HANDOFF` `0f57ca62`).
   → o arquivo ainda contém a versão errada no corpo (só o cabeçalho corrige).
3. **Nexus `pg_duckdb`:** o desenho promete (`compose:41-50`,`vars.py:76`) mas o pacote não existe
   (`auditoria/nexus` + `nexus-reconciliacao.md`).
4. **nexus HEAD:** `main`=`3edb5e9` (01/10) × WIP mais novo `recuperado/hermes-1010/wip`=`1544ad1` (10/10) —
   a cópia que **roda** (hermes) tem 6 arquivos WIP que o main não tem.
5. **`--max-turns`:** o boot/memória do segtools diz "limite que o dono não pediu não nasce como padrão"
   (`limite-300k-so-avisa`, `limite-300k`), mas os commits `e5e38b24`/`f23fa452` implementaram o teto e depois
   `7d83e9f2`/`0794128a` o removeram por padrão — **reconciliar a redação** (memória × código).
6. **Kipp "específico vs Tars":** `kipp/docs/contexto.md` §11 e `BACKLOG` dizem que o **schema do manifesto +
   teste de conformidade moram no catálogo do Tars** — mas hoje só existem no huldlabs/kipp. O Tars está
   **devendo** essa fatia (K0).

---

## 8. TOP candidatos a promoção (G→Tars) — ordem sugerida

1. **Acessos da Daneel** (§1): skill + `tars-acessos.mjs` (promover da worktree `hook`) + `acessos/daneel.md`
   gerado no repo privado. **Pedido explícito do dono; hoje ausente.**
2. **ADR-0002 vira doutrina do Tars** (§E) — o próprio ADR manda (D8.3); destrava todo binário (Kipp, Morse, thood…).
3. **Layout `/srv/<amb>/<app>` + ambiente=projeto Compose** (§H/I) — doutrina de operação, hoje só em `hi`.
4. **`dev:recreate` como regra de boot** (§L) — proposta já escrita em `.cache/tars-promocao-devrca.md`.
5. **Backup com prova de restore** (§M) + **alerta que não derruba o job** (§N).
6. **Ficha de agente verificável** (§D) — vira a skill da Daneel, fecha o gap do iageny.
7. **Regra do coordenador** (causa `arquivo:linha` no despacho, §W) + armadilhas de worker (§4.2).
8. **Sync não quebra `prepare-commit-msg`** (§AA) — bug conhecido, provavelmente já resolvido (`93d3059`): confirmar.

---

## 9. LACUNAS DE FONTE (o que a coleta NÃO alcançou)

- Transcripts brutos das sessões do Claude: não alcançáveis daqui (recorte "sessões" coberto por `.cache/*.md`
  + `var/worker-runs/*/resumo.txt`, conforme instruído).
- `homelab-infra-wt`, `sofon`, `nexus`, `lazarus` etc. não têm commits pós-08/10 (0) — nada a coletar.
- `kipp` docs lidos por amostra (`contexto.md`, `BACKLOG.md`, `jira-paridade.md` só cabeçalho).
