# gate: commit-msg

**O que cobra** — a MENSAGEM do commit no padrao `<emoji> <type>(<scope>): <descricao>` (INV-GIT-2), com o
sujeito <= 72 chars, e o registro do aprendizado/incidente (INV-LESSON-1). `feat|refactor|perf` exigem
`Lesson:` em 1 linha, o BLOCO de 4 campos, ou `No-Lesson: <motivo de 10+ chars>`; `fix|bug|hotfix` exigem
`No-Incident: <motivo>` ou o `Incident:` em 4 campos — a 1 linha NAO basta para o `fix`. A saida e' o
registro — nunca `--no-verify`.

**O bloco de 4 campos** (fabber `LESSONS-LEARNED.md`, item 36) forca a CAUSA: `erro:` (o que estava
errado, concreto), `porque:` (o mecanismo imediato), `causa raiz:` (o buraco estrutural — o check que
falta, a instrucao ambigua, o buraco de processo) e `correcao:` (o arquivo/gate que muda). Repetir o
`porque` na `causa raiz` reprova: se sao a mesma frase, nao se cavou o nivel. "ter mais cuidado" e' vago
e reprova como `causa raiz` e como `correcao`.

**Em que hook** — `commit-msg` (git passa o caminho do arquivo da mensagem como `$1`).

**Stacks** — `any` (precisa de `node` no PATH).

**Parametros** — `lesson` (default `always`).

- `lesson = "agent"` — a exigencia de licao/incidente vale so' para o **agente**; commit de
  humano (sem trailer `Co-Authored-By:` de modelo e sem marcador de harness) nao paga
  `Lesson:`/`Incident:`. Emoji, tipo, 72 chars e a regra do teste vermelho do `fix`
  (TARS-RED-1) continuam valendo para os dois — a prova da correcao nao e' licao.
- `always` (ou o param ausente) — cobra de todo mundo, como antes.

O ator e' decidido pelo MOTOR (`tools/framework/tars-actor.mjs`): `TARS_ACTOR` no env, ou o
trailer da mensagem. O gate nao recalcula — so' julga pelo que veio.

```toml
[gates.params.commit-msg]
lesson = "agent"
```

Tipos/emoji e o limite do sujeito moram em `emoji.mjs`, ao lado do `validate-commit.mjs`
(SSOT: o motor so' chama, nao reimplementa o padrao).

**Proveniencia** — portado do segtools (`.githooks/commit-msg` + `tools/framework/githooks/validate-commit.mjs`,
leituras de 07/10). As mensagens do validador sao em portugues: o gate fala a lingua do canal do projeto.
