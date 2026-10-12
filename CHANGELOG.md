# CHANGELOG — Tars

Toda versao `0.0.1-dev.N` traz as 4 subsecoes abaixo (formato parseavel por `tars
upgrade-notes`). O consumidor roda `tars upgrade-notes` depois de um `tars sync` que subiu a
versao: o comando imprime SO' as notas entre a versao do `.ai/tars.lock` e a atual.

## 0.0.1-dev.15

### O que mudou
- **O gerador do indice de memoria nunca sobrescreve um indice CHEIO por um `(vazio)`
  calado** (bug A4). Quando a fonte vinha vazia ou ilegivel, `ai-memory.mjs index`
  gravava o `INDEX.md`/`LEDGER-INDEX.md` com `(vazio)` e as linhas ja' commitadas sumiam
  (caso real: 314 linhas, 530455d8). Agora `assertNotClobberingEmpty` RECUSA apagar N
  linhas por um indice vazio, nomeia o arquivo e a contagem, e so' esvazia com `--force`.
- **Nova doutrina `operacao/nada-em-prod-sem-ordem` (B1.4)**: nada em producao
  (`docker compose up/down`, `systemctl restart`, `kubectl apply`, `helm upgrade`, `git
  push --force`) muda sem a ORDEM DIRETA DO DONO. O gate `.ai/gates/prod-guard` barra a
  MUDANCA no `PreToolUse`; a ordem viaja na linha (`TARS_PROD_ORDER=<data/motivo> <cmd>`).
  Leitura (`ps`, `status`, `get`, `curl`) passa livre. Regra tambem no guard de todo
  consumidor (`.ai/guards/block-destructive-commands.sh`) e na regra de boot
  (`.ai/rules/principles.md`).
- **O aceite do worker e' a PROVA reproduzida pelo coordenador** (B3.3): o modelo de prompt
  (`.ai/skills/agent-coordination/worker-prompt-vivo.md`) passa a exigir o teste
  comportamental — nao o atalho `--check` nem assercao de string — e a regra "doc oficial
  citada antes de criar/ajustar receita".

### Por quê
A4: um indice apagado calado custa a memoria inteira do projeto (o boot perde a
operacional). B1.4: um `compose up` sem ordem derruba a stack que o dono administra e o
agente nao sabe reerguer. B3.3: "verde no `--check`" nao prova o comportamento; o aceite
so' vale com a prova que o coordenador reproduz.

### Arquivos impactados no consumidor
- `.ai/guards/block-destructive-commands.sh` e `.ai/rules/principles.md` (via `tars sync`)
  passam a carregar a regra B1.4. O gate `prod-guard` chega ao `PreToolUse` do harness.
- O gerador de indice (`ai-memory.mjs`) recusa clobber vazio: quem rodava `index` sobre uma
  fonte vazia passa a ver erro em vez de perder o indice.

### O que o consumidor faz
Rode **`tars sync`** para receber a regra de boot e o guard atualizados. Se de proposito
precisar esvaziar um indice, use `node ai-memory.mjs index --force`.
## 0.0.1-dev.14

### O que mudou
- **Identidade de automação (Daneel) entra fechada — os 3 furos da curadoria.** A branch
  `feat/daneel-agente` (skill + `tars acessos` + doutrinas) ganha o que faltava para mergear:
  - **As 4 doutrinas `daneel/*` têm gate.** `hermes-perfil-padrao` e `autoedicao-desligada`
    passam a reprovar quando a skill perde a declaração (prova que REPROVA, não `test -f` que
    sempre passa); `stop-conditions` aponta para o gate novo.
  - **`.ai/gates/daneel-acoes/`** cobra as 3 condições de parada que só existiam como prosa:
    **force-push**, **push em repo público** e **escrita no cofre** (`op item edit`, `tars
    secrets set`). `PreToolUse` que bloqueia antes do dano; override só do operador por
    `DANEEL_ALLOW=1`.
  - **`tars acessos check [--out <arquivo>]`** implementa o **drift**: regenera, testa cada
    acesso de verdade e compara com o inventário commitado — divergência sai nomeada e o exit
    vira ≠ 0. A data de geração sai da comparação (ruído).
- **`tars acessos daneel` cobre os hosts reais e o PAT por env.** Hosts por nome E IP da LAN
  (`nuc.czul.net`/10.0.0.220, hermes 10.0.0.200, pve 10.0.0.3); PAT do GitHub por
  `GH_TOKEN`/`GITHUB_TOKEN` (nunca arquivo/URL); SSH pelo helper da Daneel (`DANEEL_SSH` ->
  `nuc.sh`/`daneel-ssh.sh`).
- **Regra nova do dono (11/10): bug do Tars reportado vira release.** Entra em
  `.ai/rules/principles.md` (boot de todo consumidor), no `README.md` (ponteiro) e no
  `BACKLOG.md` novo (seção `## Bugs reportados por consumidores` com repo · data · reprodução).
- **Prompt vivo de worker:** `BLOQUEIO: sem acesso` só vale com o caminho da **Daneel**
  exercitado (comando + saída) — o acesso de automação não é do worker, é do bot.

### Por que
A branch da Daneel declarava as doutrinas `daneel/*` com `gate = "nenhum"` e uma prova `test -f`
que **sempre passa** (nunca reprovava nada) — a dívida estava nomeada no próprio
`.ai/doctrines.toml` ("Fechar quando o guard ganhar as tres regras") sem ninguém escrever o
guard. O inventário era uma foto que envelhecia calada: gerava e ordenava para o diff, mas nunca
comparava. E o "não tenho acesso" de worker virava bloqueio sem teste, contra a ordem do dono
(o acesso de automação é do bot, não do humano atrás do agente).

### Arquivos impactados no consumidor
- `.ai/rules/principles.md` (regra nova) · `.ai/skills/agent-coordination/worker-prompt-vivo.md`
  (regra nova) · as doutrinas e a skill chegadas pelo `tars sync`.
- Novos no catálogo: `.ai/gates/daneel-acoes/`, `BACKLOG.md`.

### O que o consumidor faz
Rodar **`tars sync`** e, se declarou a skill `daneel`, registrar o gate `daneel-acoes` no
`PreToolUse`/matcher `Bash` do harness (o `tars sync` gera o wiring; confira com `tars doctor` —
as 4 doutrinas `daneel/*` devem sair `OK`, não `SEM GATE`). Quem usa `tars acessos daneel` ganha
o `check` de drift e os hosts/PAT novos sem mudar nada.

## 0.0.1-dev.13

### O que mudou
- **Nova governanca `novo-repo`**: o **método único de nascer um repo/app** do ecossistema,
  em 8 passos — criar no GitHub (org certa, privado), README com papel e **origem do nome**,
  `BACKLOG.md` no commit inicial (decisões com fonte, fila com aceite, armadilhas, em
  aberto), `tars init` + `tars sync`, versão `0.0.1-dev.1` + CHANGELOG, ADRs, registro no
  README do `huldlabs` e repo irmão em `~/projects`.
- **Modelos em `templates/`**: `README.tpl.md` e `BACKLOG.tpl.md` (o esqueleto a preencher),
  com `templates/README.md` apontando o molde real (`HuldLabs/morse` `e1acf06`).
- A doutrina declara a **prova** (o `tars doctor` cobra por repo que a executou: README com a
  origem do nome, BACKLOG com as 4 seções, `.ai/tars.toml`, `CHANGELOG` em `0.0.1-dev.1`,
  `docs/adr/*.md`).

### Por quê
Decisões tomadas em conversa se perdem quando o repo nasce só com um README e a próxima
sessão recomeça do zero (`app-novo-nasce-com-backlog`, dono 10/10). O método congela o que
foi decidido no commit inicial, com a fonte de cada decisão, e faz o repo nascer consumidor
do Tars. Primeiro uso: o SELD (`HuldLabs/seld`, 11/10/2026).

### Arquivos impactados no consumidor
- Nenhum arquivo é reescrito no consumidor por esta versão: `governance/novo-repo` só chega a
  quem **declarar** `novo-repo` na lista `governance` do `.ai/tars.toml`. Quem declarar recebe
  `.ai/base/governance/novo-repo.md` no próximo `tars sync`.

### O que o consumidor faz
Nada é obrigatório. Para ter o método ao lado dos outros: adicione `"novo-repo"` à lista
`governance` do `.ai/tars.toml` e rode **`tars sync`**. Os modelos em `templates/` moram no
catálogo (o consumidor os consulta em `$TARS_HOME/templates/`) e não são copiados.

## 0.0.1-dev.12

### O que mudou
- **Os hooks gerados pelo `tars sync` nascem executáveis também no INDICE do git.** O git
  decide se roda um hook pelo modo do arquivo no indice, nao pelo disco. Um consumidor que
  tinha `.githooks/prepare-commit-msg` versionado como `100644` continuava com o hook
  IGNORADO ("was ignored because it's not set as executable") mesmo depois de o sync
  reescrever o conteudo: o `checkout`/clone restaurava o `100644`.
- O gerador agora conserta as duas testemunhas: `chmod 0o755` no disco e
  `git update-index --chmod=+x` no indice, quando o hook ja' esta' rastreado e o modo esta'
  errado. Hook ainda nao rastreado, ou projeto fora de um repo git, ficam como estavam
  (o disco basta) — sem falha.
- A idempotencia deixou de ser cega ao modo: conteudo identico mas bit de execucao errado
  agora e' corrigido em vez de pulado.

### Por quê
O modo do INDICE e' o que o git consulta para executar o hook; alinhar so' o disco deixava o
consumidor com o gate morto calado — exatamente o que a R4 proibe.

### Arquivos impactados no consumidor
- `.githooks/pre-commit`, `.githooks/commit-msg`, `.githooks/prepare-commit-msg` (modo
  corrigido no disco e no indice; conteudo inalterado).

### O que o consumidor faz
Rodar **`tars sync`** num checkout com `.githooks/` rastreado: os hooks passam a `100755` no
indice. Confirme com `git ls-files -s .githooks` (deve mostrar `100755` nas tres linhas).

## 0.0.1-dev.11

### O que mudou
- **O item `contracts/binary-manifest/v1` entra no catalogo** (ADR-0002 D3, D7, D8.3): o
  **JSON Schema draft 2020-12** do manifesto que um binario publica em `GET /manifest` e
  `<bin> manifest --json` — contrato, capacidades, tools de MCP, menu, rotas, configuracoes,
  permissoes, eventos/hooks e `tablePrefix`. A tela e **modelo de pagina** (`layout` +
  `blocks[].kind`), nunca HTML: o schema recusa `html`/`template`. Vem com um
  **teste de conformidade** (`conformance.mjs`, sem dependencia) e o exemplo minimo do Kipp.
- **A area `contracts` no `tars sync`**: o consumidor declara `contracts = ["binary-manifest/v1"]`
  no `.ai/tars.toml` e o item chega em `.ai/base/contracts/binary-manifest/v1`, com sha256 no
  `.ai/tars.lock`.
- **A conformidade de prefixo (D7)** como funcao reutilizavel (`prefix-conformance.mjs`): dado o
  cliente e o prefixo, lista os objetos do schema pelo `pg_catalog` (tabela, indice, sequencia,
  view, matview, tipo, constraint) e reprova qualquer um sem o prefixo.

### Por quê
O ADR-0002 diz que o schema do manifesto e o teste de conformidade moram no catalogo — terreno
neutro que o binario e o hospedeiro ja consomem: nenhum dos dois depende do outro. Faltava o item.

### Arquivos impactados no consumidor
- `.ai/base/contracts/binary-manifest/v1/**` (novo), depois de declarar `contracts` no `.ai/tars.toml`.
- `.ai/tars.lock` (entra a chave `contracts/binary-manifest/v1`).

### O que o consumidor faz
Rodar **`tars sync`** com `contracts = ["binary-manifest/v1"]` no `.ai/tars.toml`. O teste de
conformidade roda na suite do Tars; nada muda para quem nao declara a area.

## 0.0.1-dev.10

### O que mudou
- **O hook `prepare-commit-msg` gerado pelo `tars sync` volta a rodar no consumidor.** Ele
  procurava o motor em `$root/tools/framework/tars.mjs` — a raiz do CONSUMIDOR, que nunca tem
  esse arquivo (o sync copia só `.githooks/` e `.ai/`). Em qualquer consumidor o hook saía com
  **exit 1 e quebrava TODO commit**; no próprio Tars funcionava por acidente (lá o fonte existe).
- Agora o hook resolve o motor como o `.githooks/pre-commit` já fazia:
  `${TARS_HOME:-/projects/tars}` — (1) `$TARS_HOME/dist/tars`, (2) `tars` no PATH,
  (3) `$TARS_HOME/tools/framework/tars.mjs`, (4) `node "$root/tools/framework/tars.mjs"`.
  **Sem fallback calado**: motor ausente sai != 0 nomeando os quatro caminhos procurados.
- `tars hooks` deixou de exigir `TARS_PROJECT`: sem argumento, o cwd do hook **é** o projeto
  quando tem `.ai/tars.toml` (o hook roda com o cwd na raiz do consumidor).

### Por quê
O consumidor recebe do catálogo só o que o `sync` copia. Supor o motor dentro dele contradiz
o contrato: o motor mora no catálogo e o `TARS_HOME` é a variável de contrato que o aponta.

### Arquivos impactados no consumidor
- `.githooks/prepare-commit-msg` (regravado), `.githooks/pre-commit` e `.githooks/commit-msg`
  (mesmo corpo de geração: `$TARS_HOME` com default e a fonte do catálogo).

### O que o consumidor faz
Rodar **`tars sync`** de novo (e `tars upgrade-notes`, se quiser as notas): os hooks são
regravados e os commits voltam a funcionar. Sem a variável `TARS_HOME` valem os defaults, mas
aponte `TARS_HOME` para o catálogo quando ele não estiver em `/projects/tars`.

## 0.0.1-dev.9

### O que mudou
- **`tars secrets`** (`refresh | exec | check`): o cofre do PROJETO deixa de ser reinvenção de
  cada consumidor. O módulo novo (`tars-secrets.mjs`) porta a lógica do `secrets.mjs` do
  segtools e a parametriza pela tabela `[secrets]` do `.ai/tars.toml` — o Tars é o catálogo,
  quem declara é o consumidor.
- **Três camadas com merge campo a campo**: (1) **embutido** no Tars — só estrutura, nomes de
  campo e caminhos **locais** (`~/.config/tars/<projeto>/`); **nenhuma ref `op://` e nenhuma
  identidade** no catálogo. (2) **perfil do usuário**, fora do repo
  (`~/.config/tars/profile.toml`; Windows `%APPDATA%\tars\profile.toml`) — as refs pessoais
  (`age_key_ref`, `bot`, `allowed_signers`). (3) **projeto** (`.ai/tars.toml [secrets]`), que
  sobrescreve o perfil campo a campo. Ref que nenhuma camada declara **falha alta nomeando o
  campo**. O campo da chave age chama-se `age_key_ref` em toda camada (o antigo nome interno
  `cofre` saiu: o mesmo nome nos tres lugares).
- **Ref da chave age por PROJETO (o padrão)**: o perfil declara `age_key_ref_pattern` com o
  placeholder único `{projeto}` (resolvido pelo nome do diretório), e não uma ref fixa por
  máquina — assim cada projeto tem a sua chave. Padrão sem `{projeto}` **falha alto**. Um
  `age_key_ref` pronto (perfil ou projeto) vence o padrão; `bot`/`allowed_signers` são por
  PESSOA e seguem ref pronta. `check` mostra a origem `perfil(padrao)` ou `projeto`.
- `tars secrets check` ganha a linha **`refs`**: a **camada de origem** de cada ref
  (`embutido | perfil | projeto`), nunca o valor.
- `source="automation"` força **`OP_BIOMETRIC_UNLOCK_ENABLED=false`** no env do spawn do `op`
  (não há dono nem leitor biométrico nesse caminho); com `owner` nada é forçado.
- `key_scope` (`project` | `machine`) e `source` (`automation` | `owner`) **obrigatórios**, sem
  fallback entre fontes. `project` exige a ref `age_key_ref`; `machine` proíbe `age_key_ref` e `sops_config`
  versionado — cada violação grita com a lista de valores válidos.
- **Um wrapper único para `op`/`sops`**: toda ref é conferida como `^op://` antes do spawn
  (inválida = erro que **não** ecoa o valor) e o stderr volta **redigido** (valor de segredo
  conhecido vira `***`) — nunca `>/dev/null`.
- `check` reprova o **template** com `op://` fora de `{{ }}` (comentário incluso: o `op run`
  resolve qualquer um) e o template que cita a ref da **chave age** — a chave vem só do manifesto.
- `exec` roda por **argv, sem shell**: `;`/`|`/`$()` são dado, não sintaxe; o filho não herda
  `OP_*`/`SOPS_AGE_KEY` e recebe só `SOPS_AGE_KEY_FILE`.
- **`.ai/governance/segredos-e-identidade.md`** (novo, distribuído pelo `tars sync`): a seção
  **segredos e identidade** com 11 lições, cada uma com a regra, o incidente que a produziu e o
  gate — o dia 08/10 (o `op` ecoando a chave age; a `{{ op://… }}` inerte no `op run`) vira
  régua, não anedota.

**Correções da revisão (S1-fix), ainda dentro de dev.9:**
- `key_scope="project"` **relê a chave a cada `refresh`** (`op read --out-file` para um temporário
  0600 ao lado da chave, promovido por rename só se vier inteiro). O `existsSync` antecipado vale
  só para `machine`: com a chave do cofre, ele manteria o cache cifrado para um recipient que
  já não existe quando a chave roda — falha longe da causa.
- O template passa a ser resolvido por **`op run --env-file=<template>`** com o helper
  `tars-secrets-inject.mjs` (porte do segtools), e não por `op inject`: valor **multilinha**
  (chave de assinatura) sobrevive ao cache, que é JSON — nos dois formatos do `inject` ele
  quebra, um com JSON inválido e o outro truncado em silêncio.
- **`reapResiduo`** (porte do segtools): o `refresh` apaga o texto claro que um refresh **morto**
  deixou em `os.tmpdir()` (o `finally` não roda em `kill -9`/OOM). A decisão é por **PID** — dir
  de processo vivo é preservado; nome sem PID (esquema antigo) não é tocado.
- `check` ganha a linha **`token`** (`source="automation"`): existe, não vazio e modo `0400`/`0600`
  (ACL no win32) — lê o arquivo só para saber se está vazio, nunca o conteúdo.
- A linha **`ambiente`** do `check` acusa só o que aponta para a fonte
  (`OP_SERVICE_ACCOUNT_TOKEN`, `OP_CONNECT_TOKEN`, `OP_CONNECT_HOST`, `OP_SESSION_*`,
  `SOPS_AGE_KEY`); um `OP_*` qualquer do app era ruído.
- **`tars secrets rotate`** (S2): a rotação da chave age. É **do dono** — `source="automation"`
  recusa alto, e `owner` ainda exige ator humano **e** TTY. `key_scope="machine"` apaga a chave
  e o cache locais e refaz; `key_scope="project"` percorre 8 passos **retomáveis** por
  `<dir>/rotate.state` (o estado guarda o passo que ainda falta rodar): plano com `[s/N]` →
  `age-keygen` num `.rotate` ao lado da chave → identidade NOVA no item do cofre pelo
  **template** (`op item get`/`item edit --template`, **nunca por argv**) → confere lendo de
  volta do cofre (recipient tem de ser o novo, senão para **sem tocar nada local**) → recifra
  os versionados (troca o recipient no `.sops.yaml` e `sops updatekeys` em cada arquivo de
  `sops_files`; sem a lista, **falha alto**) → só então troca a chave local e refaz o cache →
  verifica (check ok, cada versionado decifra **só** com a nova, nenhum cita a velha) → fim
  (apaga estado e temporários, imprime o que o dono commita). A chave velha só sai no passo 6.
- **`tars secrets token set`** (S2): lê o token NOVO do **stdin oculto** (sem eco, nunca argv),
  grava `<token_file>.novo` 0600 e só o promove se `op whoami` o aceitar **sozinho** (sem sessão
  do app, biometria `false`) — recusou, o antigo continua e o `.novo` some. A mensagem final manda
  revogar o antigo no 1Password **só depois** de rodar isto em todas as máquinas de automação.
- **`token_expires`** (`AAAA-MM-DD`, perfil ou projeto, mesmas camadas): a linha `token` do
  `check` **falha** quando vencido, **avisa** a menos de 14 dias e diz `sem data` quando o campo
  não existe. Data malformada grita.

**Correções da revisão (S2-fix), ainda dentro de dev.9:**
- `rotate` (escopo `project`) passa a ser **retomável POR PASSO** — morrer logo **depois da ação**
  de qualquer passo (2..7) não deixa mais a rotação presa. O caso que travava era o **passo 6**:
  morte entre o `rename` da chave e o fim do `refresh` deixava o `.rotate` já renomeado, e a
  retomada tentava renomear de novo (**`renameSync` ENOENT**). Agora, sem o `.rotate`, ele confere
  que a chave local **é** a nova e segue para o `refresh`.
- Cada passo pergunta antes de refazer: o `.rotate` que já existe é **reaproveitado** em vez de
  gerar uma chave nova (gerar outra depois de o cofre já citar a primeira não teria volta); o
  cofre que **já tem** a identidade nova não é reescrito (passo 3, e a leitura de volta virou um
  helper que também serve ao passo 4); o versionado **já recifrado** é pulado no passo 5, o que
  deixa um `updatekeys` abortado no meio do lote retomar só pelo que falta.
- **Escrita no cofre atrás de uma interface** (`ESTRATEGIAS_COFRE`, campo `age_key_write`),
  **nunca por argv**: `template` (**default**, o de hoje — JSON do item inteiro com o campo
  trocado), `template_parcial` (só o campo alterado volta ao cofre) e `documento`
  (`op document edit <doc> <arquivo>`, com a ref apontando para um documento). O default só muda
  quando a prova real com o cofre decidir.
- Testes: **morte simulada depois da ação de cada passo 2..7** (`hooks.aposPasso`) e a retomada
  tem de terminar no **mesmo estado final** do caminho feliz — mais as três estratégias com stub.

**Manipulação segura de segredos (S2b) — `tars-secrets-ops.mjs` (novo), ainda dentro de dev.9:**
- **Um parser de endereço só** (`parseEndereco`), e o **tipo** que ele decide é o que o resto do
  módulo consulta: `op://cofre/item/campo`, `file:<caminho>`, `env:<NOME>` e `cache:<NOME>`.
  Endereço malformado **não é ecoado** — o argumento pode ser o segredo no lugar errado.
- `compare <a> <b>`: **tempo constante** (`crypto.timingSafeEqual` sobre os dois lados
  preenchidos até o maior deles; o comprimento entra no veredito **depois** do compare, nunca
  como atalho antes). Imprime só `igual`/`diferente`; exit 0/1.
- `fingerprint <a>`: só **identidade pública** — `age-keygen -y` para uma chave age,
  `ssh-keygen -lf` da pública derivada para uma SSH; qualquer outra coisa recusa com
  `sem identidade publica; use compare` (não existe impressão de senha). Origem no cofre passa
  por `op read --out-file` num tmp 0600 — **nunca stdout**.
- `set <op://...>` é **do dono** (`source=owner`, TTY, ator humano): o valor vem do **stdin
  oculto**, de `--from-file <arq 600>` ou de `--from <endereco>` — **nunca por argv**. A escrita
  reusa a estratégia `age_key_write` da S2 (`template` completo por default) e o comando **relê e
  compara em memória** antes do ok.
- `copy`/`move`: leem, gravam e **confirmam com `compare`**; o `move` só apaga a origem **depois**
  da confirmação — compare falho preserva a origem, que é o único lugar onde o valor existe.
- `rm <a>` com `[s/N]` mostrando só o endereço: cofre **arquiva** (`op item delete --archive`,
  nunca apaga de vez); `file:` apaga; `env:` remove a **linha** persistente do rc/profile
  indicado (`--em <arquivo>`, mostrando `arquivo:linha`) ou `reg delete HKCU\Environment` no
  Windows, com cópia de segurança 0600 ao lado que some no fim.
- **Destino `env:` e `cache:` são RECUSADOS** em copy/move/set, cada um com a saída certa na
  mensagem: ambiente persistente (rc/profile/HKCU/runtime.env) vira segunda fonte de verdade que
  ninguém revoga, e o cache é **derivado** — o caminho é gravar no cofre e rodar `refresh`.
  Os dois valem como **origem**, e `env:` como origem de `rm` e de `scan`.
- `scan [--onde ...]`: procura segredo no ambiente do processo (`AMBIENTE_ACUSADO` + nomes do
  template), em rc/profile, em `HKCU\Environment`, no histórico de shell, nos transcripts de IA
  (`~/.claude/projects/**/*.jsonl`, sessões do opencode — **em streaming**, um `.jsonl` passa de
  100MB), no histórico do git via **`gitleaks git`** (com relatório JSON num tmp 0600: a saída
  verbosa do gitleaks imprime o segredo) e nos templates (`op://` fora do valor inteiro de
  `KEY=`, `{{ }}` em `*_REF`/`*_FILE`). Detecção = `secrets-patterns.mjs` (a MESMA lista do
  pre-commit) + os **valores do cache decifrados uma vez** e comparados em memória. Reporta só
  `arquivo:linha` (ou `local`) + o **id** do padrão; **o trecho achado nunca aparece, nem
  truncado**; exit ≠ 0 quando acha.
- `import <arquivo .env>` é **do dono**: cada `NOME=VALOR` vira **campo** do `--item
  op://cofre/item` (`partesRef` + `criar`, porque ali o campo novo **é** o trabalho), conferido
  um a um com `compare`, e imprime `NOME=op://cofre/item/NOME`. Comentário e linha de **template**
  (`op://`, `{{ }}`) ficam de fora — gravar `op://x/y/z` como valor faria do cofre um eco do
  template. A origem **não é tocada**.
- **Redação no `exec`**: fora de TTY, ou com `--redact`, a saída do filho passa por um **pipe com
  buffer rolante** do tamanho do maior valor, e todo valor do cache com ≥ 8 caracteres vira
  `***`. TTY sem `--redact` herda como sempre. O corte é sobre o **fluxo**, não sobre o pedaço:
  um valor partido entre dois `data` continua inteiro na concatenação do que o dono vê, então o
  redator só emite o que **não começa** um valor — e, quando o valor inteiro está em mãos,
  mascara e **consome** o trecho (senão o buffer ficaria preso nele, crescendo sem emitir).
- **Auditoria**: `<dir>/audit.log` JSONL **0600** com `ts`, `ator`, `comando`, endereços/nomes e
  resultado — **sem valor nem fingerprint** (um fingerprint seria um oráculo de conferência do
  segredo em cima de um arquivo que pode ir para o git por engano).
- `secrets-patterns.mjs` ganha **`findSecretsIds`** (o `id` estável, para máquina) e
  `findSecrets` passa a ser a projeção dele em rótulos: uma varredura, duas projeções — a lista
  de padrões continua sendo uma só para o hook e para o `--doctor`.

**`tars doctor` de segredos (S3), ainda dentro de dev.9:**
- O `doctor` de um projeto que declara `[secrets]` **ou** `[identity]` no `.ai/tars.toml` passa a
  incluir: (1) **tudo do `tars secrets check`** (chave, token, template, recipient, decifra,
  ambiente, refs com a camada de origem, vencimento) — o julgamento continua em **um** lugar
  (R3), o `doctor` só anexa; (2) a **idade do cache**: acima de `cache_max_dias` (default 30, novo
  campo da tabela) é **aviso** "rode `tars secrets refresh`", não falha; (3) o **transporte por
  ator** (lição 7): ator agente com remote `ssh://`/`git@`, ou `SSH_AUTH_SOCK` apontando para o
  agente do 1Password, ou `oauth_token:` em texto no `~/.config/gh/hosts.yml` (WSL/Linux sem
  keyring — só a **presença** da chave é lida, nunca o valor) **reprova**; (4) o **push por ator**
  (lição 9): ator agente com commit local não empurrado (`git rev-list @{u}..HEAD` > 0) ou **sem
  upstream** reprova; ator humano **não** é acusado; (5) um **scan rápido** (só `env` e rc —
  transcripts e git continuam no `scan` explícito). A lição 8 (identidade do bot) fica para dev.10.
- Cada linha reprovada vira uma FALHA nomeada (`segredos/<nome>`) na mesma lista de `faltando` das
  doutrinas — o exit code e o `--json` do `doctor` não precisaram de um caminho novo. Config
  inválida (ex.: `source` ausente com `[secrets]` declarado) vira **linha** de falha, não exceção:
  o `doctor` é onde o erro precisa aparecer.
- `cache_max_dias` entra na tabela `CAMPOS` (merge campo a campo, como `token_expires`).
- Testes: `tars-doctor-secrets.test.mjs` (novo) — um caso **verde** e um **vermelho** por item.

> **Antes do release de dev.9**: o dev.9 não fecha sem esta fatia (S3).

### Daneel — identidade de automação como skill
- **`.ai/skills/daneel/SKILL.md`** (novo): a persona e o contrato do **ator de automação** do
  ecossistema. Fonte única — runtimes (Hermes Agent e outros) **consomem** a skill, nunca
  redefinem a persona. Traz identidade (ela/dela, voz curta, assinatura), missão e o que NUNCA
  faz, a ficha verificável `ação → permitida | proibida | exige aprovação`, condições de parada
  e como "vestir" a Daneel (git identity, leitura de credencial sem imprimir, POPs).
- **`tars acessos daneel [--out <arquivo.md>]`** (novo, `tars-acessos.mjs`): **gera** o inventário
  de acessos — GitHub (API: orgs/repos com pull/push/admin, convites pendentes), 1Password (cofres
  e **nomes** de item/campo, nunca valor), hosts SSH (entra? sudo?) e versões de ferramenta.
  **Read-only** e **barrado por padrão de segredo** (reusa `secrets-patterns.mjs`); falta de
  credencial vira `(indisponivel)`, nunca inventário mentiroso. A skill **aponta** para o
  inventário gerado — nunca lista acesso à mão (mata o drift por construção).

### Por que
Cada projeto consumidor vinha reinventando o próprio cofre (caminho fixo, variável de ambiente,
token no `.env`), e as variantes divergiam nas partes que importam: onde mora a chave, quem pode
abrir o cofre, e o que o filho herda do ambiente. Regra que existe em N lugares não é regra —
é onde o furo mora.

### Arquivos impactados no consumidor
- `tools/framework/tars-secrets.mjs` (novo) e `tars.mjs` (despacho fino do subcomando).
- Nada é criado no consumidor que não declare `[secrets]` no `.ai/tars.toml`: sem a tabela, o
  `lerConfig` recebe `{}` e o comando falha alto nomeando o `source` obrigatório.

### O que o consumidor faz
Põe o `age_key_ref_pattern` no perfil (`~/.config/tars/profile.toml`) uma vez por máquina, declara
`[secrets]` no `.ai/tars.toml` (`source` obrigatório; `key_scope="project"`), roda
`tars secrets refresh` uma vez para gravar a chave e o cache, e usa
`tars secrets exec -- <cmd>` como entrypoint dos processos que precisam dos segredos.
`tars secrets check` julga o estado sem abrir o cofre.

## 0.0.1-dev.8

### O que mudou
- **Paridade Windows** (4ede873): a chave do lock e a geracao dos `.githooks/` normalizam o
  separador. No win32 o `readdirSync` devolve `gates\commit-msg` e um sync **correto** era
  reprovado (e o hook nascia com caminho quebrado).
- **Gate condicional por ator** (7b546a2): `[gates.params.<gate>].when` aceita
  `when = { actor = "agent" }` — o gate roda so' para quem escreve. Predicado desconhecido
  GRITA em vez de devolver `true`/`false`: `when` com nome errado sumiria com o gate, calado.
- `commit-msg` aceita **`lesson = "agent"`** (7b546a2): `Lesson:`/`Incident:` passa a ser
  cobrado so' do **agente**; commit de humano nao paga a licao. Emoji, tipo, sujeito de 72
  chars e a prova de teste vermelho do `fix` continuam valendo para os dois.
- `tars sync` declara **`TARS_ACTOR=agent`** no `env` do `.claude/settings.json` (59f0955):
  o harness diz quem escreve. Um `[env]` do consumidor **nao** rebaixa o ator.
- `block-destructive-commands.sh` **barra `TARS_ACTOR=human`** no comando (ec3c8f8) — o
  agente nao se declara humano para isentar o proprio commit da licao.
- `tars doctor` julga o hook "vivo" pelo **`hookVivo`** (o mesmo do `tars-sync.mjs`):
  bit de execucao no POSIX, `#!` no win32 — onde o NTFS nao guarda bit e o doctor acusava
  `HOOKS MORTOS` com o hook no lugar certo (paridade Windows com o `tars sync`).
- **AVISO — o dogfood do Tars nao acha mais o binario sozinho.** O hook gerado perdeu o
  `$root/dist/tars` (o caminho do clone deixou de ser adivinhado); o hook passa a depender
  do **`TARS_HOME`**, de um **`tars` no `PATH`** ou do **`node`** com o modulo do catalogo.
  Clone do Tars que use o proprio hook: exporte `TARS_HOME` (ou ponha `tars` no PATH) antes
  de commitar, senao o hook nao roda.

### Por que
- Gate que reprova o certo (Windows) ensina a desligar o gate; gate que some calado e' pior
  que gate nenhum.
- A licao obrigatoria existe para forcar o AGENTE a registrar o que aprendeu — quem escreve a
  mao ja' pensa antes de commitar, e cobrar o mesmo bloco do humano so' ensina a inventar
  licao. Sem ator isso viraria politica espalhada dentro de cada gate; com `when`, e' dado.
- Isencao por ator so' vale se o ator nao puder se autodeclarar: o mesmo buraco que o
  `No-Release`/`--no-verify` abrem, fechado na borda em que o ator se declara.

### Arquivos impactados no consumidor
- `.ai/base/guards/block-destructive-commands.sh` (nova regra do ator)
- `.ai/base/gates/commit-msg/` (`GATE.md` + validador: `when` e `lesson`)
- `.claude/settings.json` (novo `env.TARS_ACTOR=agent`, regravado pelo sync)
- `.ai/VERSION`, `CHANGELOG.md`, `tars.lock` (versao do catalogo)

### O que o consumidor faz
Para isentar o commit **humano** da licao, declare:
```toml
[gates.params.commit-msg]
lesson = "agent"
```
```
tars sync           # regrava o settings.json com TARS_ACTOR=agent
tars upgrade-notes  # le as notas entre a versao do lock e a atual
tars doctor         # deve passar; se acusar wiring, e' o conserto que o sync faz
```

## 0.0.1-dev.7

### O que mudou
- `tars sync` gera os hooks do GIT e, em modo `self`, os hooks do PROPRIO catalogo; falha
  alto quando `core.hooksPath` aponta pasta morta (de5ca60) e `tars doctor` acusa hook
  morto e exige os hooks do Tars vivos (cfd3315).
- `tars sync` **nao sobrescreve** hook do consumidor sem a marca de autoria (e170796):
  hook seu sem a marca: o sync RECUSA escrever; adote com `tars sync --adopt` ou declare
  o hook como local.
- `tars sync` **poda a saida gerada orfa** que saiu do manifesto (e979bd6): item removido
  do `.ai/tars.toml` some do disco no proximo sync, sem resto.
- `handoff check` aceita a branch `main` (be074ba).
- O binario roda os gates num **runtime JS de verdade** (2a7d387) e o modulo importado
  pelo binario nao roda o proprio `main` (2d9d70e): `dist/tars sync --check` nao morre mais com ENOENT em `/.ai/`.
- Consumidor que ja' tem `.ai/VERSION` nao vira catalogo por engano (5129820).
- `incident add` registra o incidente e acusa recorrencia (a2f7731); `tars doctor` acusa
  incidente recorrente sem guarda (cd860d1).
- `memory` valida vocabulario fechado de tags, ambiente e classe (7aec978).
- **NOVO: gate `release-guard`** (ccecf5e) — commit que toca o motor do Tars
  (`tools/framework/tars-*.mjs`, `.ai/gates/`, `.ai/guards/`, `.ai/governance/`) tem de
  subir `.ai/VERSION` E trazer entrada no `CHANGELOG.md`, salvo `No-Release: <motivo>`.

### Por que
- O consumidor precisa das notas de upgrade: commit que muda o motor sem subir a versao
  deixa quem consome sem saber o que mudou (o custo que o seo-brain pagou em 07/10).
- Rubrica de hook do consumidor nao pode ser sobrescrita calada pelo sync; e output orfao
  acumula lixo que o manifesto ja' nao declara.
- Gate que roda no runtime errado (ou duas vezes) reprova commit legitimo.

### Arquivos impactados no consumidor
- `.ai/gates/release-guard/` (novo gate) e `.ai/doctrines.toml`
- `.githooks/` (pre-commit do consumidor que ligar o gate)
- `.ai/VERSION`, `CHANGELOG.md`, `tars.lock` (versao do catalogo)
- `.ai/base/gates/`, `.ai/base/guards/`, `.ai/base/governance/` regenerados pelo sync

### O que o consumidor faz
```
tars sync           # se RECUSAR nomeando um hook seu: ele tem gates do projeto. NAO adote;
                    # declare o gate como local. So' `--adopt <hook>` se o hook era copia velha do Tars.
tars upgrade-notes  # le as notas entre a versao do lock e a atual
tars doctor         # deve passar; acusa hook morto e incidente recorrente sem guarda
```

## 0.0.1-dev.6

### O que mudou
- `tars sync` gera os hooks do GIT (`.githooks/pre-commit`, `commit-msg`, `pre-push`)
  chamando `tars hooks <hook>`, quando o consumidor ja' usa hooks proprios
  (`core.hooksPath` declarado ou `.githooks/` existente).
- `tars doctor` FALHA se `core.hooksPath` aponta pasta inexistente, hook ausente ou sem bit
  executavel; e se qualquer hook do `.claude/settings.json` cita um arquivo que nao existe —
  em TODOS os eventos.
- Hook da base (PreCompact/SessionStart) passa a citar o caminho REAL achado por
  `resolveGuardFile` (projeto ou `.ai/base/guards/`), nao mais `.ai/guards/` fixo.
- `lib-*.sh` (biblioteca `source`ada por guard) nunca vira hook.
- `tars --version`; o `tars.lock` grava a versao do catalogo; `tars upgrade-notes` imprime
  as notas entre a versao do lock e a atual.

### Por que
- O consumidor que so' usa a base copiada nao tem `.ai/guards/`: o hook apontava para o
  vazio e o harness rodava `bash: no such file` em toda sessao (seo-brain, 07/10).
- Sem gerar os hooks do git, um commit passava sem gate nenhum; e o doctor nao acusava.
- O agente do seo-brain gastou turnos decifrando o que mudou no Tars — faltavam notas.

### Arquivos impactados no consumidor
- `.githooks/` (novo, quando o consumidor ja' usa hooks proprios)
- `.claude/settings.json` (comandos dos hooks da base passam a citar o caminho real)
- `.ai/tars.lock` (campo `tars.version` passa a gravar a versao do catalogo)

### O que o consumidor faz
```
tars sync          # regera base, settings e os hooks do git
tars upgrade-notes # le as notas entre a versao do lock e a atual
tars doctor        # deve passar; se acusar wiring, e' o conserto que o sync faz
```

## 0.0.1-dev.5

### O que mudou
- `fix:`/`🐛` sem arquivo de TESTE REPROVA (TARS-RED-1), salvo `No-Test: <motivo>`.
- `catch {}` / `except: pass` (erro engolido) vira REPROVA no gate `lint-swallow`.
- A licao ganha o 5o campo `hipoteses` (o que foi testado e descartado) e o `origem` antes
  do sintoma; a classe de incidente que repete 2x vira FALHA no doctor.

### Por que
- Correcao sem teste vermelho regride; erro engolido esconde a causa; licao sem causa raiz
  ensina o sintoma.

### Arquivos impactados no consumidor
- `.ai/base/gates/commit-msg/`, `.ai/base/gates/lint-swallow/`, `.ai/base/governance/`

### O que o consumidor faz
```
tars sync
```

## 0.0.1-dev.4

### O que mudou
- `tars` ganha `memory audit` (cobra a fonte de cada fato), `check-refs` (a decisao citada
  no despacho tem de existir na arvore) e `handoff check` (o cursor do HANDOFF contra o git).

### Por que
- Fato sem fonte e decisao invisivel sao divida que so' aparece quando alguem confia nela.

### Arquivos impactados no consumidor
- `.ai/memory/`, `HANDOFF.md`

### O que o consumidor faz
```
tars sync && tars memory audit && tars handoff check
```

## 0.0.1-dev.3

### O que mudou
- Wiring do harness: `tars sync` gera `.claude/settings.json` com o ambiente NAO INTERATIVO
  (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GIT_SSH_COMMAND` com `BatchMode`) e
  omite hook cujo arquivo nao existe.
- `tars hook` local nao roda no `pre-push` (o portao caro).

### Por que
- Comando de agente que abre prompt bloqueia sem TTY ate' o timeout (o `git fetch` de 8 min).

### Arquivos impactados no consumidor
- `.claude/settings.json`

### O que o consumidor faz
```
tars sync
```

## 0.0.1-dev.2

### O que mudou
- `tars doctor`: a doutrina vira DADO (`.ai/doctrines.toml`) com `fonte`/`gate`/`prova`; a
  prova que PASSA denuncia PHANTOM e o doctor sai != 0.
- `tars verify` cobra a claim contra a arvore.

### Por que
- Regra que nao e' teste e' sugestao — o par doutrina->gate so' existia na cabeca de quem
  escreveu o hook.

### Arquivos impactados no consumidor
- `.ai/doctrines.toml` (catalogo), `.ai/tars.toml` `[[doctrine]]` (projeto)

### O que o consumidor faz
```
tars sync && tars doctor
```

## 0.0.1-dev.1

### O que mudou
- `principles.md` vira a regra de boot de todo consumidor (R1-R4 + hooks/idempotencia/
  modularidade/plugabilidade/agnosticidade), levada por `tars sync` e posta no topo do
  arquivo de boot gerado.

### Por que
- Todo projeto que consome o Tars precisa da mesma regua de desenho no boot.

### Arquivos impactados no consumidor
- `.ai/base/rules/principles.md`, `AGENTS.md`/`CLAUDE.md` (gerados)

### O que o consumidor faz
```
tars sync
```
