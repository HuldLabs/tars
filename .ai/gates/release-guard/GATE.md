# gate: release-guard

**O que cobra** — um commit que toca o MOTOR do Tars (`tools/framework/tars-*.mjs`,
`.ai/gates/`, `.ai/guards/`, `.ai/governance/`) tem de subir a versao (`.ai/VERSION`, com o
espelho `package.json`) E trazer entrada no `CHANGELOG.md` com as 4 subsecoes fixas. Sem um
dos dois = REPROVA. Salvo `No-Release: <motivo de 10+ chars>` no corpo do commit.

**Por que** — o consumidor precisa das notas de upgrade (foi o que custou turnos ao
seo-brain, 07/10). Commit que muda o motor sem subir a versao deixa o consumidor sem saber
que mudou; a doutrina `versionamento-de-extracao` torna isso cobravel.

**Em que hook** — `pre-commit` (le `git diff --cached` e compara `.ai/VERSION` com o HEAD).

**Stacks** — `any` (precisa de `git` e `node` no PATH).

**Parametros** — nenhum.

**Escape** — `No-Release: <motivo>` no corpo da mensagem (ex.: refactor interno sem efeito
no consumidor, regeneracao de indice).
