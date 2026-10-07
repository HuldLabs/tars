---
name: segtools-retomada-29-09
description: Estado para retomar o segtools após o reinício do PC em 29/09 (manhã); não despachar até o dono liberar
metadata:
  node_type: memory
  type: project
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T13:31:54.221Z
---

Dono reiniciou o PC em 29/09/2026 (~08:30 BRT) e mandou **não despachar nada até ele liberar**.

**Ao retomar, primeiro:**
1. Commitar as edições pendentes, que já estão no disco (o commit caiu por `index.lock`):
   - `docs/adr/adr-016-atualizacao-automatica-do-board.md` (status ACEITA);
   - `docs/research/menus-e-rotas.md` (6 recomendações aprovadas).
   - Mensagem em `.cache/msg-dec.txt`.
2. Ler o resultado dos workers que estavam rodando e revisar cada um: SEG-575 (board por colunas), FIX da SEG-578 (layout da tela de colunas), SEG-582 (comentário `sizing`) e FIX da SEG-561 (print claro do card).
3. A DUPLICATED gravou resolução `canceled` na SEG-565: o mapa status → resolução da 0065 está errado para os desfechos (esperado `duplicate`). Abrir bug.

**Resultado dos 4 workers (todos terminaram antes do reinício):**
- SEG-582 e SEG-575 estão em `qa-ready`; SEG-578 e SEG-561 em `fixed`. Nenhuma revisão foi despachada. Aplicar na skill o template do `sizing` que está no delivery da 582.
- **Regressão da SEG-575 (`72086fb`)**: `columnsOf` casa `card.state` com `column.state.key`, que agora é o id da coluna. Com as **raias** ligadas, o board desenha zero cards. Tratar como FIX da 575 antes de tudo.
- Escrita de preferência caindo no escopo `view/SEG` maiúsculo: bug de escopo sensível a maiúsculas já visto na SEG-563.
- `task dev:restart` não existe (o caminho é `apps/hub/scripts/dev-restart.sh`); a CLI deu `INVALID_TOKEN` no `release` do write set.

**Limite de uso atingido (29/09, ~14h UTC). Ao retomar, primeiro:**
1. A SEG-580 foi reprovada pelo DONO na homologação: não usa o componente do board e não tem paridade visual nem funcional. Eu mesmo (Chrome, somente leitura) meço a tela do Jira https://pabloaugusto.atlassian.net/jira/software/c/projects/NX/boards/138/settings/columns: fontes, ícones, tamanhos, espaçamentos, tokens de cor, CSS, comportamento JS do drag, payloads e chamadas HTTP. Gravo em `docs/reference/ux/board-columns-config/medidas-jira.md` e só então despacho o FIX. Aba do Chrome aberta: tabId 1992228749.
2. Ler o resultado dos workers: FIX da SEG-576, SEG-608 (Responsáveis), SEG-604 (status legados), lote A4 (o A2 terminou).
3. O dono ainda não aprovou o reagrupamento dos épicos + o épico novo "Identidade e auditoria dos agentes" + o bug do `create_issue` ignorar `parent`.

**Pendente de escrever no canal quando o MCP `projects` voltar:**
- Mover a SEG-297 (aba Backlog) para o épico SEG-564, logo depois da SEG-580.
- Comentar na SEG-297 a regra do dono: a aba Backlog mostra o Kanban backlog **mais a primeira coluna do fluxo** ("Selected for Development"), com prints em `docs/reference/ux/backlog-kanban/`.
- Commitar `docs/reference/ux/backlog-kanban/`, `board-columns-config/`, `seg-576/` e `checklist-paridade/README.md`.
- Abrir bug do checklist: a seta ˅ tem que abrir o menu de STATUS (como o Jira) e hoje abre o histórico de edições. Spec no README de `checklist-paridade` (§Seta ˅).
- Criar a story "Sidebar do detalhe editável em todos os campos (Responsáveis com Assign to me, Tipo, Prioridade...)", com spec em `docs/reference/ux/sidebar-editavel/README.md`. Reusar o combobox de pessoas. Prioridade alta: o dono não consegue se atribuir.
- Despachar o FIX da SEG-576 (zonas como caixas tracejadas) quando a SEG-580 terminar (`.cache/prompts/fast-fix576.md`).
- Abrir bug: `lib/store/store.test.ts` AC-03 está vermelho no main. O worker da SEG-582 atribuiu a arquivos da SEG-542/SEG-578; falta confirmar.
- **Corrigir a descrição da SEG-297:** a aba Backlog NÃO tem chave de liga/desliga. Ela ativa quando o status inicial é arrastado para a área Kanban backlog na tela de colunas (depende da SEG-580). Epic work items é um rádio à parte. Detalhes no README de `backlog-kanban`.

**Decisões do dono em 29/09:**
- Aprovadas: B1 (ADR-016, polling de 3 s), B3 (mapa de rotas), B4 (apagar status `delivered`/`reviewed`), A3, A4, A5 (probe em `.cache/gate-probe/<id>/`), A6, A7 (SEG-590 bloqueante).
- Adiadas: A8, B2 (aprovação da SEG-540), C4 (fila `qa-done`).
- A1 ainda aguarda: corte por 5 min de inatividade + teto de 25 min + fechamento automático.
- C3: o dono nunca mexeu em `docs/reference/ux`; os prints apagados vieram de workers. A SEG-573 deve investigar e restaurar o que foi apagado por engano.

**Fila acordada (épico SEG-564):**
1. Tooling: SEG-539, 532, 533, 541, 590.
2. SEG-576 → 580 (mesmo componente de drag do board) → 579.
3. SEG-584 → 585, 587, 588 → 583, 586, 589 → SEG-549..555 (refresh do board) → SEG-577 (key e tags do card).

Relacionado: [[prazo-10-mais-5-recorte]], [[skill-so-coordenador]].
