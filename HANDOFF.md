# HANDOFF — Tars

> Cursor do coordenador: onde paramos e o que vem. A fila é o `BACKLOG.md`; o entregue, o
> `CHANGELOG.md`. Aqui só o estado vivo e o como-operar.

## Coordenação

- **Coord atual:** coord do Tars (desde 14/10/2026, ordem do dono).
- **Coord anterior:** COORD SegTools — consultável por mensagem entre sessões para histórico e
  o porquê de decisões.

## Como operar

- **Devcontainer:** `docker exec -u node segtools-dev bash -lc "cd /projects/tars && …"`. Não
  cruze filesystem (host ↔ container).
- **Worktrees:** `/projects/tars/.worktrees/`. Conferir alteração local e branch antes de apagar
  qualquer uma.
- **Push sem segredo em argv:**
  `git -c credential.helper= -c "credential.helper=!bash /workspace/.devcontainer/git-credential-op.sh" push https://github.com/HuldLabs/tars.git <ref>`
- **Identidade de commit e tag:** `git -c user.name=Daneel -c user.email=daneel@huldlabs`.
- **Commit:** os gates exigem `Lesson`/`Incident` (fix), `No-Lesson`, `No-Release`, `No-Test`
  (≥10 chars) e título ≤72. Nunca `--no-verify`, `stash`, `reset` ou `git add -A`.

## Release

Doutrina inteira em `.ai/governance/release.md`. Resumo do papel do coord:

1. PR final (código + `.ai/VERSION` + `package.json` + seção do CHANGELOG com as 4 subseções e os
   bugs reportados que fecha), no modelo `templates/PR-RELEASE.tpl.md`, título `… — v<versão>`.
2. O merge do dono é o aval. Aí: tag anotada como Daneel sobre o merge, acompanhar o CI,
   conferir a página da Release.
3. **Nível:** o coord só corta `dev.N+1`. Sair de `-dev`, patch/minor/major, modelo de tag e
   cortar-ou-esperar são do dono, com pergunta única e isolada.
4. Tag sem Release pode ser movida ou removida; com Release publicada, nunca.
5. Depois da Release: avisar os coords consumidores com texto pronto, que termina com "Em caso de
   dúvida, bug ou problema, fale com o coord do Tars".

## Versões

| versão | estado |
|---|---|
| dev.19, 20, 21, 22, 24, 25 | publicadas (dev.25: primeira com todos os jobs verdes) |
| dev.23 | sem Release; tag removida; a imagem `tars:0.0.1-dev.23` segue no GHCR (dono apaga pela UI) |
| dev.26 | publicada 14/10 (rerun do run `38620411824` após o repo virar público) |

A dev.26 corrige o wiring (o sync ligava lib, `.py` e guards de outro evento no `PreToolUse` do
Bash) e traz a regra de nível da versão.

## Consumidores

| consumidor | versão | nota |
|---|---|---|
| segtools | dev.25 | wiring ok; `.githooks` próprios sem a marca do Tars → sync sai rc=1 (não bloqueia) |
| seo-brain | dev.26 | wiring ok, contorno removido (ceb824a); doctor acusa token/cache do op (bind de `~/.config/tars`, com o coord SegTools) |
| Kipp | dev.22 | doctor reprova o CHANGELOG dele (data no título, sem seção v0.0.2, package.json em dev.1); avisado |
| Endurance | — | embute o Tars na imagem base por digest; bump do Tars em toda imagem |
| Tomo | dev.22 | — |

## Lições desta rodada

- Mudança no sync se prova com **upgrade real** (N-1 → N), não só unitário.
- Provar num **clone limpo**, com o embutido gerado: duas Releases quebraram por arquivo gerado
  que só existia no ensaio local.
- Workflow chama script por `bash`/`node`, nunca pelo caminho (bit de execução).
- Erro que se repete vira prevenção na segunda vez.

## Próximo passo

Merge deste PR; PUB-GHCR (dono libera pacote público na org); PUB-PAT; TARS-BUG-6.
