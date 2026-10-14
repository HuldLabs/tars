# Curadoria do ecossistema → Tars · fase 1 COLETA — recorte **segtools** (memória operacional, ledger, HANDOFF, BACKLOG, docs/lições)

> Só leitura. Coleta em 2026-10-14. Metodologia: `docs/CURATION.md` + `docs/curation/templates/coleta.md`.
> Recorte **sem `.ai/memory/agent/`** (lido por inteiro na rodada de 13/10 — não remapeado aqui).

| Fonte | HEAD | Papel |
|---|---|---|
| `/projects/segtools` | **`22f4f5e6`** (14/10 01:55Z) | recorte principal |
| `/projects/tars/.worktrees/curadoria` | branch de curadoria | destino; baseline de cobertura |

**Ponteiro usado:** `03e9363d` — a própria rodada de 13/10 (memórias do agente). `git diff 03e9363d..HEAD`
nos caminhos de conhecimento = **vazio** (o único commit do intervalo toca `.devcontainer/Dockerfile`).
Logo o **delta commitado é zero**; o delta real está no **working tree** (memória operacional, ledger e
índices são regravados a cada sessão sem commit — `git status`: `M .ai/memory/{INDEX.md,LEDGER-INDEX.md,
memory.index.json,agent/*.md}` + 20+ `??` de memórias do agente, fora do meu recorte) e no **estado não
commitado de `HANDOFF.md`/`BACKLOG.md`/`DELIVERED.md`** (R1: são fonte de conhecimento mesmo sem commit —
a regra "commit é a prova" vale do lado do Tars, não do recorte).

Legenda de tipo: **lição** · **decisão** · **regra** · **contexto** · **armadilha**.
Classificação: **G→Tars** (genérico) · **E→huldlabs** (transversal da org) · **P** (fica no projeto).
Cobertura no Tars: **COBERTO** (com arquivo:linha) · **PARCIAL** · **FALTANDO**.

---

## 0. Estado do Tars pós-13/10 (baseline do delta)

Commits do Tars desde a rodada de 13/10: a fatia 2 (`absorção`) já subiu 10 linhas na tabela do §3 do
`CURATION.md` — inclusive `segtools/AGENTS.md` + `segtools/docs/devcontainer-lessons.md` →
`.ai/rules/ambiente.md` (linha 3) e `segtools/HANDOFF.md` (BR-IAM-004) → `.ai/skills/agent-coordination`
(linha 7). O delta abaixo é o que **ainda não está** lá.

---

## 1. ADR-017 / memória "serviço core fora do hub" (regra de lugar)

| # | Item | Tipo | Fonte | Classificação | Cobertura no Tars |
|---|---|---|---|---|---|
| 1.1 | **Serviço de núcleo (IA/jobs/mensageria/IAM/lifecycle) mora em `packages/platform/<serviço>`, nunca no hub; adaptador core novo proibido no hub** | regra | `.ai/memory/agent/*` (SEG-661/ADR-017) + `AGENTS.md` §Procedimento pré-criação + `docs/CORE-SERVICES.md` | **G→Tars** | **PARCIAL** — o Tars tem o lugar do **serviço core** em `.ai/rules/ambiente.md`/doutrina de camadas? conferir; a **matriz de colocação de arquivo por família** (`config/file_placement.toml` + `layout-check`) **não** existe no catálogo |
| 1.2 | **Antes de criar arquivo: classificar na matriz (`config/file_placement.toml` família + `allowed`) → não-classificado exige adicionar a família ANTES → gate `layout-check` no pre-commit** | regra | `AGENTS.md` §Procedimento pré-criação · `tools/framework/layout-check.mjs` | **G→Tars** | **FALTANDO** — é gate de método, reusável por qualquer repo do ecossistema |
| 1.3 | **Local do arquivo: global (`tools/`,`packages/`,`config/`,`.ai/`,`central/`,`docs/`,`themes/`,`modules/`) × app (`apps/hub/`); tooling global NUNCA sob `apps/hub/`** — com gate que barra | regra | `AGENTS.md` §Local do arquivo · `layout-check.mjs` | **G→Tars** | **PARCIAL** — mesma família do 1.2 |
| 1.4 | **Dentro de `tools/`: `framework/` (esqueleto do cluster) × `method/` (método nosso, reusável entre clientes) × `clients/` (script de cliente); nada solto na raiz de `tools/`** | decisão | `docs/TOOLING-LAYOUT.md` (SEG-38) · `AGENTS.md` | **G→Tars** | **FALTANDO** — a taxonomia de bucket é portável (o Tars tem `tools/framework` próprio) |

## 2. Práticas de agente que viraram memória operacional do segtools (09-25 → 10-07)

Fonte: `.ai/memory/operational-memory.jsonl` (484 entradas; 266 de 09-20 em diante). Só o que é **método**,
não domínio.

| # | Item | Tipo | Fonte (linha do jsonl / data) | Cobertura no Tars |
|---|---|---|---|---|
| 2.1 | **Correção recorrente: declarar "Feito" sem rodar o gate** — rodar `task check` antes de marcar delivered | armadilha | op-mem 09/25 | **COBERTO** — `.ai/skills/agent-coordination` (entrega prova comando+resultado) |
| 2.2 | **Vermelho de gate com trabalho não commitado de OUTRA sessão não se resolve com o próprio diff** | armadilha | op-mem 09/28 | **COBERTO** (mesma família) + **PARCIAL**: o *procedimento* (isolar com `git archive HEAD` para provar que o vermelho é alheio) não está escrito |
| 2.3 | **Guard que avisa e é engolido não é guarda** — guarda que só loga não protege | regra | op-mem 09/29 (SEG-562) | **PARCIAL** — doutrina de gate existe; a forma "falha alta ou não conta" merece linha própria |
| 2.4 | **Laço `for … do sleep` no Bash queimou a rodada do worker** | armadilha | op-mem 09/29 | **FALTANDO** — regra de método: nunca esperar por laço de sleep; entregar com o que provou |
| 2.5 | **Dois agentes no MESMO checkout colidem: o commit leva edição alheia**; agente direto e worker trabalham em worktree própria; coordenador confere `git diff` antes de commitar arquivo compartilhado | regra | op-mem 10/05 + ledger 10/05 | **COBERTO** — `.ai/skills/agent-coordination` (worktree por worker) |
| 2.6 | **Worktree com cache-dir relativo recompila dependência Rust (~4 min); usar cache do checkout principal + link do `node_modules`** | lição | op-mem 10/05 | **PARCIAL** — a armadilha é genérica (cache por worktree); o número é do projeto |
| 2.7 | **Comando SSH vindo de pwsh/aspas aninhadas quebra com `$`, `$()`, heredoc e `'''`; patch vai em arquivo enviado por stdin (`ssh host 'python3 -' < patch.py`)** | armadilha | op-mem 10/05 | **FALTANDO** — armadilha de shell multiplataforma, reusável |
| 2.8 | **Toda a memória deixou de ser distribuída (AGENTS/HANDOFF/docs soltos): regra do dono → `.ai/memory/agent/`; incidente → `incident-ledger.jsonl`; lição operacional → `operational-memory.jsonl`; `task memory:check` no gate** | decisão | op-mem 10/05 + `.ai/memory/README.md` | **FALTANDO/PARCIAL** — a **triagem de memória por tipo de artefato** + gate é doutrina portável (o Tars tem o próprio `ai-memory.mjs` — conferir se a triagem está escrita) |
| 2.9 | **Fila do lote entrega `processed=0` (contador estruturalmente zerado)** — contador que mede o caminho errado mente | armadilha | op-mem 09/28 | PARCIAL (família "medir a coisa certa") |
| 2.10 | **Pool fechado fora do `finally`: recurso e conferência depois do close** | armadilha | op-mem 10/01 | COBERTO como família de código? (não é método de agente) — **P** |
| 2.11 | **Migration provada só dentro da transação do teste nunca foi aplicada no banco vivo** | armadilha | op-mem 09/30 | **G→Tars FALTANDO** — família "prova no ambiente errado" (mesma raiz do 2.2) |
| 2.12 | **Tarefa de medição/geração não vai para worker: esgota os turnos** | regra | op-mem 10/01 | **PARCIAL** — regra de despacho (o que é e o que não é trabalho de worker) |
| 2.13 | **Sessão de revisão despachada herda o TOKEN do worker, não a identidade do revisor** | armadilha | op-mem 09/29 | **COBERTO** — `.ai/rules/segredos-e-identidade` (transporte por ator) |
| 2.14 | **Recado do coordenador não atendido nem listado na entrega** | armadilha | op-mem 09/29 (SEG-307) | **COBERTO** — skill de coordenação (inbox/ack) |
| 2.15 | **Commit é a prova, não o disco** | regra | op-mem 09/30 (SEG-572) | **COBERTO** — `agent-coordination` (entrega cita o sha) |
| 2.16 | **Regra de dois falha quando o registro falha** (a regra funciona só se o registro que ela lê existe) | armadilha | ledger 10/06 | **PARCIAL** — face interessante do R4/guarda |
| 2.17 | **Dependência externa NÃO se declara "fora do escopo" da fatia** | regra | op-mem 09/27 | **PARCIAL** — política de escopo/fatia (SDD) |
| 2.18 | **"Bloqueio declarado sem procurar o caminho existente"** e **"limitação só com alternativas"** (memória do agente 14/10) — declarar bloqueio exige citar a busca feita | regra | ledger 10/07 + `.ai/memory/agent/limitacao-so-com-alternativas.md` | **PARCIAL** — irmã da disciplina R1 ("nova" sem busca registrada é afirmação sem prova) |
| 2.19 | **Delivery superdeclarado: "nomeia o status" nos dois sentidos quando nenhum nomeia** | armadilha | op-mem 09/29 | **PARCIAL** — forma de escrever entrega |
| 2.20 | **Playwright/Chromium trata `localhost` como contexto seguro: bug de cookie `Secure` não aparece em e2e de browser — exige teste unitário** | lição | op-mem 09/25 | **FALTANDO** — armadilha de teste reusável (qualquer app web) |
| 2.21 | **O `block-secret-dump` é guarda-corpo (lista de comandos), não barreira: a proteção real é a cifra + a chave fora do repo** | decisão | op-mem 09/25 | **COBERTO** — `.ai/governance/segredos-e-identidade.md` |
| 2.22 | **No host Windows (git-bash) `node` não está no PATH; hooks de shell usam `python3` primeiro, `node` como fallback** | lição | op-mem 09/25 | **FALTANDO** — armadilha de ambiente multiplataforma |
| 2.23 | **`docker exec <container>` NÃO herda o `remoteEnv` do `devcontainer.json`** (variável só existe quando quem conecta é o VS Code) | armadilha | op-mem 09/27 | **PARCIAL** — `ambiente.md` cobre devcontainer-first; o furo do `remoteEnv` não |
| 2.24 | **Renomear tooling não é trocar texto: três formas escapam do match literal** (asserção em regex nos testes, paths de config, comentário de migration já aplicada) — só o `task check` pega | armadilha | op-mem 09/27 (SEG-38) | **COBERTO** — `AGENTS.md` §5 renomeação em massa (portado?) conferir no Tars |
| 2.25 | **Marco de ambiente: máquina 32 GB, mas a VM do WSL/devcontainer ainda enxerga ~9,7 GB** — o ganho só chega ao repo quando o limite de memória sobe | contexto | op-mem 10/03 | **P** (dado do projeto/ambiente) |

## 3. Incidentes do ledger com forma genérica (últimos 30 dias)

Fonte: `.ai/memory/incident-ledger.jsonl` (192 incidentes; 147 de 09-20 em diante). Abaixo só os que
carregam **forma** portável — os de domínio (kanban, board, tema, Kiwi/Figma) ficam em **P**.

| # | Item | Tipo | Data | Cobertura |
|---|---|---|---|---|
| 3.1 | **Worker editou o checkout principal (fora da própria worktree)** | armadilha | 10/06 | COBERTO (worktree por worker) |
| 3.2 | **Worker apagou volume Docker com override de guarda** | armadilha | 10/07 | **COBERTO** — a proibição de `SEGTOOLS_ALLOW_DESTRUCTIVE` é a forma generalizada |
| 3.3 | **Worker mandou comando para background e a sessão morreu sem commit** | armadilha | 10/05 | **FALTANDO** — regra: comando longo em background precisa de laço/retomada com prova |
| 3.4 | **Commit entrou com patch parcial (quoting quebrou o script)** | armadilha | 10/05 | **PARCIAL** — irmã do 2.7 |
| 3.5 | **Diagnóstico repetindo ação que cria credencial real** — diagnóstico read-only que não é read-only | armadilha | 10/07 | **PARCIAL** — doutrina de segredos |
| 3.6 | **Promessa de registrar no ledger sem executar** | armadilha | 10/07 | PARCIAL (entrega fala de si mesma) |
| 3.7 | **Retomada sem o ritual da coordenação** | armadilha | 10/07 | **COBERTO** — skill de coordenação (boot/retomada) |
| 3.8 | **Texto para outro agente escondido atrás de ferramentas** | armadilha | 10/07 | **PARCIAL** — prompt de worker |
| 3.9 | **Aviso de MCP desconectado ignorado** | armadilha | 10/07 | PARCIAL |
| 3.10 | **Credencial do agente sumiu do banco de dev** | armadilha | 10/07 | P |
| 3.11 | **Unit versionada dizia 4012 e a instalada 4011** | armadilha | 10/05 | **FALTANDO** — forma genérica: versão declarada × versão instalada divergem |
| 3.12 | **Gate dependente de rede real travava a suíte** | lição | 10/05 | **PARCIAL** — teste que não pode depender de rede/ambiente |
| 3.13 | **Mais paralelismo foi mais lento: `parallelism=12` vs `8` (medido)** | lição | 09/26 | **PARCIAL** — medir, não achar (R2) |
| 3.14 | **Logger JSON descartando `exc_info` esconde a exceção — log sem stack não atesta** | armadilha | 09/26 | **FALTANDO** — falha alta no log |
| 3.15 | **Erros de typecheck do gate resolvidos por narrowing/cast/arquivo próprio** | armadilha | 10/01 | **FALTANDO** — forma genérica: consertar o gate em vez do erro |
| 3.16 | **Contrato de comentário/doc promete garantia que o código não tem** | armadilha | 09/29 | **PARCIAL** |
| 3.17 | **Revisão feita pelo mesmo handle que entregou: independência só de máquina** | armadilha | 09/30 | **COBERTO** — skill de coordenação (revisor ≠ entregador) |
| 3.18 | **Setup de teste/CI desenhado para a máquina errada: só um OS, só um mount, só um cwd** | armadilha | 09/28 | **FALTANDO** — portabilidade do harness |
| 3.19 | **Specs de e2e desatualizadas após mudança de shell/topo** | armadilha | 09/28 | PARCIAL (manter teste junto do contrato) |
| 3.20 | **Flake de relógio: validade no teto exato morre em check constraint** | armadilha | 09/29 | **FALTANDO** — fronteira inclusiva de tempo (teste com relógio) |
| 3.21 | **Aviso de key do React / comentário `//` dentro do JSX virou texto na tela** | armadilha | 09/28 | P (front) |
| 3.22 | **Injeção de comando no próprio wrapper de segredos (argv reconstruído em string, `shell: true`)** | armadilha | 09/26 | **PARCIAL** — coberto como classe em `security-testing`? conferir |
| 3.23 | **CSP sem `script-src` (nonce + `strict-dynamic`) não é proteção anti-XSS** | lição | 09/25 | **PARCIAL** — skill `security-testing` (conferir se está lá) |
| 3.24 | **Duas lanes rodando o mesmo scheduler sobre o mesmo arquivo de estado** | armadilha | 09/26 | **FALTANDO** — exclusão mútua de job/lane |
| 3.25 | **O `finally` do refresh protege contra exceção, não contra morte (`kill -9`/OOM)** | armadilha | 09/26 | **FALTANDO** — limites do `finally` |
| 3.26 | **Permissão/retry de escrita atômica vale para Linux também, não só Windows** | lição | 09/26 | **PARCIAL** |
| 3.27 | **Orquestração tratada como periférica e volume assumido baixo** / **Molde (Copier) montado antes do kernel** / **Construiu no repo que só tinha o plano** / **Placeholder no lugar do shell do framework** | armadilha | 10/06 | **G→Tars FALTANDO** — família "montar a forma antes do conteúdo" e "subestimar volume de orquestração" |
| 3.28 | **Alias/renomeação do vitest não acompanha o código** | armadilha | 09/24 | PARCIAL (irmã do 2.24) |
| 3.29 | **Bundle de skill referenciava arquivo externo ao repositório** | armadilha | 09/25 | **PARCIAL** — integridade de bundle de skill (o Tars distribui skill!) |
| 3.30 | **Rodar e2e como root deixa artefato que o usuário do host não apaga** | armadilha | 09/25 | **FALTANDO** — uid de artefato em container |
| 3.31 | **Um só checkout/`distDir` de dev compartilhado derruba o e2e do hub** | armadilha | 09/25 | **PARCIAL** — isolamento de worker (irmã do 2.5) |
| 3.32 | **Gate com exceção fantasma** (exceção aponta para arquivo que não existe mais) | armadilha | 10/01 | **FALTANDO** — gate que reprova exceção órfã; forma reusável |

## 4. HANDOFF / BACKLOG / DELIVERED — o que é método

| # | Item | Tipo | Fonte | Classificação | Cobertura |
|---|---|---|---|---|---|
| 4.1 | **BR-IAM-004: chave de despacho presa a um projeto escrevia em OUTRO** (autenticava pelo vínculo do ATOR e descartava o `bound_resource` do RECURSO); correção = vínculo viaja na identidade, comparação num lugar só, no mesmo ponto do ator e do gate, e as superfícies passam a identidade INTEIRA | lição/decisão | `HANDOFF.md:3` (11/10) | **G→Tars** | **PARCIAL/COBERTO** — `CURATION.md` §3 linha 7 diz que já foi absorvido em `.ai/skills/agent-coordination`; a **forma** ("a autoridade é o RECURSO, não o ATOR"; "o caminho de escape vira o caminho normal quando o primário falha em silêncio") merece estar na doutrina de identidade |
| 4.2 | **Erro do upstream nunca é engolido: logar e devolver corpo/erro como texto; STOP vazio vira loop de retry do IDE** | regra | `HANDOFF.md` / op-mem 10/05 | G→Tars | **FALTANDO** (família "falha alta") |
| 4.3 | **Ao repassar path num proxy (FastAPI), preservar a query string original (`{full_path:path}` a descarta)** | armadilha | op-mem 10/05 | P (stack) | PARCIAL |
| 4.4 | **`POST` de seção de config grava só as chaves presentes no form — sobrescrever ausentes zera campo de OUTRA seção** | armadilha | op-mem 10/05 | G→Tars | **FALTANDO** — forma genérica: PATCH parcial em formulário com estado compartilhado |
| 4.5 | **Regra de produto: app de PRODUÇÃO só se toca com ordem EXPRESSA do dono; bug em prod → backlog do repo + perguntar** | decisão | `HANDOFF.md:22` (10/10) | **E/G** | **PARCIAL** — doutrina de autonomia/ordem; o Tars tem "o dono decide, o agente executa" — falta o caso "produção exige ordem expressa" |
| 4.6 | **BACKLOG de contingência × fonte única no módulo `projects`** ("o item sai do BACKLOG ao entrar no DELIVERED; um fato, um lugar") | regra | `BACKLOG.md:1`, `DELIVERED.md:1` | **G→Tars** | **PARCIAL** — o Tars tem fila/cursor/entregue; a regra "um fato, um lugar" + append-only do entregue é forma portável |
| 4.7 | **Formato de entrega com `claim`/`verify`/`expect`/`real` + a seção "Declarado (não medido nesta rodada)"** | regra | `DELIVERED.md` (todas as entradas) | **G→Tars** | **PARCIAL** — skill de coordenação pede comando+resultado; o par **claim→verify** e a marcação explícita do NÃO medido é o que dá força (R4) |
| 4.8 | **Ponteiros que apontam para linha errada viram referência por key** (número de linha envelhece; key não) | lição | `DELIVERED.md` 09/27 (SEG-45) | **G→Tars** | **FALTANDO** — disciplina de referência em doc |
| 4.9 | **Vermelhos pré-existentes do `task check` viram item de BACKLOG com o log, em vez de investigação na fatia** | regra | `BACKLOG.md` §Bloqueado (`CHECK-RED-PRE`, 11/10) | **G→Tars** | **PARCIAL** — a fatia de método é "vermelho novo fora do escopo vira subtarefa irmã com o log" |
| 4.10 | **Gaps de ferramenta encontrados na prova (worktree aninhado quebra o `relink`; launcher assume REPO_ROOT do container) são relatados mesmo fora do escopo, com o comando que reproduz** | regra | `BACKLOG.md` DOGFOOD-B | G→Tars | **FALTANDO** — forma de relatar gap fora do escopo |

## 5. `docs/` do segtools — regras de método que já são ligadas ao Tars (checkpoint: deduplicar na fase 2)

| # | Item | Classificação | Cobertura |
|---|---|---|---|
| 5.1 | **Regra de negócio no código leva marcador `BR-*`**; `COMMENT ON` no banco; catálogo gerado (`docs/business-rules.md`) + gate (`task rules:catalog`/`rules:check`) — `docs/STANDARDS.md` §12 | **G→Tars** | **PARCIAL** — o Tars tem doutrina de regra? Conferir `.ai/rules/`; o par "marcador + catálogo gerado + gate" é portável inteiro |
| 5.2 | **`No-Release: <motivo>`** só para prosa/índice; mudança visível no consumidor sobe `N` | G→Tars | COBERTO (`CURATION.md` §4 / `EVOLUTION` D18) |
| 5.3 | **Referências no código por scan** (`refs-check`/`refs-index`) — contrato em `docs/AGENT-CONTRACT.md` §Referências | G→Tars | **FALTANDO** — linhagem na doc, gate de artefato gerado |
| 5.4 | **Porta de acesso a dados por domínio: o SQL mora no adapter; a porta expõe método de domínio, nunca `query(sql)`** (`docs/QUERY-LAYER.md`) | **G→Tars** | **FALTANDO/PARCIAL** — `.ai/skills/segtools-database` no Tars cobre camadas; a regra "porta tipada, nunca `query(sql)`" é a forma cristalina |
| 5.5 | **Proibição de cruzar sistemas de arquivos**: cada processo trabalha no FS onde o repo mora (`\\wsl.localhost\`/`/mnt/c|d` = 9P/DrvFs, eventos de arquivo não chegam) | G→Tars | **COBERTO** — `.ai/rules/ambiente.md` (absorvido 13-14/10, `CURATION.md` §3 linha 3) |
| 5.6 | **Renomeação em massa: padrão exato (nunca a palavra solta), exclusões obrigatórias (locks, migrations aplicadas, identidades de dado), simulação antes, árvore limpa, commit com pathspec, prova depois (`frozen-lockfile` + check completo)** | G→Tars | **PARCIAL** — conferir se `AGENTS.md` §5 do segtools já foi portado; a lição de 29/09 (`@segtools` → `@sofon.local`) é a prova de que a regra existe por ter falhado |
| 5.7 | **Doc de lições por tipo**: `docs/security/<scope>-lessons.md` (segurança) e fechamento do `EXTRACTION.md` (extração) — a retrospectiva R4 aplicada ao repo | G→Tars | PARCIAL — `EVOLUTION.md` no Tars é a fonte; o **destino por tipo de trabalho** pode estar faltando |

## 6. `docs/estudos` e `docs/research` — só método

Fontes: `docs/estudos/motor-compilado-estado.md` (`a05df4af`), `docs/research/SOTA de recuperação de
solução` (`03e9363d`). Ambos são **estudo aplicado** do segtools/homelab: conteúdo **P**.

| # | Item (só a forma de método) | Tipo | Cobertura |
|---|---|---|---|
| 6.1 | **Estudo de SOTA termina com "como melhorar" + um alerta adversarial citado** (ex.: "Relevant or Random", ACL 2025 — a qualidade do candidato pode importar mais que a precisão do match) + veredito explícito do que **já existe** × o que **não foi encontrado pronto** | regra | **COBERTO** — `.ai/skills/senior-research` (portado do vault na fatia 2) |
| 6.2 | **Tabela R1-R9 com estado e PROVA por fatia** ("R1/R2/R3/R4/R9 parciais; R5/R7/R8 não começados") + plano de retomada em fatias, com o que é decisão do dono separado | regra | **PARCIAL** — é a forma do `EVOLUTION`/plano de retomada; a exigência de "estado + prova por linha" merece doutrina |
| 6.3 | **Toda leitura de estudo cita os dois HEADs lidos** (`hi main a95382d`, PoC `spike/motor 54d1a1b`) | regra | **FALTANDO** — procedência por sha no estudo (R1/AGENT-CONTRACT "referência") |

## 7. CONTRADIÇÕES e drifts observados

| # | Contradição | Fonte A | Fonte B | Leitura |
|---|---|---|---|---|
| 7.1 | **Onde mora a memória** | `.ai/memory/operational-memory.jsonl` + `.ai/memory/agent/*.md` (regra do dono 05/10: memória **deixou de ser distribuída** em AGENTS/HANDOFF/docs soltos) | `HANDOFF.md` (1135 linhas, seções de estado por data) e `BACKLOG.md` continuam sendo usados como memória narrativa — inclusive **não commitados** no working tree | Não é contradição fatal: HANDOFF = **cursor/estado de sessão**, BACKLOG = **fila**; a memória durável é o `.ai/memory`. Mas a fronteira **não está escrita em lugar nenhum** — é a candidata nº 1 a doutrina no Tars: *onde escreve cada tipo de conhecimento* |
| 7.2 | **Ponteiro de curadoria × working tree** | `.ai/curation.json` aponta `03e9363d` (13/10) e diz "memórias do agente lidas por inteiro" | as memórias do agente têm **20+ arquivos novos `??`** e 4 modificados **não commitados**; `INDEX.md`/`memory.index.json` idem | Meta-lição de curadoria: **ponteiro por commit perde o conhecimento não commitado**. Enquanto ele não for commitado, nenhum `git diff <ponteiro>..HEAD` o verá — e ele foi lido em 13/10 **por leitura direta**, não por diff |
| 7.3 | **`memory.index.json` encolheu 3835 linhas** (não commitado) | `git diff --stat` mostra `3835 +----` (removidas) | `INDEX.md` diz "0 entradas / teto 15800 tokens" | O índice ficou vazio na regravação — **regressão provável** no gerador, não coleta; registrado para o dono do segtools, **não** é item de Tars |

---

## 8. Totais e o que NÃO foi lido

**Fontes lidas (por inteiro ou por delta):**
- `git diff 03e9363d..HEAD` nos caminhos de conhecimento → **vazio** (1 commit, `.devcontainer/Dockerfile`).
- `.ai/memory/operational-memory.jsonl` — 484 entradas (266 de 09-20 em diante; **50 entradas de 09/27→10/04
  lidas por título + as 09-20→09-26 e 10-05→10-06 amostradas**) — *não* lidas uma a uma as 218 anteriores a 09/20.
- `.ai/memory/incident-ledger.jsonl` — 192 (147 de 09-20 em diante; **títulos** de 09-24 em diante lidos; corpo
  completo lido em ~25).
- `HANDOFF.md` — seções de 07/10 a 11/10 (as de 11/10 e 10/10 lidas por inteiro; as anteriores por título).
  **Não lidas:** as seções abaixo de `## Estado em 07/10 17:50` (histórico).
- `BACKLOG.md` (190 linhas) — **inteiro**. `DELIVERED.md` (67) — **inteiro**. `HANDOFF-HISTORY.md` — **não lido**.
- `.ai/memory/INDEX.md`, `LEDGER-INDEX.md`, `memory.index.json` (índices gerados) — lidos os cabeçalhos.
- `docs/estudos/motor-compilado-estado.md` + o commit de `docs/research` (SOTA) — lidos por **corpo de commit**
  (as mensagens são densas e trazem veredito); o corpo HTML/MD completo dos estudos **não** foi aberto.
- `.ai/memory/agent/**` — **fora do recorte** (lido por inteiro em 13/10); só citei de passagem (`[[…]]`).

**Totais:** ~95 itens coletados (25 na §1-2 + 32 na §3 + 10 na §4 + 7 na §5 + 3 na §6 + 3 contradições + 15 de
memória de agente citados por referência), dos quais os marcados **G→Tars** são **~45**; **PARCIAL** ~40 e
**FALTANDO** ~25 (contagem na fase 2, item a item).

**HEAD lido (vira o ponteiro novo após revisão):** `/projects/segtools` = **`22f4f5e6eed1a9f043857a09db4d114ac92c405f`**
(2026-10-14 01:55:52Z). Limitação: o delta de conhecimento real está **no working tree**, não em commit — o
ponteiro por sha **não** o representa (ver §7.2); sugiro registrar isso na rodada.

**Não lido:** `HANDOFF-HISTORY.md`, seções do HANDOFF anteriores a 07/10, corpo completo dos ~180 arquivos de
`docs/research/` (recorte fica no método, não no domínio), `docs/adr/adr-00{1..4}*` (ADRs examinados por
referência via HANDOFF/BACKLOG), `AGENTS.md`/`CLAUDE.md` do segtools (lidos os trechos citados) e as 218
entradas da memória operacional anteriores a 09/20.
