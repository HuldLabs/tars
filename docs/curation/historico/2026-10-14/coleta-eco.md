# Curadoria do ecossistema → Tars · fase 1 COLETA (recorte: eco — huldlabs, endurance, lazarus, dotfiles, tars)

Só leitura. Coleta em 2026-10-14. Protocolo: `docs/CURATION.md` (deste worktree) + template
`docs/curation/templates/coleta.md`. Baseline: ponteiros do `.ai/curation.json` (11/10; os de 13/10 são
"amostra — não avança"). Já absorvido na branch de curadoria e **não remapeado aqui**: as memórias do
agente do segtools (rodada 13/10) e as 10 absorções da fatia 2.

Legenda de tipo: **lição · decisão · regra · contexto · armadilha**. Classificação: **G→Tars** (genérico) ·
**E→org** (transversal) · **P** (fica no projeto). Cobertura: **COBERTO** (com `arquivo:linha`) ·
**PARCIAL** · **FALTANDO**.

---

## 0. Fontes e HEADs lidos nesta rodada

| Repo | Ponteiro usado | HEAD lido | Por quê esse ponteiro |
|---|---|---|---|
| `huldlabs` | `1f0fa30` (12/10 14:12Z) | `d95d041` (14/10 02:19Z) | ponteiro do `.ai/curation.json` **é posterior** à coleta de 11/10 (`50638daf`); usei o que o estado registra |
| `endurance` | sem ponteiro | `e94897e` (13/10 23:29Z) | **repo ausente** do `.ai/curation.json` → nada foi curado; leitura integral |
| `lazarus` | sem ponteiro | `f633e77` (07/10 15:58Z) | repo inteiro é de 07/10; delta desde 11/10 é **vazio** por construção |
| `dotfiles` | sem ponteiro | `5c23430` (12/10 09:38Z, branch `fix/sops-age-key-canonica`) | idem; HEAD de 12/10 |
| `tars` (main) | `7b4dce79` (11/10) | `ef7ccf6` (14/10 01:36Z) | ponteiro real do próprio Tars |

---

## 1. HULDLABS (repo central) — 14 itens

### 1.1 `acessos/daneel.md` — o inventário de acessos **passou a existir** (commit `c038d22`, 12/10) — **G→Tars**

A coleta de 11/10 registrou o inventário como **FALTANDO** (§1.3: "o documento `acessos/daneel.md` — hoje
inexistente em qualquer repo versionado"). Ele **existe agora**: `huldlabs/acessos/daneel.md` (57 linhas,
gerado por `tars acessos daneel`). "Sem valores de campo: só nomes. Regenerar muda o diff."

- **Cobertura: PARCIAL.** O **conteúdo** deixou de faltar; o que falta no Tars é a **doutrina de refresh**
  (quem regenera, quando, como detecta drift) — o artefato em si é dado de projeto e mora onde está.
- **Contradição resolvida** com a coleta C de 11/10 (que o listava como ausente).

### 1.2 Regra do dono: **toda revogação de credencial exposta entra no BACKLOG de Segurança** (11/10) — **G→Tars**

`huldlabs/BACKLOG.md` (seção Segurança): *"toda revogação de credencial exposta entra AQUI (Segurança), com
onde está, o que fazer e a fonte; nunca fica só em conversa ou no backlog de um repo."*

- **Cobertura: FALTANDO** no catálogo (o Tars tem a doutrina `segredos-e-identidade.md`, mas não o
  **registro com lar único** de revogação). Destino: extensão de `.ai/governance/segredos-e-identidade.md`.
- É a generalização de um padrão que já se repetiu: 11 achados de credencial exposta entraram em 3 dias.

### 1.3 Achados de credencial exposta (11/10–13/10) — **armadilha recorrente** — **G→Tars (classe)**

`huldlabs/BACKLOG.md` §Segurança. O que se repete em **quase todos**:

| Achado | Onde vazou |
|---|---|
| PAT do GitHub na história do `dotfiles-windows` | `.gitconfig:10`, commits `0bd5a49`,`504b67c`; tag `v1.0.0` `a5a5d68` |
| Senha do Postgres do nexus | DSN completo no `detail` do 500 da API |
| Credenciais do Komodo (2×) | senha no **argv** de container `--rm`; URI do Mongo no log do pyinfra |
| Token da SA do 1Password (Tars automation) | `wsl.exe -- bash -c '... $(cat ~/.config/tars/automation/op-sa.token) ...'` — o shell **padrão** do `wsl.exe` expandiu `$(...)` **antes** do `bash -c` |
| Tópico do ntfy | passado no **argv** do `curl`; impresso por um `pstree` |
| Senha de VPN hardcoded | `zenproxy/assets/vpn-credentials.py` |
| Chave age privada do seo-brain | regenerada, mas **ainda não está** no 1Password |
| Credenciais em plugin do vault do seo-expert | `chatgpt-md`, `smart-composer`, `jira-sync` em texto puro |

- **A classe (genérica e nova para o catálogo):** o segredo não vaza pelo arquivo — vaza pelo **caminho
  indireto**: `argv`, DSN em mensagem de erro, log de ferramenta, expansão de shell antes do `-c`, `pstree`.
- **Cobertura: PARTIAL.** `segredos-e-identidade.md` cobre "nunca imprimir segredo"; **não** cobre "segredo
  nunca em `argv`, URI, mensagem de erro ou log de ferramenta" — que é a regra que teria pego 6 dos 8.

### 1.4 `huldlabs/BACKLOG.md` — item "**Tars desatualizado: absorver o conhecimento do ecossistema**" (dono, 13/10)

Registra esta própria rodada como item de backlog do hub. É o **gatilho de origem** da rotina `tars curation`.
- **Cobertura: COBERTO** por `docs/CURATION.md` (fatia 2). Sem ação.

### 1.5 IAM do ecossistema — **SELD nasceu**, fronteira e questão aberta (commit `0f01ca9`, 11/10) — **E→org**

`huldlabs/BACKLOG.md` §"IAM do ecossistema (SELD)":
- SELD nasceu (`HuldLabs/seld`, 11/10): IAM da org, **cadeia de provedores plugável**, endpoint `whoami`.
- Fronteira: ADR-0003 (`huldlabs/adr/0003-iam-cadeia-de-provedores.md`); núcleo: `seld/docs/adr/0001-seld-nucleo-iam.md`.
- **EM ABERTO (dono): extrair × adotar.** Estudo recomenda **extrair** o IAM base do Sofon (o SELD **é** a
  extração); "casca" (adotar terceiro) só vale para núcleo de terceiro — **ressalva registrada**: o estudo
  **não abriu fontes novas** para terceiros (conferir doc atual de Keycloak e Authentik antes de fechar).
  Gatilho de reabertura para terceiro: **SCIM** ou federação social ampla sem código.
- Destrava: regra 4 do ADR-0002 ("um token por app chamador, emitido pelo IAM da org") e o **inbox
  endereçado** do ADR-0001:95.
- **Cobertura: N/A no Tars** (decisão de domínio/org). Registrado como CONTEXTO DE ORG, não como regra.

### 1.6 **Regra do ADR-0002 generalizada: núcleo próprio × "casca" de terceiro, com gatilho de reabertura**

Derivada de 1.5, mas é método: *extraia o núcleo que é seu; adote terceiro só para núcleo de terceiro; a
adoção precisa de um **gatilho explícito de reabertura** (aqui, SCIM/federação social) escrito junto.*
- **Cobertura: FALTANDO.** Nenhuma skill/governança do Tars diz **quando reavaliar** uma decisão de adoção.

### 1.7 Decisão: **DBOS** como orquestrador durável do Sofon (dono, 12/10) — **E→org/P**

Temporal × Restate × Hatchet × **DBOS**; recomendação e decisão: **DBOS** (biblioteca, reaproveita o PG que
já existe), atrás de uma porta `OrchestratorPort`; **não** fechar Temporal agora. Risco nomeado: virar
**segundo engine de jobs** paralelo ao CORE-JOBS.
- **Cobertura: PARTIAL** — o Tars tem "hooks/portas" como princípio; a regra concreta **"um engine de jobs
  só; um segundo só atrás da mesma porta, com caminho de migração escrito"** não está no catálogo.

### 1.8 Armadilha: **expansão de shell antes do `-c`** (achado 13/10, 05:11) — **G→Tars**

`wsl.exe -- bash -c '... $(cat <token>) ...'` a partir do Git Bash: o shell padrão do `wsl.exe` expandiu
`$(...)` **antes** de o `bash -c` receber a string — o segredo foi parar no transcript do coordenador.
- Classe: **binding de shell** (`wsl.exe`, `ssh host cmd`, `sudo sh -c`, `docker exec sh -c`).
- **Cobertura: FALTANDO** no catálogo. É genérico, curto e caro → cabe em `segredos-e-identidade.md`.

### 1.9 Decisões pendentes do dono (12/10) — **P**
- **thood: auth/tokens despriorizado** ("vamos despriorizar a parte de token"): 2 clientes (Antigravity,
  Hermes) precisariam de token **quando** a auth ligar; nem a decisão nem o "onde entra" ficaram registrados.
- **`/dev/ai` (não `/dev/ia`)**: página que concentra **todos os parâmetros hardcoded** de módulos/plugins
  para ajuste, teste laboratorial e benchmark. Fonte: sessão `analise-thood` 30/09. Nunca encontrado em
  memória/backlog antes — é item **novo** do dono.
- **`/doctor` e `/status`**: inventário de pacotes+serviços com ações; aberto o **"(i) em todo painel" como
  padrão replicável**.
- **P** (produto), mas o "**parâmetros hardcoded num painel único para medir**" é **ideia de método** —
  vale como item **G→Tars PARCIAL** (junto de "medir, não achar").

### 1.10 Garimpo 12/10 — repos e scripts sem casa — **P (com um item de método)**

`huldlabs/BACKLOG.md` §"Repos e scripts sem casa": `bulario` sem `remote.*`; `wsl-vhdx-maintenance.ps1`
(substituído pela skill `wsl-disk-reclaim` → **aposentar, não mergear**).
- Método embutido: **"superado por skill ⇒ aposentar, não mergear"** — decisão binária registrada.
- **Cobertura: FALTANDO** (regra de limpeza de artefato superado).

### 1.11 Armadilha de ambiente: **helper de credencial do Windows ganha do Linux no WSL** (achado 13/10) — **G→Tars**

`credential.https://github.com.helper = !'C:\Program Files\GitHub CLI\gh.exe' auth git-credential` no
`~/.gitconfig` do WSL falha com "not found" **e vence** o helper Linux de `~/.config/git/.gitconfig-linux`.
- Classe: **o config do outro lado do filesystem sequestra o comportamento deste lado** — mesma família da
  regra `ambiente.md` (nunca cruzar filesystem), mas por **precedência de config**, não por caminho.
- **Cobertura: PARTIAL** — `.ai/rules/ambiente.md` cobre caminho e watcher; não cobre **precedência de
  configuração** entre os lados. Dono do conserto: dotfiles (F2 do Endurance).

### 1.12 `huldlabs/README.md` — o hub virou **tabela de 12 peças** (commits `8ba8f65`, `21f8856`) — **E→org**

Peças novas na tabela: **Endurance** ("onde as peças rodam"), **SELD** ("quem é quem"), **Morse**
("como a gente fala" — canais: ntfy, e-mail, SMS, Telegram), **Lazarus** ("como a gente acha", *nome
provisório até a v1.0.0*), **Bulq** ("quem guarda o segredo"), **Murph** ("como nada se perde" — backup
extraído de tokenhood/farmega.v2/nexus/segtools), **thood** ("por onde a IA passa"), **Brand** ("quem coordena").
- Origem dos nomes documentada: **SELD = Hari Seldon** (Fundação/Asimov: "os cofres do tempo só abrem para a
  pessoa certa, na hora certa, e registram a abertura"); **Morse = Interstellar** ("Cooper manda a Murph os
  dados em código Morse, pelo canal improvável"). Tars/Kipp = Interstellar; Sofon/Tomo = *O Problema dos
  Três Corpos*; Pion = méson pi (PHP será **Phonon**).
- **Padrão de método (G→Tars PARCIAL):** "**peça que não está no hub não existe para quem procura**" +
  "a origem do nome é obrigatória". Já está em `.ai/governance/novo-repo.md` (passo 2 e 7) — **COBERTO**.

### 1.13 `estudos/2026-10-13-tars-inventario.md` (commit `63aa57f`) — **P / mapa**
Fora do recorte (o coordenador já o excluiu). Registrado só como HEAD lido.

### 1.14 `huldlabs/BACKLOG.md` — 5 ideias já apontadas para o Tars (10/10, vindas do iageny)

`huldlabs/BACKLOG.md` §"Ideias a portar": (3) correlação worklog × roadmap (registro + gate) → **Tars**;
(4) gate de paridade CI × Taskfile (CI só roda o que existe como `task`) → **Tars**; (5) contrato único de
tempo/locale para todos os projetos → **Tars**.
- **Cobertura: FALTANDO** (3 itens). Não apareceram no `PLANO-RELEASE-TARS.md` de 11/10.

---

## 2. ENDURANCE — 11 itens (repo ausente do `.ai/curation.json`: leitura integral, HEAD `e94897e`)

### 2.1 **Ambiente multiusuário de devcontainer — os 11 itens (D10)** — **G→Tars FALTANDO (alto valor)**

`endurance/BACKLOG.md` D10 "Segurança multiusuário": sem segredo na imagem · **volumes por usuário e por
projeto** · **socket do Docker off por padrão** · **sem agente SSH do dono em automação** · menor escopo ·
digest fixo e assinado · **portas publicadas em `127.0.0.1`**.
- Não há nada disso no catálogo. É **regra de ambiente compartilhado** — o mesmo desenho vale para qualquer
  container de agente. Destino: `.ai/rules/ambiente.md` (extensão) ou skill própria.
- **Cobertura: FALTANDO.**

### 2.2 **Doutrina do "R" que vira feature: nada exige runtime de quem não usa** (R4 do Endurance) — **G→Tars**

`endurance/AGENTS.md` R4: *"Runtime é feature, nunca base. Serviço (Postgres, MySQL, RabbitMQ, MinIO,
ollama, Caddy…) é do compose do projeto, nunca da imagem."*
- Generalização: **a imagem base não carrega o que só alguns precisam** — vale para devcontainer, imagem de
  produção e runner. **Cobertura: FALTANDO.**

### 2.3 **Feature `secrets`/`signing` são FINAS: instalam a ferramenta e delegam** (D4/R5) — **G→Tars**

R5: *"Instalam o `tars` e chamam `tars secrets …`/`tars identity …`; lógica própria de segredo aqui é defeito."*
- Generalização: **feature/plugin de integração não reimplementa o núcleo — delega** (mesma família da
  plugabilidade, mas com o corte explícito "lógica própria aqui é defeito"). **Cobertura: FALTANDO.**

### 2.4 **Uma feature = um `install.sh` idempotente** (R2 do Endurance) — **G→Tars PARCIAL**

O catálogo tem idempotência como princípio genérico; **não** tem a forma concreta ("a unidade de
distribuição é **um** script idempotente, sem abstração antecipada"). **PARCIAL.**

### 2.5 **Armadilhas do navegador/Chrome (4 itens)** — **G→Tars FALTANDO**

`endurance/BACKLOG.md` §"Armadilhas que não podem voltar":
1. **Cookie logado (Ahrefs/Semrush) é credencial** — `--session-name`/`--state` do agent-browser nunca em
   imagem nem volume compartilhado; `--profile` do Chrome do dono nunca em container de automação.
2. **Chrome instalado à mão com `sudo` no container some no rebuild** → vai na imagem/feature
   (portado do `segtools` `22f4f5e6`).
3. **Sem o Chrome real o Playwright cai no Chromium e o Google bloqueia** (`blocked_by_google`).
4. `agent-browser`: usa o **Chrome do sistema**, **nunca** `agent-browser install` (D12).
- Classe: **automação de navegador dentro de container**. Nada no catálogo. **FALTANDO.**

### 2.6 **Tensão declarada entre dois contratos do Tars: quem é a fonte da versão, tag × `main`** — **G→Tars (contradição)**

O Endurance decidiu (D3) prender a tag `v0.1.0` ao `tars identity`, e registra em "Em aberto":
*"o Tars `0.0.1-dev.17` (PR `HuldLabs/tars#11`) **não tem** `tars identity` (verificado em 13/10)"*.
- **CONTRADIÇÃO A REGISTRAR:** o Endurance espera `tars identity` **na ferramenta publicada**; o Tars o tem
  apenas em branch/worktree (`daneel/SKILL.md` na worktree `hook` — como a coleta de 11/10 já apontara).
  A resolução já está a caminho (a branch de curadoria **incorpora** `.ai/skills/daneel/SKILL.md`), mas
  **`tars identity` como comando ainda não existe** — o bloqueio do Endurance **continua válido** até a
  próxima release. O Tars precisa **declarar** isso na release (não deixar o consumidor descobrir).

### 2.7 **5 bugs/limites do Tars reportados pelo consumidor** (HANDOFF + BACKLOG "Em aberto") — **G→Tars**

| # | Achado | Reprodução/estado |
|---|---|---|
| a | **`tars sync` liga hook indevido no `PreToolUse` do Bash** | 14/10, coord Endurance |
| b | **`tars sync` não apaga guard removido de `.ai/base`** | idem (sync não é simétrico) |
| c | **`.githooks/` só é gerado se a pasta já existir** (sem aviso no `init`) | idem — `core.hooksPath` precisa estar no config local |
| d | **`tars identity` inexistente** | bloqueia a `v0.1.0` (D3/F8) |
| e | **Mecanismo canônico de tarefa longa** (o container mata background; hoje `setsid` no host) | F4 — vira ADR |
- Os itens **a–d** foram reportados ao Tars em **14/10 02:30** — a **branch de curadoria já os carrega**
  (commit `b31efe8`). **Coberto pela rodada em curso; não duplicar.**
- O item **e** é **de método, não bug**: "o container mata processo em background" é verdade para
  **qualquer** ambiente de agente. **FALTANDO** no catálogo (casa com "comandos longos em segundo plano",
  já em `.ai/memory/agent/` do segtools — **PARCIAL**, falta o recorte container).

### 2.8 **Doutrina `novo-repo` — o Endurance é a prova viva dela** (commit `e0bec3d`) — **COBERTO**

O commit diz explicitamente: *"O repo nasceu sem o método (doutrina novo-repo)"*. O Endurance executou os
7 passos e travou em `D3`/`F8`. Nada a absorver; é **evidência de conformidade** da doutrina (bom sinal
para o `tars doctor`).

### 2.9 **`No-Lesson:` como trailer de commit** — **G→Tars PARCIAL**

`endurance` usa `No-Lesson: bootstrap, sem falha a registrar.` (e `MAPA.md` do repo idem). O catálogo tem
`Lesson:`; falta a forma **negativa explícita** ("nada a registrar, e por quê") — é o que impede o trailer
virar decorativo. **PARCIAL.**

### 2.10 **`AGENTS.md` do consumidor = "só o que é do repo"; o método vem do Tars** — **G→Tars PARCIAL**

`endurance/AGENTS.md:3-4`: *"Método vem do Tars (`.ai/tars.toml`, base em `.ai/base/`); aqui só o que é do
Endurance."* R3 na prática. **PARCIAL** — é a regra que o catálogo quer, sem forma declarada.

### 2.11 **Achado-de-outra-frente vai ao coordenador dela; credencial exposta vai para o BACKLOG do hub** — **G→Tars**
`endurance/AGENTS.md` (fim): *"Achado de outra frente vai para o coord dela (Tars/homelab/telemetria: coord
segtools; seo-brain: coord do seo-brain). Credencial exposta: seção Segurança do `BACKLOG.md` do `huldlabs`."*
- **Cobertura: COBERTO** pela memória do agente `achados-vaos-aos-coordenadores` (rodada 13/10, segtools) —
  **não remapear**. O que **acrescenta**: o **destino único de credencial exposta = BACKLOG do hub** (§1.2).

---

## 3. LAZARUS — 6 itens (delta desde 11/10: **vazio**; leitura integral, HEAD `f633e77`, 07/10)

> Repo inteiro é de **07/10** — o delta por ponteiro é vazio por construção. A coleta de 11/10 **não** tinha
> ponteiro do lazarus (ele não estava entre os 5 HEADs lidos); portanto isto é leitura nova, não delta.

### 3.1 **ADR-0002: a base do motor foi decidida por MEDIÇÃO, com tabela e orçamento** — **G→Tars PARCIAL**

`lazarus/docs/adr/0002-base-pg-search-e-go.md`: 5 configurações medidas no mesmo corpus (468 documentos,
4.815 trechos, 20 consultas, mesmos vetores `bge-m3`), tabela com top-3 / nDCG@10 / MRR@10 / p95 / RAM-disco.
BM25 (`pg_search`) **dobra** o nDCG do `ts_rank` (0,208 × 0,105) a 2,5× menos RAM que o Meilisearch.
- **Método:** adotar motor/dependência **por número medido no corpus real**, com a ressalva de que o
  comparativo vale entre motores, não como nota final. **Cobertura: PARCIAL** (o Tars prega "medir, não
  achar"; não tem o **formato** da tabela de decisão nem a regra "o spike compara motores entre si").

### 3.2 **Orçamento de p95 como GATE, não meta** — **G→Tars PARCIAL**

`0002` §Decisão 2: typeahead **p95 ≤ 30 ms**, faceta **p95 ≤ 50 ms**, medidos na régua; *"Se o PG estourar o
orçamento, o Meilisearch entra como adapter atrás da mesma `RetrievalPort` — decisão por número, não por
preferência."* E §Mantras R4: *"orçamentos de p95 são gate na régua; estouro grita e nomeia a consulta."*
- **Cobertura: PARTIAL** — o Tars tem "critério de aceite falsificável"; falta o par
  **orçamento numérico + troca de implementação automática por número**.

### 3.3 **Toda dependência de risco entra com adapter de saída** (AGPL do `pg_search`) — **G→Tars PARCIAL**

`0002` §Consequências: *"AGPL do `pg_search`: irrelevante enquanto o uso for pessoal; reavaliar só se virar
SaaS (o adapter `ts_rank` é a saída)."*
- **Método:** ao adotar dependência com licença/risco, **já deixar o adapter alternativo na mesma porta** —
  a saída é desenhada antes de precisar dela. **Cobertura: FALTANDO.**

### 3.4 **Pipeline com pontos de hook nomeados, etapa por etapa** — **G→Tars PARCIAL**

`lazarus/docs/adr/0001-nucleo-modulos-plugins.md` §1: `reescrita → buscadores → fusão → rerank → regras →
variantes → resultado → analytics`, **cada etapa um ponto de hook** (antes/depois/falhou), reusando o motor
de hooks do Sofon (`packages/core/src/hooks.ts`), com `skippedPaths` — *"nunca falhar calado"*.
- O Tars tem "hooks em tudo" como princípio; **não** tem o **molde do pipeline com nome de etapa + hook por
  etapa + fallback visível**. **PARCIAL.**

### 3.5 **Núcleo × módulo × plugin: o critério de fronteira em tabela** — **G→Tars PARCIAL**

`0001` §2: **Núcleo** = obrigatório, agnóstico de domínio · **Módulo** = capacidade opcional ligada por
config, com dono e ciclo de vida próprios · **Plugin** = vocabulário/rubrica/UX **do caso de uso**, não do motor.
- **Cobertura: PARTIAL** — modularidade/plugabilidade são princípio no Tars; o **critério de corte** ("o
  que é do motor × o que é do domínio") não está escrito.

### 3.6 **A técnica de busca (RRF, BM25, k=60) NÃO entra** — **P**
`0001` cita RRF ponderado `k=60`, cross-encoder/LLM no rerank, A/B de variantes. É **técnica de domínio de
busca**, não método do ecossistema. Fica no Lazarus.

---

## 4. DOTFILES — 5 itens (delta desde 11/10 ~vazio; leitura do repo, HEAD `5c23430`, branch `fix/sops-age-key-canonica`)

### 4.1 **Ingestão de repo nos dois sentidos: prova por CONTEÚDO, não por "arquivo copiado"** — **G→Tars FALTANDO**

`dotfiles/docs/windows-ingest-proof.md`: ingestão do `dotfiles-windows` provada por
`git cherry` (patch-id) + `git cat-file`/`rev-parse` (blob), com veredito por item:
- 1 commit de código → cherry-pick **no-op material** (árvore idêntica), preservado como commit vazio com
  `(cherry picked from …)` para **manter a linhagem**;
- 1 tag (`v1.0.0`) → trazida como tag **prefixada** (`windows-v1.0.0`), com o bloqueio de push registrado;
- 5 stashes + 1 worktree → preservados como branches `wip/windows-*` para o dono decidir.
- **Método:** *"prova por conteúdo"* — o critério de "nada se perdeu" é **patch-id/objeto idêntico**, nunca
  a contagem de arquivos; linhagem se preserva mesmo quando o conteúdo é no-op; nada se apaga na origem
  até o dono confirmar. Casa com `.ai/skills/backup-restore` ("backup só é real quando restaura"),
  mas é a **variante git**. **FALTANDO.**

### 4.2 **Bloqueio de push por segredo na história é o veredito, não o impedimento** — **G→Tars PARCIAL**

`windows-ingest-proof.md` §2: a tag existe **localmente**; o GitHub Push Protection **rejeita** (`GH013`)
porque a linhagem tem um PAT em `.gitconfig:10`. Veredito registrado: *"a tag existe localmente; o push
fica pendente de decisão do dono (não publicar segredo)"* + `Não excluir o dotfiles-windows até o dono confirmar`.
- Regra embutida: **Push Protection recusando é o sistema funcionando** — não é obstáculo a contornar; o
  artefato fica local e a decisão sobe. **PARCIAL** (o Tars tem a doutrina de segredos; falta a resposta
  canônica ao `GH013`).

### 4.3 **Armadilhas de ambiente/shell (11 commits de fix, 10–12/10)** — **G→Tars**

| Armadilha | Evidência |
|---|---|
| **CRLF no valor lido do 1Password** | `ca8ef4f` — o `op read` devolve `\r` e corrompe o valor |
| **No WSL, não usar o `python.exe` do Windows nos hooks** | `74863f6` |
| **`.env.local.sops` ausente deve silenciar, não abortar** (e explicar o legado) | `f7318bd`, `e09dc84` |
| **`op read --out-file` precisa de `--force`** (o `mktemp` já cria o arquivo) | `c04fca1` |
| **Pester faz match literal de ref do 1Password** | `f2dd094` |
| **Harness bats imune ao `.git` do worktree copiado** | `57353fe` |
| **Mecanismo de idempotência: a mesma chave age não pode ser regenerada** | `4fe6547` |
| **`signingkey` vai para o `gitconfig.local`, nunca para o versionado** | `8c497f4`, `1d90a4c` |

- **Cobertura: PARTIAL.** CRLF já está em memória perene do Tars (`licoes-plataforma.md`, 08/10) — **COBERTO**;
  as outras 7 não. As duas de **maior alcance**: "silenciar ausência de segredo em dev sem abortar o
  bootstrap" e "`--force` em ferramenta que escreve em arquivo pré-criado".

### 4.4 **Regra de idioma do repositório: código em inglês, conversa em português** — **G→Tars COBERTO**
O repositório é 100% em português (commits, docs, mensagens). Já é regra do Tars (`STANDARDS` §3 / regra do
dono) e está no prompt de worker. **COBERTO — sem ação.**

### 4.5 **`docs/AI-BACKLOG-LIVE-AUDIT.md` + `scripts/ai-lessons*.py` + `.agents/rules/worklog-and-lessons-rules.md`** — **PARCIAL**

Existe uma **governança de lições já implementada em código** no dotfiles (registry
`lessons-governance-curator.toml`, skill `dotfiles-lessons-governance`, checklist, regras de worklog).
É a **R1 respondida** para "registro de lição com gate": **já existe**, no dotfiles — o catálogo deve
**portar a ideia** (não reescrever), como fez com `senior-research`.
- **Ação:** conferir o delta do `.agents/` (não lido nesta rodada — fora do write window de 35 min) antes
  de escrever qualquer coisa nova sobre lições no Tars. **PENDENTE COMO ITEM, não como texto.**

---

## 5. TARS (main) — 9 itens lidos; **o que a branch de curadoria já carrega**

Ponteiro `7b4dce79` → HEAD `ef7ccf6`. Delta: **9 skills novas, 2 governanças, 2 regras, 2 gates, 1 guard,
`docs/CURATION.md`**, +6 linhas em `AGENTS.md`, `BACKLOG.md` novo.

### 5.1 Já na **branch de curadoria** (`/projects/tars/.worktrees/curadoria`, commits `04b3038…b31efe8`) — **NÃO REMAPEAR**
`senior-research` (portada do `ai-brain`, `88c63e0`) · `backup-restore` · `telemetria` · `iac` ·
`daneel` · extensões de `agent-coordination` e `segtools-database` · `ambiente.md` · `novo-repo.md` ·
`versionamento-de-extracao.md` · gates `prod-guard` e `daneel-acoes` · guard
`block-destructive-commands` · `docs/CURATION.md` · `curation.json` · 4 achados do Endurance (`b31efe8`).

### 5.2 `tars main` × branch de curadoria: a diferença é a **rotina**, não o conteúdo** — **G→Tars COBERTO**
A branch tem `docs/CURATION.md` (105 linhas) + `.ai/curation.json` + o teste de idempotência (`ef7ccf6`).
É o que **substitui** esta coleta manual. **COBERTO** (na branch).

### 5.3 `BACKLOG.md` do Tars — regra do **BUG REPORTADO** (novo, `7b4dce79..main`) — **G→Tars COBERTO**
`BACKLOG.md` §"Bugs reportados por consumidores": 3 campos obrigatórios (**repo, data, reprodução**), nesta
ordem; sem reprodução nasce **`a-confirmar`** — *"um report sem reprodução não bloqueia release, mas
também não fecha por decreto"*. Idem em `.ai/rules/principles.md` e `AGENTS.md` (a mesma regra nos 3
lugares, como manda o R3). **COBERTO.** Só 1 bug registrado (`TARS-BUG-1`, segtools, 11/10: prova escreve o
fixture em `/tmp` mas o gate lê os **staged** — a prova nunca dispara).

### 5.4 **Escala de maturidade de item** (`a-confirmar → nao-refinado → ready → in-progress → blocked → fixed`) — **G→Tars COBERTO**
`BACKLOG.md` §"Legenda de maturidade", com a regra *"todo pedido vira item na hora (mesmo cru); só entra na
fila quando ready"* e *"ao entregar, o item sai daqui e vai para o CHANGELOG (fato, um lugar)"*.
**COBERTO** (na main). Candidato a `docs/STANDARDS` se algum consumidor reimplementar.

### 5.5 **Regra do dono: "nada em produção muda sem ordem direta"** — **COBERTO na branch**
Portada em `.ai/rules/principles.md` + `AGENTS.md` + gate `prod-guard/GATE.md`, com a ordem viajando na
linha do comando (`TARS_PROD_ORDER=<data/motivo> <comando>`) e **leitura livre × mudança barrada**.
**COBERTO** (branch). Nota de qualidade: é o **melhor formato do catálogo** — regra + gate + escape
explicável. Serve de **molde** para as regras FALTANDO desta coleta.

### 5.6 **`iageny/ai-workstation` — 5 ideias de método ainda não absorvidas** — **G→Tars FALTANDO**
Do `huldlabs/BACKLOG.md` §"Ideias a portar" (10/10), três já endereçam o Tars e **não** apareceram no
`PLANO-RELEASE-TARS.md` de 11/10 nem na branch: **(3)** correlação *worklog × roadmap* (registro + gate);
**(4)** **gate de paridade CI × Taskfile** (a CI só roda o que existe como `task`); **(5)** **contrato único
de tempo/locale** para todos os projetos. Ficam como **item aberto** desta rodada.
- Nota: (4) é **descartável por detecção** — o `tars doctor` já cobra "o projeto consome o Tars"; estender
  para "a CI só invoca alvo existente" é a diferença entre confiar e verificar.

### 5.7 **Skills `fabber-*` (9 bundles) seguem transitórias** — **dívida nomeada**
`AGENTS.md` e `manual` marcam `BACKLOG:SKILLS-ABSORB`. Na branch de curadoria continuam transitórias.
**Não é delta novo**; registrado para não virar esquecimento.

### 5.8 **`.ai/hooks.jsonc` +4 linhas e `guards/test-block-destructive-commands.sh`** — **COBERTO**
Ligados ao guard novo da branch; sem delta próprio. **COBERTO.**

### 5.9 **`AGENTS.md` do Tars +6 linhas** — **COBERTO**
É a regra do §5.5 (produção) duplicada no topo — R3 cumprido nos 3 lugares.

---

## 6. CONTRADIÇÕES entre repos

| # | Contradição | Versão vigente | O que corrigir |
|---|---|---|---|
| C-1 | **Ponteiro do huldlabs.** `.ai/curation.json` diz `1f0fa30` (12/10) mas a coleta de 11/10 registrou `50638daf` como HEAD lido | **`1f0fa30`** (o estado é a fonte) | nada a corrigir; **registrar** que o delta de `50638daf..HEAD` (14 commits) foi lido agora e o ponteiro deve avançar para `d95d041` |
| C-2 | **`endurance`, `lazarus`, `dotfiles` não existem no `.ai/curation.json`** — a rodada de 11/10 leu "10 repos irmãos" mas só fixou 5 HEADs | os 3 **nunca** tiveram ponteiro | **criar ponteiro** para os 3 (endurance `e94897e`, lazarus `f633e77`, dotfiles `5c23430`) |
| C-3 | **`tars identity` existe?** O Endurance (13/10) diz que **não** existe no dev.17; o Tars tem a skill `daneel` na worktree `hook` e na branch de curadoria | **não existe como comando** — o bloqueio do Endurance vale | a release que trouxer a skill **precisa declarar** o comando no CHANGELOG, senão o consumidor descobre sozinho (de novo) |
| C-4 | **helper de credencial do git**: o `huldlabs` diz que o helper do Windows **vence** no WSL; o Endurance F2 pede um helper **global** na feature `secrets` | ambas certas, escopos diferentes | o F2 do Endurance **resolve** o achado do huldlabs — ligar os dois itens (1.11 ↔ 2.7c) |

---

## 7. TOTAIS E O QUE NÃO FOI LIDO

**Itens coletados: 45** (huldlabs 14 · endurance 11 · lazarus 6 · dotfiles 5 · tars 9).
Classificação: **G→Tars 30** · **E→org 5** · **P 6** · **COBERTO sem ação 4**.
Por cobertura: **FALTANDO 17** · **PARCIAL 13** · **COBERTO 9** · **N/A 6**.
Contradições: **4**.

**Não lido (nomeado, para a próxima rodada):**
- `huldlabs/estudos/**` fora do inventário de 13/10 (evitado de propósito — já é insumo do coordenador);
- `dotfiles/.agents/**` (governança de lições: `worklog-and-lessons-rules.md`, registry,
  `dotfiles-lessons-governance/SKILL.md`, `scripts/ai_lessons_lib.py`) — **item 4.5 é PENDENTE por isso**;
- `dotfiles/app/df/powershell/_functions.ps1` (+188 linhas) e os testes Pester novos (não são fonte de método);
- `endurance/MAPA.md`, `docs/**` e `src/**` (a leitura parou nos 3 docs de conhecimento + CHANGELOG);
- `tars` fora de `.ai`/`AGENTS.md`/`BACKLOG.md`/`docs/CURATION.md` (código de `tools/framework/tars-curation.mjs`
  não foi lido — a rodada leu o **método**, não a implementação).

**HEADs lidos (viram ponteiro novo após revisão do coordenador):**

| Repo | HEAD lido |
|---|---|
| huldlabs | `d95d0419097b1da637fe8d8325460f2141d8c9a1` |
| endurance | `e94897e4ba8eb853d0c063f58d8e8dcfd0ef20fa` |
| lazarus | `f633e7765c328440d7213830c5dae469eca0369f` |
| dotfiles | `5c23430dd2cbcd8a1a9f7c6296c7d075ec05c000` |
| tars | `ef7ccf6f7caeaea6ae5359f5b4ad0001c9048098` |
