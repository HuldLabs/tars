# gate: colocacao-arquivo (B1.1 · B1.2)

**O que cobra** — o **LOCAL** onde o arquivo nasce, pela **MATRIZ** (`familia -> allowed`):

- **B1.1 — a matriz e' o gate.** Cada familia declara onde pode viver; o que **nao casa familia
  nenhuma** e' `nao-classificado` e **REPROVA**. A matriz tem de continuar **completa**: arquivo
  novo sem familia e' buraco, nao permissao. A ordem do arquivo e' a do autor (o mais especifico
  antes do amplo). `allowed = []` e' a forma de dizer *proibido em todo lugar*; `allowed`
  **ausente** nao limita o local (so' o `forbidden` manda).
- **B1.2 — caminho global nunca sob o app.** `tools/`, `packages/`, `config/`, `.ai/`, `docs/`,
  `themes/`, `modules/`, `.githooks/`, `.devcontainer/`, `secrets/` sao do framework: nascem na
  raiz e o app **consome**. Sob a raiz do app (`--app`, default `apps/`) qualquer um deles
  **REPROVA** — a forma GERAL, para o defeito nao depender de alguem lembrar de escrever a
  familia (`forbidden`) do caso.

**Por que** — ate' esta fatia a regra existia so' onde o catalogo nao alcanca: a matriz
`config/file_placement.toml` (que **so' o segtools tem**) e o `tools/framework/layout-check.mjs`
(que le' um caminho **fixo** do repo). O consumidor novo nascia sem a doutrina — o "buraco maior"
do plano de release de 14/10. Regra que nao e' teste e' sugestao.

**Modos** (`TARS_GATE_PARAMS` = `[gates.params.colocacao-arquivo]` do `.ai/tars.toml`):

| Parametro | Julga |
|---|---|
| `matriz` | caminho da matriz de colocacao, **relativo ao projeto** (obrigatorio: sem ela o gate NAO julga) |
| `app` | raiz do app (default `apps/`) — a fronteira do B1.2 |

Flags de CLI: `--matriz`, `--app` e `--arquivos a,b` (a CI julga lista explicita em vez do
staged). **A matriz e' DADOS**: o catalogo traz a REGRA (`regra.mjs`), o consumidor traz a
familia.

**Prova** — positivo: `docs/guia.md` classificando na area `docs` PASSA. Negativo:
`apps/hub/tools/gate.mjs` REPROVA por B1.2; `qualquer/lugar/x.xyz` REPROVA como
`nao-classificado`. Ambos rodam contra repo e matriz REAIS, e a prova olha exit code + mensagem.

**Fail-closed (B2.3)** — sem matriz declarada, matriz ilegivel, matriz **sem** `[[family]]` ou
sem git, o gate **REPROVA** dizendo que NAO julgou. Vazio nao aprova.

**Em que hook** — `pre-commit`. **Stacks** — `any` (precisa de `node` e de `git`).

**Proveniencia** — item B1.1/B1.2 do plano de release do Tars (14/10), cuja fonte e' a coleta do
segtools (1.2 e 1.3), o `AGENTS.md` §procedimento pre-criacao e o `layout-check.mjs`. Portado o
**desenho** (matriz como dado + `nao-classificado` bloqueando + ordem do autor); a implementacao
e' nossa, e o catalogo fica com a regra enquanto a matriz continua do projeto.
