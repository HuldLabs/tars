# gate: no-add-all

**O que cobra** — nenhum `git add` amplo (`-A`, `--all`, `-u`, `.`), nenhum `git add -f` e nenhum
`git commit -a`. A arvore de trabalho e' COMPARTILHADA entre as frentes: o add amplo leva o arquivo de outra
frente para o commit (01/10: o README de um worker entrou no commit de outro — regra `Shared checkout,
explicit pathspec`), e o `git add -f` atravessa o `.gitignore` (02/10: `.cache/` na main 3x). O caminho
exigido e' sempre o pathspec explicito: `git add -- <arquivo>...` / `git commit -F <msg> -- <arquivo>...`.

**Em que hook** — `pre-commit` **quando rodado como comando** (julga o indice, exit 1); o papel principal e'
como hook de agente `PreToolUse` (`Bash`), onde o exit 2 barra o COMANDO antes de ele rodar — e' o unico
lugar em que da' para recusar o `git add` antes do dano. Ver §adaptador.

**Stacks** — `any` (precisa de `node`; sem node, o adaptador de agente falha ABERTO).

**Parametros** — opcional `allow` (lista de prefixos de pathspec que o projeto libera; default: nenhum).
Lido de `[gates.params.no-add-all]` no `.ai/tars.toml`.

**Adaptador** — este gate tem duas pontas e o motor so' ve' uma (a de comando). A outra e' copiada para a
config da ferramenta pelo `[gates.hooks]`/passo de instalacao: `no-add-all.mjs` (payload do `PreToolUse`)
tem de ser registrado no `PreToolUse`/matcher `Bash` do harness do agente — no segtools de hoje isso e' o
`settings.json` que o despacho do worker gera (`fast.py`, ao lado de `worker-destructive-guard.mjs`).

**Proveniencia** — portado do segtools `tools/method/worker/worker-destructive-guard.mjs` (leitura de 07/10),
somente a familia add/commit amplo. Ficaram de fora: docker volumes, `DROP/TRUNCATE`, lane gate e o
`DESCARTAVEL` do `rm -rf` — sao topologia do segtools, nao do catalogo.
