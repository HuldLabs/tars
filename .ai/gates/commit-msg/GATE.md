# gate: commit-msg

**O que cobra** — a MENSAGEM do commit no padrao `<emoji> <type>(<scope>): <descricao>` (INV-GIT-2), com o
sujeito <= 72 chars, e o registro do aprendizado/incidente (INV-LESSON-1): `feat|refactor|perf` exigem
`Lesson:` ou `No-Lesson: <motivo de 10+ chars>`; `fix|bug|hotfix` exigem `Incident:` ou `No-Incident:`. A
saida e' o trailer — nunca `--no-verify`.

**Em que hook** — `commit-msg` (git passa o caminho do arquivo da mensagem como `$1`).

**Stacks** — `any` (precisa de `node` no PATH).

**Parametros** — nenhum. Tipos/emoji e o limite do sujeito moram em `emoji.mjs`, ao lado do
`validate-commit.mjs` (SSOT: o motor so' chama, nao reimplementa o padrao).

**Proveniencia** — portado do segtools (`.githooks/commit-msg` + `tools/framework/githooks/validate-commit.mjs`,
leituras de 07/10). As mensagens do validador sao em portugues: o gate fala a lingua do canal do projeto.
