# gate: healthcheck (B6.1)

**O que cobra** — `--version` **nao e' healthcheck**. O gate le' os arquivos de operacao
(staged, ou a arvore quando rodado como comando) e **reprova com `arquivo:linha`** toda
declaracao de saude — `healthcheck:` de compose, `HEALTHCHECK` de Dockerfile, campo de
ficha/receita, passo de post-apply — cujo comando **so' pergunta a versao** (`--version`,
`-V`, `--help`) ou so' confere que o binario existe. A prova certa e' bater na **porta**.

**Por que** — achado 12 da coleta do homelab (14/10): o healthcheck da receita de telemetria
era `openobserve --version`. O container reiniciava em **crash-loop** e o compose o declarava
**saudavel** — o binario respondia antes de morrer —, e o `depends_on: condition:
service_healthy` liberava o proximo servico contra algo que nao estava de pe'. Um healthcheck
que passa no crash-loop e' pior que nenhum: ele da' a cobertura que nao existe. Regra que
nao e' teste e' sugestao.

**Fail-closed de verdade** — se o `git` nao responder, ou se um arquivo alvo nao puder ser
lido/entendido, o gate **DIZ que nao julgou** em vez de passar calado.

**Prova (o par)** — positivo: `test: ["CMD", "curl", "-fsS", "http://127.0.0.1:5080/healthz"]`
passa; `--version` **dentro de comentario ou string de log** nao conta. Negativo:
`test: ["CMD", "openobserve", "--version"]` REPROVA nomeando a linha; o post-apply que apenas
`assert_versao(...)` REPROVA do mesmo jeito.

**Em que hook** — `pre-commit` (varre o staged) e a mao' no pos-apply (o consumidor chama o
mesmo julgamento sobre a receita que acabou de aplicar).

**Stacks** — `any` (precisa de `node`).

**Parametros** — `allow` (lista de trechos de caminho isentos), em
`[gates.params.healthcheck]` no `.ai/tars.toml` do consumidor.

**Proveniencia** — porte da IDEIA do achado 12 (`receitas/telemetria/files/compose.yaml`,
commit `ece42cd`) e do item B6.1 do plano de release do Tars (14/10); a implementacao
(julgamento por token do comando na declaracao de saude) e' nossa.
