# `tars secrets` — o cofre do projeto

> Fatia dev.19. O `tars secrets` já existe desde a dev.9 (refresh/exec/check/rotate); este
> documento cobre o que a dev.19 acrescentou: `init`, o caminho do template e as armadilhas
> do formato do template que o validador barra.

O `[secrets]` do `.ai/tars.toml` declara **só endereços**: a ref `op://` de cada segredo e os
caminhos locais (chave, cache, template, token). Nenhum valor mora no repo — o valor mora no
1Password e o dia a dia lê o cache local cifrado (sops+age), fora do repo (ADR-013).

## `tars secrets init` — montar o `[secrets]` a partir do arquivo de refs

```bash
tars secrets init                 # usa config/secrets.refs.yaml
tars secrets init --refs outro.yaml
```

O arquivo de refs (convenção: `config/secrets.refs.yaml`) tem uma linha por segredo, no
formato `KEY: op://...`:

```yaml
# refs do projeto — nenhum valor aqui, só o endereço no cofre
GITHUB_PAT: op://secrets/gh/token
SOPS_AGE: "op://tars/age/ref"
```

O `init` escreve no `.ai/tars.toml` um bloco `[secrets]` com os campos que faltam e as refs
que ainda não estão lá, e grava a marca `gerado = [...]` com os nomes que **ele** montou.

Regras:

- **Nenhum valor atravessa.** O arquivo de refs tem só endereços; uma linha com valor em
  claro (um JWT, uma chave) é **ignorada** — não vira campo do manifesto nem aparece na saída.
  O valor se grava com `tars secrets set`.
- **Idempotente.** Rodar de novo não muda um byte: o `init` lê a marca `gerado`, vê que todas
  as refs já estão no manifesto e só reporta `nada a fazer`. Uma ref **nova** entrou no
  arquivo? Só ela é anexada, sem duplicar as antigas.
- **Manifesto do dono é preservado.** Num manifesto **sem** a marca `gerado` (escrito à mão),
  as chaves de `[secrets]` ficam como estão — o `init` só acrescenta o que falta. A ref que o
  dono escolheu à mão **vence** a do arquivo de refs.
- **Falha alta, antes de escrever.** Sem `source` declarado, ou com uma ref fora de `op://`,
  o `init` **recusa** e não toca no manifesto: um manifesto meio escrito seria pior que
  nenhum, porque o próprio `lerConfig` o reprovaria depois (R4).

## O caminho do template

O template é o env-file que o `op run` resolve (`KEY=op://...`). Ele vem do campo
`[secrets].template`:

```toml
[secrets]
source = "automation"
template = "config/secrets.tpl"     # RELATIVO à raiz do projeto
```

- **Relativo resolve contra a RAIZ do projeto** (onde está o `.ai/tars.toml`), nunca contra o
  diretório de trabalho. `config/secrets.tpl` vale o mesmo rodando da raiz ou de
  `apps/hub/` — o que era o defeito antes: funcionava da raiz e falhava de um subdiretório,
  longe da causa.
- **Absoluto continua valendo** (`/etc/tars/secrets.tpl`).
- **`~` e `~/x` continuam valendo** e expandem para o home (`~/.config/meu.tpl`). `~outro/x`
  **não** é o home: é um caminho relativo como outro qualquer.
- Sem `template` declarado, vale o padrão embutido (`~/.config/tars/<projeto>/secrets.tpl` —
  fora do repo).

## O erro de `op://` no formato do template

O `op run --env-file` tem **um** formato: `KEY=op://...`, uma chave por linha. O validador
(`confereTemplate`) barra tudo que não seja isso, e o erro mais comum é `op://` **dentro de
um comentário** — o `op run` resolve a ref até em comentário, então um comentário "inocente"
que cita uma ref **abre o cofre** e pode vazar o valor para o env.

**Errado** (o validador barra — a ref no comentário seria resolvida pelo `op run`):

```dotenv
# trocar pela ref op://secrets/gh/token quando a conta mudar
GITHUB_PAT=op://secrets/gh/token
```

**Certo** (o comentário descreve sem citar a ref inteira):

```dotenv
# trocar a ref quando a conta mudar
GITHUB_PAT=op://secrets/gh/token
```

Outras formas que o validador barra, pelo mesmo motivo (todas resolvidas pelo `op run`):

| Escrita | Por quê barra |
|---|---|
| `TOKEN={{ op://v/i/f }}` | o `op run` entrega o literal com as chaves — não é interpolação |
| `TOKEN=prefixo op://v/i/f` | `op://` só vale como **valor inteiro**, não no meio |
| `export TOKEN=op://v/i/f` | o env-file do `op run` não usa `export` |
| duas `op://` na mesma linha | cada linha é uma chave |

A mensagem de erro nomeia a **linha** e a chave, e **nunca** ecoa o valor (R4).

## Os outros subcomandos (dev.9)

| Comando | Quem | O que faz |
|---|---|---|
| `secrets refresh` | — | abre o cofre (1Password) e regrava o cache cifrado do projeto |
| `secrets exec -- <cmd>` | — | roda `<cmd>` com o cache decifrado no env, sem shell |
| `secrets check` | — | julga chave/token/cache/recipient/template **sem** abrir o cofre |
| `secrets rotate` | DONO | gera a chave age nova, troca no cofre e recifra os versionados |
| `secrets token set` | DONO | troca o token da service account (stdin oculto) |
| `secrets git-credential <get\|store\|erase>` | git | entrega o PAT do cache só para os hosts de `git_hosts` |
