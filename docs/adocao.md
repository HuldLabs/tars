# Adotar e atualizar o Tars

Guia prático do consumidor: como instalar o `tars`, ligar um repo **novo**, adotar um repo
**que já existe** e **atualizar** quando sai versão nova. O que mudou em cada versão está no
[`CHANGELOG.md`](../CHANGELOG.md); o desenho de cada comando, no [`README.md`](../README.md).

## 1. Instalar o binário

O `tars` é um binário único: roda sem Node, sem checkout do Tars e sem `TARS_HOME`, porque
o catálogo (`.ai/` e `templates/`) vem embutido. Toda tag `v*` publica três coisas:

- os binários na Release do GitHub, com `sha256sums`: `tars-linux-amd64` e `tars-linux-arm64`
  (glibc: Ubuntu, WSL, Debian) e `tars-linux-amd64-musl` e `tars-linux-arm64-musl` (Alpine,
  que precisa de `apk add libstdc++`). Cada um é provado no CI rodando na sua libc e arquitetura;
- a imagem `ghcr.io/huldlabs/tars:<versão>` (multi-arch, base glibc mínima, binário em `/tars`);
- a atestação de procedência das imagens.

**Na máquina (ou numa imagem com rede):**

```sh
V=0.0.1-dev.19
curl -fsSLO "https://github.com/HuldLabs/tars/releases/download/v$V/tars-linux-amd64"
curl -fsSLO "https://github.com/HuldLabs/tars/releases/download/v$V/sha256sums"
sha256sum -c --ignore-missing sha256sums        # tem de dizer OK; senão, pare
install -m 0755 tars-linux-amd64 ~/.local/bin/tars
tars --version
```

O repo é privado: o `curl` precisa de token (`-H "Authorization: Bearer $GH_TOKEN"`) ou use
`gh release download v$V -R HuldLabs/tars -p 'tars-linux-*' -p sha256sums`.

**Numa imagem Docker (o que o Endurance faz):** copie da imagem, fixando por digest, nunca
por tag móvel:

```dockerfile
COPY --from=ghcr.io/huldlabs/tars:0.0.1-dev.19@sha256:<digest> /tars /usr/local/bin/tars
```

Pré-release não move `latest`: fixe sempre a versão.

## 2. Repo novo

```sh
cd meu-repo
tars init              # cria .ai/tars.toml mínimo e .ai/memory/
$EDITOR .ai/tars.toml  # declare skills, gates, guards e memória que o projeto usa
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

1. **Manifesto e base.** `tars init` (se faltar) e depois `tars sync`.
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

5. **Identidade e assinatura** (repo onde a automação comita):

   ```sh
   tars identity provision     # DONO, com TTY, uma vez por máquina
   tars identity sign-setup    # gpg.format=ssh, signingkey e allowedSignersFile; idempotente
   tars identity verify        # read-only; sem identidade, diz o comando que o dono roda
   ```

6. **Memória e o par do método.** `tars memory audit`; crie `BACKLOG.md` e `HANDOFF.md` se
   faltarem.
7. Rode `tars adopt` de novo até sobrar só o que você decidiu deixar como aviso, e depois
   `tars doctor`.

## 4. Atualizar para uma versão nova

```sh
# 1. troque o binário (seção 1) e confira
tars --version

# 2. ressincronize: o sync recusa motor de versão diferente da do lock em vez de apagar
tars sync

# 3. leia só o que mudou entre a versão do seu lock e a nova
tars upgrade-notes

# 4. confira
tars doctor
tars adopt
```

O `upgrade-notes` imprime, de cada versão entre o lock e a atual, as quatro partes do
CHANGELOG: o que mudou, por quê, arquivos impactados e **o que o consumidor faz**. Essa
última parte é a lista de ações da atualização.

Se o `sync` recusar por versão ("motor X, lock Y"), é o binário errado no PATH: troque o
binário, não force o sync.

## 5. Quando algo dá errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `hook was ignored because it's not set as executable` | bit de execução fora do índice | `git update-index --chmod=+x .githooks/*`; commit inválido até resolver |
| primeiro commit reprova centenas de achados antigos | repo adotado sem linha de base | `tars gates baseline` |
| `No-Release:` ignorado numa worktree | versão anterior à dev.19 | atualize; o gate lê a mensagem no `commit-msg` |
| `tars doctor` acusa DRIFT em doutrina `org/*` | referência a caminho que não existe nesta máquina | atualize; as doutrinas usam `repo:caminho` relativo |
| `sync` apagou arquivo de guard | versão anterior à dev.19 com motor ≠ lock | atualize; agora recusa e nunca apaga item citado |
