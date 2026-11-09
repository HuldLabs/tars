# BACKLOG — Tars

> **Fonte única.** Uma linha por item; detalhe em **link**, nunca parágrafo na célula. Todo
> pedido vira item **na hora** (mesmo cru); só entra na fila quando **ready**. Ao entregar, o
> item sai daqui e vai para o `CHANGELOG` (fato, um lugar).

## Legenda de maturidade
`a-confirmar` → `nao-refinado` → `ready` → `in-progress` → `blocked` → `fixed`

## Em andamento
- [ ] **BUG (reportado pelo kerr, 08/11): `lint-swallow` roda no checkout do `TARS_PROJECT`, não na worktree do commit.**
  Reprodução: no kerr, `git worktree add .cache/wt-X -b feat/x HEAD`; dentro dela `git add <arquivo>` e `git commit`.
  O gate lê `git diff --cached` com cwd=/projects/kerr (índice vazio ali), cai em "modo prova" e reprova 62
  arquivos alheios. Esperado: o gate usa o `git rev-parse --show-toplevel` do commit (a worktree). Contorno
  temporário (dívida nomeada): commitar pelo `.cache/coordkerr-wt-commit.sh`. Origem do relato: worker SB-169.

| # | item | estado | detalhe |
|---|---|---|---|
| END-SYNC-1 | **`tars sync` liga hooks indevidos no `PreToolUse` do Bash** | fixed | corrigido na dev.26; conferido na dev.27 por seo-brain e Tomo (PreToolUse do Bash só com block-destructive-commands e block-secret-dump) |
| END-SYNC-2 | **`tars sync` não apaga guards removidos de `.ai/base`** | fixed (dev.19, fa4a693; conferido 14/10: teste "sync e' SIMETRICO") | o guard sai da fonte e fica vivo no consumidor; reportado pelo coord Endurance (14/10) |
| END-SYNC-3 | **`.githooks` só é gerado se a pasta existir — e o `init` não avisa** | fixed (dev.19, db15075; conferido 14/10: "declarar gate de hook git BASTA" e "init AVISA") | consumidor novo fica sem hook e não sabe; reportado pelo coord Endurance (14/10) |
| END-CLI-1 | **`tars identity` não existe** — bloqueia a v0.1.0 do Endurance | fixed | `tars identity` existe desde a dev.19 (show/verify/provision/revoke/sign-setup); item vencido, conferido em 14/10 |
| SYNC-PRE-TOOL | **`tars sync` sobrescreve `hooks.PreToolUse` e derruba hook posto à mão** | fixed (dev.28) | achado 14/10 ao rodar o sync do próprio catálogo: o `prod-guard` está no PreToolUse do `.claude/settings.json` (não é `[tars].guards`), e o sync reescreve o evento só com os guards declarados — o hook do gate some calado. Não é desta fatia (pré-existente no HEAD); reprodução: `tars sync --tars . --project .` → `git diff .claude/settings.json` mostra o prod-guard removido. Correção provável: preservar entradas de PreToolUse cujo comando o sync não gerencia (posse por `OWNED`/caminho). |
| TEST-MUTA-REPO | **A suíte completa (`vitest run`) reescreve o `.claude/settings.json` do próprio repo** | fixed (dev.28) | achado 14/10 no ensaio da dev.27: depois do `vitest run` o PreToolUse perde o `prod-guard` (mesma causa do SYNC-PRE-TOOL); teste não pode mexer na árvore real |
| TARS-SELF-1 | **`tars sync --upgrade` do binário, no repo do Tars, não detecta o modo `self`** | fixed (dev.28) | achado 14/10 ao fazer o Tars receber a dev.27 primeiro: criou `.ai/base/` e `.ai/tars.lock`, tratou o repo como consumidor e tirou o `prod-guard` do PreToolUse (revertido à mão). Enquanto não corrigir, o passo "o repo primeiro" de `release.md` §6 é **só o `self-update`** no Tars |
| AVISO-SALTO | **Modelo do aviso: nota de salto** | nao-refinado | mudança no próprio self-update (ex.: token opcional da dev.27) só vale depois de instalada; o aviso precisa de um campo "só neste salto" |
| SEG-SELF | **segtools é tratado como o próprio catálogo no wiring** | fixed (dev.28) | o hook do consumidor aponta sempre para `.ai/base/guards/`; o coord SegTools confirmou (14/10) que as cópias de `.ai/guards/` ficaram para trás e liberou a mudança. Chega lá quando o dono liberar o `sync --upgrade` do segtools (pausado) |
| STOP-WIRING | **O sync não gera o hook de `Stop`** | fixed (main, lote dev.29) | segtools (14/10, dev.28): `stop-unfinished-work` sai do PreToolUse (`FORA_DO_PRETOOL`) mas nenhum ponto o liga no `Stop`; o `Stop` à mão do consumidor fica apontando para `.ai/guards/`. Lote dev.29; contorno no segtools (cópias idênticas à base) |
| GH-ACTIONS-BILLING | **Cobrança de Actions da HuldLabs travada** | blocked | reportado pelo coord Tomo (14/10): o CI do HuldLabs/tomo#24 não inicia. Ação do dono (billing da org); a próxima Release do Tars depende do mesmo Actions |
| GITLEAKS-FP | **Allowlist do gitleaks para `.ai/governance/licoes-plataforma.md:12`** | ready | varredura do histórico inteiro (319 commits, 14/10): 1 achado `private-key`, falso positivo (texto da lição cita o cabeçalho `BEGIN OPENSSH PRIVATE KEY`) |
| WT-CLEAN | **Limpar worktrees antigas** (`rel19` e 12 com alteração: a3, a4, daneel, g2, g3, hook-main, hookexec, k0, licoes, novo-repo, rel2, rel3) | ready | conferir cada uma antes de apagar |
| ADOPT-GHCR | **Secret GHCR por repo no `tars adopt`** | nao-refinado | herdado do coord anterior (14/10) |
| IMG-TRIXIE | **Imagem em trixie** | nao-refinado | herdado do coord anterior (14/10) |
| SUITE-LOCAL | **3 falhas locais de ambiente na suíte** (verdes no CI) | nao-refinado | ai-layer-check (rulesync e `.ai/rules/ambiente.md` sem `root:true`); embutido gerado desatualizado; "sem motor" com `~/.local/bin` no PATH |

## Metodologias do ecossistema (pedido do dono, 14/10)

A doutrina `release` (`.ai/governance/release.md`) é a primeira. Faltam, no mesmo formato (papéis, passo a passo, quando falha, quem cobra), cada uma um item da fila:
- **Rollback**: voltar uma versão publicada (binário, imagem, lock do consumidor) e um deploy; quando se faz rollback e quando se publica a correção para frente; prova de que voltou.
- **Deploy**: do artefato publicado ao ambiente (homelab: receitas pyinfra, produção só com ordem do dono, `TARS_PROD_ORDER`), promoção entre ambientes, verificação pós-deploy.
- **Hotfix**: correção urgente sobre uma versão publicada (branch, versão, Release e aviso).
- **Incidente em produção**: detectar, conter, comunicar, corrigir e registrar no ledger (liga com `incidente-vira-prevencao.md`).
- **Atualização de dependências**: bump de peças do ecossistema (Tars na base do Endurance) e de terceiros, com cadência e gate.
- **`tars release prepare`** (Endurance, 14/10): montar o PR final pelo modelo `templates/PR-RELEASE.tpl.md`, subindo a fonte da versão, abrindo a seção do CHANGELOG e listando os bugs reportados.
- **Gate de nível da versão**: o `release-guard` reprova commit que muda a versão para fora de `dev.N+1` (sai de `-dev`, sobe patch/minor/major) sem o trailer `Nivel-Aprovado: <data> <onde o dono confirmou>` — a regra de `release.md` §Quem decide o nível vira cobrança.
- **Descontinuar**: tirar de uso uma versão, feature ou peça sem quebrar o consumidor.
- **Procedência do código portado (proposta, aguarda o dono; kerr 08/11)**: a R1 porta lógica e trechos de outros
  projetos e bibliotecas, e a falha da origem vem junto, invisível ao `npm audit`/Dependabot (casam versão de pacote,
  não trecho copiado). Manifesto por repo (origem: repo, commit, arquivo → destino) + checagem periódica dos avisos e
  correções da origem para reaplicar. Fonte: SELD ADR-0002 §7.4.
- **Aviso vira teste (proposta, aguarda o dono; kerr 08/11)**: com LLM o atacante transforma CVE em teste contra
  qualquer código em minutos. Na defesa: cada aviso novo das dependências e da origem das peças portadas vira teste
  automático gerado por LLM e rodado no gate contra as superfícies do consumidor. Motor: o **segtools** (testes de
  segurança em clientes autorizados; aperfeiçoar, não criar), com a skill `security-testing`.
  Fonte: SELD ADR-0002 §7.4.

## Bugs reportados por consumidores

### Reportados 08/11 (kerr)
- **[GUARD] comando longo em primeiro plano** — repo: `kerr`; data: 08/11/2026; reprodução: a regra
  "comando >~10 s vai para segundo plano" (CLAUDE.md, memória do agente) foi descumprida 6 vezes numa
  sessão (commit pela worktree com gates, `npm audit`, `bun add`, `uv lock`, `pytest`, `next build`), e o
  dono teve de cobrar de novo. Fazer: guard `PreToolUse` (Bash) que barra em primeiro plano os padrões
  sabidamente longos (`gates.sh`, `*wt-commit*.sh`, `pytest`, `next build`, `bun|npm (install|add|audit)`,
  `uv (lock|sync)`, `docker build`) quando a chamada não traz `run_in_background`; mensagem nomeia a regra.
- **[BUG] `.venv` compartilhado com worktree vira de versão no gate** — repo: `kerr`; data: 08/11/2026;
  reprodução: worktree de commit liga `.venv` do checkout; o `uv.lock` da worktree difere do instalado;
  `tests/test_mcp_smoke.py` roda `uv run --with "mcp[cli]"`, que sincroniza o `.venv` de todos durante o
  gate → vermelho NOVO falso (3x) e o ambiente do checkout rebaixado (certifi/otel). Fazer: o gate roda com
  `UV_NO_SYNC=1` (ou `--no-sync`) e falha alto se o `.venv` não bate com o lock da árvore commitada.

### Fila da dev.23 (14/10)
- **[BUG] CHANGELOG com data no título engole seções** (Endurance): `## 0.0.1-dev.2 — 13/10/2026` não é reconhecido como cabeçalho, e o `release-notes` junta a dev.2 e a dev.1 dentro da dev.3, sem avisar (fere a R4). Fazer: aceitar sufixo após a versão **e** falhar alto se uma linha `## ` não for parseável.
- **`release-notes` para imagem/artefato OCI** (Endurance): a verificação diz "binário provado na sua libc" (o endurance troca com `sed`, frágil) e o `--image` diz "binário em /<bin>", que não serve para imagem base. Fazer: `--kind bin|image` (ou `--verify`/`--image-note`) com o texto de cada caso.
- **`tars self-update`**: baixa a Release, confere o sha256, troca o binário e roda o `sync --upgrade`. Atualizar vira um comando, sem `gh` e sem compilar (o Tomo mandou compilar).
- **Teste de upgrade real** no CI: instalar a versão N-1, rodar `sync --upgrade` para N e conferir que os arquivos mudaram. Os bugs da dev.20/21 passaram porque nenhum teste cobria isso.
- **DRIFT `org/*` no consumidor**: as 5 doutrinas `org/*` dependem do catálogo do huldlabs, que não chega ao binário (o Kipp contornou com symlink). Fazer: embutir no catálogo ou marcar como de outro escopo.

Regra do dono (11/10, `.ai/rules/principles.md`): bug do Tars reportado por um consumidor
**entra na próxima release** e o `CHANGELOG` **lista os reportados que fechou**. O consumidor
**reporta aqui** com **repo, data e reprodução** — três campos, nesta ordem. Contorno local só
é temporário e fica registrado como dívida nomeada no consumidor.

- **repo** — de onde veio (`segtools`, `kipp`, `farmega.v2`, …).
- **data** — quando apareceu (AAAA-MM-DD).
- **reprodução** — o comando que falha e a saída literal. Sem isso o item nasce **`a-confirmar`**
  (não vira dívida infinita: um report sem reprodução não bloqueia release, mas também não
  fecha por decreto).

| # | repo | data | reprodução | estado |
|---|---|---|---|---|
| TARS-BUG-29 | Kerr (coord) | 2026-11-04 | **lacuna (método)**  Nada no pré-compactação nem no fechamento prova que o que o dono pediu e o que o agente concluiu saiu da conversa para o repo: o `precompact-persist-state` só barra HANDOFF/BACKLOG/DELIVERED sem commit. No Kerr (03–04/11) o agente deu a pesquisa de modelos como perdida três vezes; estava no repo. Proposta: guard/skill que, antes de compactar e ao fechar o dia, extrai as mensagens do dono da transcrição (`~/.claude/projects/<proj>/<sessão>.jsonl`) e aponta as respostas do agente com números medidos ausentes de bench/docs/BACKLOG/HANDOFF. Protótipo local, temporário (dívida nomeada): `kerr/tools/coord/session_audit.py` (931 mensagens, 2 respostas fora do repo). |
| TARS-BUG-30 | seo-brain (coord) | 2026-11-04 | **lacuna (gate local no commit-msg)**  `tars-hooks.mjs` `planGates` (l. 60-66) só aceita gate local (item com `/`) no `pre-commit`; no `commit-msg` ele é filtrado, e o `pre-commit` roda antes de a mensagem existir. Reprodução: `[gates] commit-msg = ["commit-msg", "tools/read_gate.py"]` no `.ai/tars.toml` do seo-brain → o gate local não roda. Caso de uso: exigir `Read: <docs>` na mensagem de commit que cria tela/módulo/rota/migração (dono, 04/11). Proposta: `commit-msg` aceitar item com `/` e passar o caminho do arquivo da mensagem, como o `commit-msg` do catálogo. | aberto |
| TARS-BUG-31 | kerr-crawler (coord Kuant) | 2026-11-07 | **`tars secrets exec` e o `git-credential` só respondem numa pasta com `.ai/tars.toml`, e não procuram nas pastas acima.** Reprodução (devcontainer do kerr-crawler): `cd /workspace/.cache/x && tars secrets exec -- true` → `tars secrets: [secrets] source e' OBRIGATORIO (use automation \| owner; nao ha' fallback entre as fontes)`. O mesmo vale para o helper `!tars secrets git-credential` de `/etc/gitconfig` quando o git roda fora do repo, por exemplo um `cargo fetch` de dependência git privada (o cargo busca em `~/.cargo/git`): `fatal: could not read Username`. A mensagem não diz de que pasta o tars leu nem qual arquivo faltou (fere a R4). Proposta: (1) subir até o `.git` mais próximo procurando `.ai/tars.toml`; (2) uma fonte de máquina (`key_scope = "machine"` já existe) para o helper fora de repo; (3) a mensagem nomear a pasta e o arquivo procurados. Contorno local, temporário (dívida nomeada): `kerr-crawler/tools/coord/kuant-fetch.sh` roda o exec na raiz do repo e passa o token por `GIT_CONFIG_*` só no ambiente do processo. | aberto |
| TARS-BUG-1 | segtools | 2026-10-11 | `node tools/framework/tars-doctrines.mjs` acusa PHANTOM em `fail/erro-nao-se-engole`: a prova escreve o fixture em `/tmp`, mas o gate lê os arquivos **staged** — então a prova nunca dispara e a doutrina passa por PHANTOM | a-confirmar (prova não exercita o gate; fatia irmã) |
| TARS-BUG-2 | Endurance (coord) | 2026-10-14 | `tars sync` grava hook de catálogo no `PreToolUse` do **Bash** do consumidor — o hook só deveria valer para as ferramentas que o catálogo declara. Reprodução: consumidor novo + `tars sync` → `hooks.jsonc` do consumidor lista o hook em `PreToolUse:Bash` | fixed = END-SYNC-1 (dev.26) |
| TARS-BUG-3 | Endurance (coord) | 2026-10-14 | `tars sync` **não remove** do consumidor um guard que saiu de `.ai/base` (só acrescenta) — o consumidor fica com guard fantasma que o catálogo não tem mais | fixed = END-SYNC-2 (dev.19) |
| TARS-BUG-4 | Endurance (coord) | 2026-10-14 | `.githooks/` só é gerado quando a pasta **já existe** no consumidor, e o `tars init` **não avisa** — consumidor novo fica sem hook de commit/push silenciosamente | fixed = END-SYNC-3 (dev.19) |
| TARS-BUG-6 | seo-brain (coord) | 2026-10-14 | `tars self-update` para a dev.26 troca o binário e termina com "binário trocado, mas o sync --upgrade falhou — rode-o e confira"; o `sync --upgrade` manual em seguida passa ("nada mudou, 28 itens"). Erro interno não guardado | não reproduz na dev.27 (seo-brain, 14/10: sync "nada mudou, 28 itens"); causa não confirmada — a mensagem genérica do self-update segue escondendo o motivo (R4) |
| TARS-BUG-5 | Endurance (coord) | 2026-10-14 | `tars identity` **não existe** — subcomando necessário para a v0.1.0 do Endurance; `tars --help` não lista nada equivalente | fixed = END-CLI-1 (dev.19) |
| TARS-BUG-7 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `lint-swallow` cobre só JS/TS/Python: não julga Rust nem shell, e erro engolido em shell (`grep \|\| true` num `git commit`) escondeu reprovação de gate no Kerr. Reprodução: `git commit ... \| grep -E erro \|\| true` passa no gate. |
| TARS-BUG-8 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `sessionstart-context-digest` traz texto fixo do segtools (skills, cache sops, `task check`, linhas 17–22) em todo consumidor. Reprodução: abrir sessão no Kerr; precisa ser configurável por projeto. |
| TARS-BUG-9 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `principles`/`ambiente` não chegam ao boot do consumidor: o README diz que o adaptador os põe no topo do arquivo de boot gerado, mas `tars sync` não gera nem atualiza `AGENTS.md`/`CLAUDE.md`; `docs/adocao.md` não cita o passo. Reprodução: `tars sync` no Kerr com `rules` declaradas; o boot não muda. |
| TARS-BUG-10 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `fail-closed` depende de `node_modules/vitest` e reprova todo commit em consumidor sem Node/vitest; contraria "binário único" (`colocacao-de-arquivo` §5). A confirmar por execução. |
| TARS-BUG-11 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  Ponta `PreToolUse` de `no-add-all`, `daneel-acoes` e `prod-guard`: a ficha diz registrar no harness, mas o `settings.json` é gerado e não editável; falta documentar como o consumidor liga. A confirmar. |
| TARS-BUG-12 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `stop-unfinished-work` declarado em `guards` não vai ao `Stop`: o CHANGELOG diz que o projeto mantém, e `settings.json` é gerado. `tars adopt` não acusa. Reprodução: `tars sync` com o guard declarado; sem hook `Stop`. |
| TARS-BUG-13 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `tars identity verify` falha em consumidor que assina pelo devcontainer sem `[identity]`, e `docs/adocao.md` trata o passo como obrigatório para repo onde a automação comita; nenhum consumidor conhecido declara o bloco. Definir o caminho. |
| TARS-BUG-14 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  Com `TARS_HOME` apontando para checkout antigo, o binário dev.28 reporta `--version` do checkout (dev.7) e `check` acusa itens falsos; `docs/adocao.md` diz que o binário dispensa `TARS_HOME`. Reprodução: `TARS_HOME=<checkout dev.7> tars --version`. |
| TARS-BUG-15 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `docs/adocao.md` usa `V=0.0.1-dev.19` no exemplo de instalação, e o guia não cobre devcontainer compartilhado sem `tars`. |
| TARS-BUG-16 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `no-add-all` em `[gates].pre-commit` quebra o commit: "nao sei executar .ai/base/gates/no-add-all (esperado pasta com gate.mjs...)". A pasta traz `no-add-all.mjs`/`.sh`; `tars sync` e `check` aceitam. Reprodução: declarar o gate e commitar. |
| TARS-BUG-17 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `governance/licoes-plataforma.md` linha 12 cita cabeçalho de chave privada e o `gitleaks` do catálogo reprova o commit de quem adota. Reprodução: declarar a governança, `tars sync`, commitar. |
| TARS-BUG-18 | Kerr (dono) | 2026-11-01 | **fixed (lote dev.29): doutrina e aviso no check**  Doutrina nova: dado perene do projeto mora em `data/`, separado por finalidade (`runtime/`, `dev/`, `poc/`, `bench/`); `var/` não é convenção e `.cache/` segue o único descartável. Falta escrever a doutrina, um gate/`tars doctor` que verifique e replicar nos consumidores (morse, brand, kipp e kerr usavam `var/`; segtools usa `/var/worker-runs/`). Referência: migração do Kerr em 01/11. |
| TARS-BUG-19 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `tars identity provision` não lê o token de `[secrets]`: `botDeCofre` roda `op read` só com `process.env` (`tars-identity.mjs:156,268,300`), sem `envDoCofre`; `tars secrets token set` não o alcança e, em devcontainer sem conta no `op`, falha com "o cofre nao devolveu a chave". Reprodução: base Endurance dev.5, `[identity]` declarado, `tars identity provision`. |
| TARS-BUG-24 | Kerr (dono) | 2026-11-01 | **fixed (lote dev.29)**  Regeneração automática após o único passo do dono (`tars secrets token set`): `refresh` tem de funcionar no binário sem TTY (BUG-23); a chave de assinatura tem de sair do cache para `key_file` sem `provision` por TTY, normalizando CRLF (ex.: `identity sign-setup --from-cache`, decisão do dono, 01/11: o token semeado pelo dono é o aval; revisar a regra "automação nunca se auto-provisiona"). `sign-setup` escreve no escopo global do container, com nome, e-mail, `allowed_signers` e helper de git. |
| TARS-BUG-25 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.30, #53)** dev.29: `tars catalog` lista `gates/prod-guard`, `daneel-acoes` e `no-add-all` como **pendente** com eles declarados em `[tars].agent_gates`, copiados para `.ai/base/gates/`, no lock e ligados no `PreToolUse` do `settings.json`. O catalog sai 1 para sempre, e o "terminou quando" de `docs/avaliar-catalogo.md` não fecha. Reprodução: declarar `agent_gates = ["prod-guard", "daneel-acoes", "no-add-all"]`, `tars sync`, `tars catalog`. Esperado: adotado. |
| TARS-BUG-26 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.30, #54)** dev.29: o `lint-swallow` do catálogo reprova o `fail-closed` do próprio catálogo (`.ai/base/gates/fail-closed/gate.mjs:61`, `catch` vazio). Consumidor que adota os dois não consegue comitar o `.ai/base` sem linha de base. Reprodução: `pre-commit = ["lint-swallow", "fail-closed"]`, `tars sync`, commit do `.ai/base`. Contorno: `tars gates baseline`. |
| TARS-BUG-27 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.30, #54)** dev.29: o gate `fail-closed` quebra no binário em todo commit: `SyntaxError: Export named 'stripTypeScriptTypes' not found in module 'node:module'` (Bun v1.4.2 embutido). Reprovação permanente, não julgamento. Reprodução: `pre-commit = ["fail-closed"]`, `tars hooks pre-commit` com algo staged. Contorno: o Kerr recusou o gate. |
| TARS-BUG-28 | Homelab (via Endurance) | 2026-11-02 | fixed: `tars secrets exec -- uv run python converge.py nuc --recipe repos_mirror --dry` em pipe imprimiu o corpo de uma chave com `\\n` literais. A mascara so' casava o valor literal; agora cobre as formas derivadas, e `--only A,B` limita o que o filho recebe. Quem imprimiu no Homelab segue a confirmar; a chave exposta deve ser rotacionada pelo dono. |
| TEST-FLAKY-1 | coord Tars | 2026-11-01 | a confirmar: `tars-embedded.test.mjs` (doctor do binario, `PHANTOM 0`) falhou 2 vezes em ~7 rodadas da suite inteira e nao reproduziu em 4 rodadas nem em 8 doctor sob carga. Hipotese nao testada: prova da doutrina estoura os 20 s do `spawnSync` com a suite em paralelo. O teste agora imprime a saida do doctor na falha. |
| E8-STACK-DEVCONTAINER | Endurance, Kerr, SEO Brain e Homelab | 2026-11-02 | pedido de funcionalidade: o `tars doctor` confere marcadores de stack contra as features do `.devcontainer/devcontainer.json` (D9 do Endurance). Exemplos: `Cargo.toml` sem a feature `rust`; `rust-toolchain.toml` sem `clippy` com gate de clippy; `package.json` com `playwright` sem a feature ou com versao diferente do lock; `pyproject.toml` sem `python-uv`; `composer.json` sem `php`. Proposta: tabela marcador -> feature no catalogo, com parametro por projeto. Aguarda ordem do dono. |
| H1-SSH-AGENT | Homelab (via Endurance) | 2026-11-02 | pedido de funcionalidade: `tars identity ssh-agent` (ou extensao do `sign-setup --from-cache`) sobe ou reaproveita um ssh-agent com a chave de `[identity].key_cache` e um `known_hosts` declarado, para pyinfra/ssh/rsync alcancarem NUC, lin e ryzentu de dentro do devcontainer. Hoje o homelab usa `op read | ssh-add -` num agente descartavel (`converge-host.sh`) e da' "Host key verification failed". Requisito do Homelab (02/11): a chave de acesso SSH e' separada da de assinatura (`op://secrets/daneel-bot/homelab/auth-ssh-key-private`), com campo proprio em `[identity]`. Aguarda ordem do dono. |
| TARS-BUG-23 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `tars secrets refresh` falha sempre no binário compilado dev.28 e passa pelo motor Node da mesma tag com o mesmo template: indício de que `INJECT` (`tars-secrets.mjs:51`) não resolve no binário. A mensagem culpa o 1Password. Reprodução: binário Release, `[secrets]` válido, `op run` ok; `refresh` falha. Também: `op run` com o item por nome falhou 3/4 ("could not find item"), e por ID passou 6/6. |
| TARS-BUG-22 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `tars secrets token set` e `refresh` escondem o stderr do `op`: "op whoami recusou" era `mkdir ~/.config/op: permission denied`, e "referencia nao resolveu" não nomeia a referência nem o erro. Devem repassar a causa, sem valor. |
| TARS-BUG-21 | Kerr (dono) | 2026-11-01 | **fixed (lote dev.29)**  `block-secret-dump` barra comando que cita template de referências (`*.tpl`), que por contrato só tem `op://`, sem valor: deve distinguir template de refs de arquivo de segredo. |
| TARS-BUG-20 | Kerr (coord) | 2026-11-01 | **fixed (lote dev.29)**  `tars identity provision` grava a chave com CRLF (como vem do cofre) e sem normalizar: `ssh-keygen -y` falha com `error in libcrypto` e `sign-setup` aponta para `.pub` inexistente, sem falhar alto. `verify` acusa só "cofre indisponivel?". Sem campo no `sign-setup` para `user.name`/`user.email`, e ele escreve `user.signingkey` no `.git/config`, que o bind compartilha com host e outros containers. |
