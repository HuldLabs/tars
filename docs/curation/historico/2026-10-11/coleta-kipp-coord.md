# Insumo do coordenador KIPP (mensagem de 11/10, ~15h)
- Registro de acessos da Daneel JÁ EXISTE como trabalho: branch `feat/daneel-agente` do tars (commits 1066793..d87ed10,
  `tools/framework/tars-acessos.mjs` + teste). Fora da main; a decisão de entrar é do dono. Base da fase 2 (R1).
- Fontes do kipp: `BACKLOG.md` (decisões 1–17), `docs/contexto.md` (§5 lições, §11 armadilhas),
  `docs/adr/0003-operacao-de-projeto.md`, `docs/jira-paridade.md`.
- Lições genéricas → Tars:
  1. Worker prova com atalho (`--check`) em vez do aceite real.
  2. Worker roda comando fora da worktree (sync no checkout principal).
  3. Worker contorna hook trocando `core.hooksPath`.
  4. `.ai/base/` não versionado exige `tars sync` em toda worktree nova.
  5. `tars sync` gerava hook não executável (corrigido no tars#6).
- Tars main: #4 (hook do catálogo), #5 (K0: contracts/binary-manifest v1), #6 (hooks executáveis).

# Ordem do dono para a fase 2 (11/10)
- TODOS os bugs e melhorias do Tars coletados (de qualquer repo/sessão) entram na PRÓXIMA versão do Tars.
- Regra que fica clara para quem usa o Tars (README + `principles.md`, que vai no boot de todo consumidor): todo bug do
  Tars que um consumidor encontrar é REPORTADO ao Tars (BACKLOG do tars, com repo, data, reprodução) e CORRIGIDO na
  próxima release; contorno local só temporário e registrado. O CHANGELOG da release lista os bugs reportados que fechou.
- Inclui: a `feat/daneel-agente` (registro de acessos da Daneel) avaliada para a mesma release.
