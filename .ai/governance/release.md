# Doutrina: o processo de release do ecossistema

Metodologia **única** para publicar versão em qualquer repo da HuldLabs (Tars, Kipp, Tomo,
Endurance, Sofon, Pion e os que vierem). Decisão do dono (14/10/2026). O modelo vivo é o
`.github/workflows/release.yml` do Tars: o que esta doutrina descreve, ele executa.

Como contar a versão e o que vai em cada seção do CHANGELOG está em
`versionamento-de-extracao.md`. Aqui está o caminho da entrega até o consumidor.

## Papéis

| Quem | Faz |
|---|---|
| **Coord do repo** | prepara o PR final, corta a tag, acompanha o CI, confere a Release, avisa os consumidores e corrige o que falhar |
| **Dono** | mergeia o PR final da versão. **O merge é o aval**; não há segunda pergunta |
| **Coord de quem consome** | atualiza (`tars self-update` ou o binário/imagem por digest) e reporta bug ao coord do repo |

O dono não cria tag, não roda workflow e não confere asset.

## Quem decide o nível da versão

Decisão do dono (14/10/2026):

- **A primeira versão de todo repo do ecossistema é `v0.0.1-dev.1`.**
- **`dev.N` → `dev.N+1`: o coord decide.** Cortar a próxima `dev.N` não precisa de aprovação à
  parte; o único aval é o merge do PR final pelo dono.
- **Qualquer mudança de nível é só do dono**, com confirmação **clara e explícita**: sair de
  `-dev` (`0.0.1-dev.N` → `0.0.1`), subir patch, minor ou major (`0.0.2`, `0.1.0`, `1.0.0`) ou
  qualquer outra troca de hierarquia, partindo de qualquer versão.
- **Essa confirmação é uma pergunta única**, feita sozinha e sem outros assuntos junto. Pergunta
  embutida num lote de decisões não vale como aval, e merge de PR também não.
- **Também é do dono:** o modelo de tag, e a escolha entre cortar agora ou esperar para juntar
  mais entregas numa versão só.

O coord propõe ("vale cortar agora" ou "vale esperar o item X"), mas quem decide é o dono.

## O caminho, passo a passo

### 1. PR final da versão

Um PR traz junto, no modelo `templates/PR-RELEASE.tpl.md`:
- o código da entrega;
- a versão nova na **fonte da versão do projeto**: a `version` do `package.json`, ou a do
  `pyproject.toml`, ou o arquivo `VERSION` na raiz (repo sem stack). **Não** o `.ai/VERSION`,
  que é a versão do catálogo do Tars. A fonte e o topo do CHANGELOG têm de bater;
- a seção `## <versão>` no `CHANGELOG.md`, só com a versão no título (sem data nem texto) e com
  as 4 subseções: **O que mudou**, **Por que**, **Arquivos impactados**, **O que o consumidor faz**;
- na seção, a lista dos **bugs reportados por consumidores que a versão fecha**, com repo e data.

**Título do PR final:** `<emoji> <tipo>(<repo>): <resumo> — v<X.Y.Z[-dev.N]>`. A versão no fim do
título é o que diz ao dono que aquele merge é o aval de uma Release.

O CI do PR fica verde antes de pedir o merge.

### 2. Merge do dono

É o aval. O coord não corta tag de versão cujo PR o dono não mergeou.

### 3. Tag

O coord cria a tag `v<versão>` sobre o commit de merge: **anotada**, com a identidade do bot
(Daneel), nunca a pessoal. A tag dispara o workflow de release.

### 4. Workflow de release (a ordem é a regra)

1. **Artefatos compilados e provados onde rodam.** Cada binário roda num container da sua libc
   e arquitetura (glibc e musl; QEMU para arm64) antes de virar asset. Compilar não é provar.
2. **Imagem como candidata.** A imagem sobe só com `candidato-<sha>`. O smoke prova o
   **digest**.
3. **Upgrade real.** A versão anterior publicada é instalada num projeto e atualizada para esta;
   arquivos, guards e idempotência são conferidos (`tools/framework/tars-upgrade-real.sh`).
   Se falhar, nada é publicado.
4. **Release por último.** Só depois de tudo acima: notas geradas por `tars release-notes`
   (nunca escritas à mão; `--kind image` para quem publica imagem), assets com `sha256sums`, e
   pré-release quando a versão tem `-`.
5. **Tags de versão da imagem depois da Release.** O digest provado ganha `X.Y.Z[-dev.N]`
   (e `latest` só em versão estável). Quem lê o registro nunca vê versão sem Release.

Script do repo é chamado por `bash`/`node` no workflow, nunca pelo caminho (o bit de execução
se perde; teste `tars-workflow-scripts.test.mjs`). Actions fixadas por SHA conferido na API.

### 5. Conferência

O coord confere a Release publicada: pré-release ou não, os assets esperados, as notas com a
seção certa, a imagem por digest. "O CI passou" não basta; a prova é a página da Release.

### 6. Aviso aos consumidores

O coord manda a cada coord consumidor um texto pronto para colar: a versão e o link, o comando
de atualização, o que conferir depois e o que mudou para ele. O texto **termina sempre** com:
"Em caso de dúvida, bug ou problema, fale com o coord do <repo>."

### 7. Consumidores atualizam

- Binário: `tars self-update` (ou o asset da Release com `sha256sum -c`). Nunca compilar.
- Imagem: **sempre por digest**; quem embute outra peça (o Endurance embute o Tars) faz o bump
  dela em toda imagem nova, e já na hora quando a Release trouxer correção de segurança.
- Depois: `tars sync --upgrade`, `tars upgrade-notes --from <anterior>` e `tars doctor`.

## Quando falha

- **Falhou antes de publicar a Release:** a correção vai num PR novo e o ciclo volta ao passo 2.
  A tag **sem Release publicada** pode ser removida ou movida, porque ninguém a consumiu.
- **Release já publicada:** a tag **nunca se move**. A correção vira a versão seguinte.
- **Bug achado por consumidor:** ele reporta com repo, data e reprodução; o bug entra na
  próxima versão, e o CHANGELOG dela diz que o fechou.
- **Erro repetido é classe:** na segunda ocorrência, a correção vem com a prevenção (teste,
  gate ou passo do workflow), como o teste dos scripts chamados por `bash`.

## Quem cobra

- `release-guard` (pre-commit): mudança no que o consumidor vê sem subir a versão e sem
  CHANGELOG reprova.
- `tars doctor`, **depois da primeira tag `v*`**: CHANGELOG presente, cabeçalho só com a
  versão, seção da última tag com as 4 subseções, topo não atrás da última tag, e a fonte da
  versão do projeto existindo e igual ao topo do CHANGELOG. Sem release
  ainda, nada é cobrado.
- `tars release-notes`: cabeçalho fora do formato falha alto.
- O job `upgrade-real`: bloqueia a Release se a atualização da versão anterior quebrar.
