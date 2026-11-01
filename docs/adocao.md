# Adotar e atualizar o Tars

Guia prático do consumidor: como instalar o `tars`, ligar um repo **novo**, adotar um repo
**que já existe** e **atualizar** quando sai versão nova. O que mudou em cada versão está no
[`CHANGELOG.md`](../CHANGELOG.md); o desenho de cada comando, no [`README.md`](../README.md).

## 1. Instalar o binário

O `tars` é um binário único: roda sem Node, sem checkout do Tars e sem `TARS_HOME`, porque
o catálogo (`.ai/` e `templates/`) vem embutido. Toda tag `v*` (processo único do ecossistema: `.ai/governance/release.md`) publica três coisas:

- os binários na Release do GitHub, com `sha256sums`: `tars-linux-amd64` e `tars-linux-arm64`
  (glibc: Ubuntu, WSL, Debian) e `tars-linux-amd64-musl` e `tars-linux-arm64-musl` (Alpine,
  que precisa de `apk add libstdc++`). Cada um é provado no CI rodando na sua libc e arquitetura;
- a imagem `ghcr.io/huldlabs/tars:<versão>` (multi-arch, base glibc mínima, binário em `/tars`);
- a atestação de procedência das imagens.

**Na máquina (ou numa imagem com rede):**

Troque `V` pela versão mais recente da
[página de Releases](https://github.com/HuldLabs/tars/releases).

```sh
V=<versão>
curl -fsSLO "https://github.com/HuldLabs/tars/releases/download/v$V/tars-linux-amd64"
curl -fsSLO "https://github.com/HuldLabs/tars/releases/download/v$V/sha256sums"
sha256sum -c --ignore-missing sha256sums        # tem de dizer OK; senão, pare
install -m 0755 tars-linux-amd64 ~/.local/bin/tars
tars --version
```

O repo e a imagem são públicos: o `curl` não precisa de token. Se esbarrar no limite de taxa
do GitHub, repita com `-H "Authorization: Bearer $GH_TOKEN"`.

**Numa imagem Docker (o que o Endurance faz):** copie da imagem, fixando por digest, nunca
por tag móvel:

```dockerfile
COPY --from=ghcr.io/huldlabs/tars:<versão>@sha256:<digest> /tars /usr/local/bin/tars
```

Pré-release não move `latest`: fixe sempre a versão.

**Em devcontainer:** instale o binário na imagem (como acima) para ele estar no PATH de todo shell.
Os hooks do git procuram `tars` no PATH e, sem ele, reprovam o commit dizendo o que falta.
`TARS_HOME` não é necessário; no binário, um `TARS_HOME` de outra versão é ignorado com aviso.

**Em CI:** baixe o binário com a verificação de `sha256sums` e rode `tars check` e `tars doctor`.

**Pré-requisitos por recurso:** `git` sempre; `gitleaks` para o gate de mesmo nome; `op`, `sops`,
`age` e `ssh-keygen` para segredos e assinatura; `node` ou `bun` para gates `.mjs`, quando o binário
não puder reexecutar a si mesmo.

**Atualização rápida:** `tars self-update [--version V]` baixa, confere o sha256, troca o binário e
roda `sync --upgrade`.

## 2. Repo novo

```sh
cd meu-repo
tars init              # cria .ai/tars.toml mínimo e .ai/memory/
$EDITOR .ai/tars.toml  # declare o que o projeto usa, decidido em docs/avaliar-catalogo.md
tars catalog           # o que existe e o que falta decidir (docs/avaliar-catalogo.md)
tars sync              # traz o declarado para .ai/base/, gera o wiring e liga .githooks
tars doctor            # confere doutrina × gate × prova (exit != 0 em PHANTOM/DRIFT)
```

Declarar um gate de hook git basta: o `sync` cria `.githooks/` e liga `core.hooksPath`.

## 3. Repo que já existe: `tars adopt`

Um repo antigo já tem dívida, hooks próprios e segredos espalhados. O **`tars adopt`** é o
roteiro: só lê, não altera nada, e diz o que falta com o comando de cada item.

```sh
tars adopt             # ou --json
```

Saída típica (e o que fazer em cada linha):

```text
OK     manifesto     .ai/tars.toml
OK     base          base sincronizada do catalogo (.ai/base + .ai/tars.lock)
OK     hooks         hooks do git (.githooks + core.hooksPath)
AVISO  gates-locais  nenhum gate local declarado -> declarar [gates].local no .ai/tars.toml
AVISO  baseline      sem linha de base             -> tars gates baseline
AVISO  secrets       sem [secrets]                 -> tars secrets init --refs <arquivo-de-refs>
AVISO  memoria       pasta .ai/memory sem INDEX.md -> tars memory audit
OK     backlog       BACKLOG.md + HANDOFF.md
```

Passo a passo, na ordem:

1. **Manifesto, avaliação e base.** `tars init` (se faltar), avalie o catálogo contra o repo
   ([`avaliar-catalogo.md`](avaliar-catalogo.md)) e depois `tars sync`.
2. **Hooks.** Hook escrito à mão fora do Tars aparece como **alheio**: o `sync` não o
   sobrescreve. Para entregar ao Tars, `tars sync --adopt pre-commit` (guarda o original
   em `pre-commit.bak`).
3. **Linha de base.** Sem ela, o primeiro commit reprova toda a dívida antiga, e a saída
   vira o `--no-verify`. Grave a base, comite o arquivo e vá pagando:

   ```sh
   tars gates baseline            # grava .ai/gates-baseline.json (a dívida de hoje, nomeada)
   git add .ai/gates-baseline.json
   # ... conserte achados ...
   tars gates baseline --prune    # a base só encolhe (ratchet)
   ```

   O gate reprova só o que é **novo**. Mudou a linha isenta, a isenção cai. E os gates
   julgam só o que está **staged** e **rastreado**: arquivo fora do git não reprova commit.
4. **Segredos** (só se o repo tem segredo). Liste as refs `op://` num arquivo e monte o bloco:

   ```sh
   tars secrets init --refs secrets/refs.txt   # escreve o [secrets] no .ai/tars.toml
   tars secrets refresh                         # abre o cofre e grava o cache cifrado
   tars secrets check                           # confere tudo sem abrir o cofre
   ```

   Para o `git` pegar o token do cache (sem PAT em arquivo nem em URL), declare os hosts em
   `git_hosts` no `[secrets]` e ligue o helper:

   ```sh
   git config credential.helper '!tars secrets git-credential'
   ```

   Host fora de `git_hosts` não recebe credencial nenhuma.

5. **Identidade e assinatura** (só se a automação comita com identidade própria declarada em
   `[identity]`; quem assina pelo devcontainer sem esse bloco pula este passo):

   ```sh
   tars identity provision     # DONO, com TTY, uma vez por máquina
   tars identity sign-setup    # gpg.format=ssh, signingkey e allowedSignersFile; idempotente
   tars identity verify        # read-only; sem identidade, diz o comando que o dono roda
   ```

   **Em container, sem TTY e sem o app do 1Password:** o dono roda uma vez
   `tars secrets token set`; esse token é o aval. Declare em `[identity]` `key_file`, `key_cache`
   (nome da chave no cache), `git_name`, `git_email` e, se quiser, `git_helper`. Depois:

   ```sh
   tars secrets refresh
   tars identity sign-setup --from-cache --global
   ```

   A chave sai do cache para `key_file` (0600, sem CRLF), a `.pub` é derivada, e chave inválida
   falha alto. `--global` evita gravar no `.git/config` compartilhado com o host.

6. **Memória e o par do método.** `tars memory audit`; crie `BACKLOG.md` e `HANDOFF.md` se
   faltarem.
7. **Boot do agente.** Declare `rules` no `.ai/tars.toml`: o `sync` as põe no topo de `CLAUDE.md`
   e `AGENTS.md`, entre as marcas `tars:boot`. O resto do arquivo é seu. Regras próprias do resumo
   de sessão vão em `.ai/context-digest.txt`.
8. **Gates de agente.** Declare `agent_gates = ["prod-guard", "no-add-all", "daneel-acoes"]` em
   `[tars]`: o `sync` copia e liga a ponta `PreToolUse`.
9. Rode `tars adopt` de novo até sobrar só o que você decidiu deixar como aviso, e depois
   `tars doctor`.

## 4. Atualizar para uma versão nova

```sh
# 1. troque o binário (seção 1) e confira
tars --version

# 2. troque a versão de propósito: reescreve .ai/base e .ai/tars.lock para o motor novo
#    (sem --upgrade o sync RECUSA motor de versão diferente da do lock, e nada é escrito)
tars sync --upgrade

# 3. leia só o que mudou entre a versão do seu lock e a nova
tars upgrade-notes

# 4. confira
tars doctor
tars adopt

# 5. avalie o que a versão trouxe de novo para este repo
tars catalog           # docs/avaliar-catalogo.md
```

O `upgrade-notes` imprime, de cada versão entre o lock e a atual, as quatro partes do
CHANGELOG: o que mudou, por quê, arquivos impactados e **o que o consumidor faz**. Essa
última parte é a lista de ações da atualização.

Se o `sync` recusar por versão ("motor X != lock Y") **sem você ter trocado o binário**, é o
binário errado no PATH: troque o binário, não use `--upgrade`. Se você trocou de propósito,
o `--upgrade` é o caminho.

**Voltar uma versão:** reinstale o binário anterior, rode `tars sync --upgrade` e confira com
`tars check`; `git revert` do commit da atualização também volta `.ai/base` e o lock.

**Item que você adaptou na base:** não edite `.ai/base`, o sync reescreve. Use parâmetro em
`[gates.params]` ou item próprio em `[gates].local`.

**Vários repos:** atualize primeiro um consumidor de referência, confira, e só então os outros.

## 5. Como relatar um bug do Tars

Registre no `BACKLOG.md` do Tars: repo, data, versão, comando exato, saída real, esperado e
obtido, se é regressão e o contorno. Sem reprodução, o item fica "a confirmar".

## 6. Quando algo dá errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `hook was ignored because it's not set as executable` | bit de execução fora do índice | `git update-index --chmod=+x .githooks/*`; commit inválido até resolver |
| primeiro commit reprova centenas de achados antigos | repo adotado sem linha de base | `tars gates baseline` |
| `No-Release:` ignorado numa worktree | versão anterior à dev.19 | atualize; o gate lê a mensagem no `commit-msg` |
| `tars doctor` acusa DRIFT em doutrina `org/*` | referência a caminho que não existe nesta máquina | atualize; as doutrinas usam `repo:caminho` relativo |
| `nao achei o binario do Tars` no commit | `tars` fora do PATH do shell | instale o binário no PATH |
| `check` falha com `core.hooksPath` desligado | hooks fora do ar, nenhum gate roda | `tars sync` |
| `aviso: TARS_HOME ... outra versao` | checkout antigo na variável | remova a variável |
| `sync` apagou arquivo de guard | versão anterior à dev.19 com motor ≠ lock | atualize; agora recusa e nunca apaga item citado |
