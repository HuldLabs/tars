---
name: segtools-writing
description: >-
  Metodologia de ESCRITA do canal de coordenação (módulo projects) — como
  escrever título, descrição e comentário de issue, com os templates de
  comentário por tipo e as regras de humanização (texto de gente, não de IA).
  Carregar ANTES de criar issue, comentar, entregar, revisar ou escrever prompt
  de worker no segtools.
---
# Escrita no canal (títulos, descrições, comentários)

Skill NOSSA, portada (Regra 1) de:
- `dotfiles/docs/atlassian-ia/artifacts/jira-writing-standards.md` — padrão de escrita de issue (tipos, seções, critérios de aceite, linkagem);
- `dotfiles/config/ai/jira-model.yaml` — `narrative_schema` (seções por tipo), `comments.required_rules`,
  `comments.template_fields`, `comments.interaction_types`;
- `dotfiles/config/ai/contracts.yaml` — `agent_activity.required_comment_fields`, `required_on_every_touch`,
  `mandatory_before_transition`, `reject_when`;
- `dotfiles/scripts/ai_agent_execution_lib.py` (`render_structured_comment`) e
  `dotfiles/scripts/ai_atlassian_agent_comment_audit_lib.py` (`evaluate_issue_comment_contract`) — o código que o dotfiles usa na integração
  com o Jira;
- humanização: `seo-expert/knowledge/classificar/skills/seo-writing/seo-page-draft-writer/references/writing-anti-ai-checklist.md` e
  `seo-expert/knowledge/classificar/patterns/content-writing/Catálogo de micro-padrões de texto com cara de IA.md`.
Lido em 2026-09-26. Evolui pelo nosso uso; não re-sincronizar por cópia.

**Estrutura por tipo (o QUE vai em cada seção) e templates de comentário por momento do fluxo: skill `segtools-sdd`.** Esta skill cuida do COMO escrever. Checklists ficam para depois (ordem do dono, 26/09).

## 1. Regras gerais (valem para tudo)
- **Português do Brasil com acentuação correta** desde a primeira versão. Nada de "nao", "descricao", "proximo".
- **Humano é humano:** o PO é `pablo`. Agentes aparecem pelo handle (`opus`, `deepseek`).
- **Fato antes de adjetivo.** Evidência objetiva vale mais que resumo genérico.
- **Uma ideia por frase**, ritmo variado, verbo direto (`é`, `tem`, `falta`) no lugar de `serve como`, `conta com`, `apresenta`.
- **Menção (`@handle`) só para handle real** — o canal recusa handle inexistente. Nome de pacote, arquivo ou comando vai em crase.
- **Data/hora em BRT** quando citada em texto.

## 2. Título
- **Verbo no infinitivo + objeto + recorte**: `Exibir a atividade do item em abas`, `Migrar atores do canal para platform.users`.
- Diz o **resultado**, não a atividade genérica (`Corrigir 404 do detalhe após merge`, não `Ajustes na tela`).
- Curto e direto, **sem id local no início** (a key `SEG-N` já identifica), sem emoji, sem ponto final, até ~80 caracteres.
- Bug: descreve o **sintoma observado** (`Board some quando o watcher reinicia o dev`).

## 3. Tipo do item (escolher antes de escrever)
- **Épico**: agrupa um contexto pequeno ou médio; sem detalhe técnico excessivo.
- **História**: regra de negócio, fluxo funcional ou entrega com valor legível (padrão card → conversa → confirmação).
- **Tarefa**: trabalho técnico, operacional, documental ou de governança.
- **Bug**: falha, regressão ou comportamento incorreto.
- **Spike**: pesquisa com prazo, benchmark, redução de incerteza. História sai de Refinando com Spike concluída; Tarefa ganha Spike quando houver incerteza relevante.
- **Subtarefa**: só decomposição de execução — nunca mecanismo de agrupamento (para isso: Épico/Parent).

## 4. Descrição (seções por tipo — `narrative_schema`)
Escreva para quem lê a issue, não para o chat: o corpo precisa bastar para alguém entender o trabalho **sem contexto externo**.
Seções como títulos `##`. Seção sem conteúdo: omitir (não escrever "N/A" em tudo).

| Tipo | Seções obrigatórias |
|---|---|
| Tarefa | Contexto · Resultado esperado · Escopo técnico · Critérios de aceite · Referências |
| História | História (card → conversa → confirmação) · Contexto · Resultado esperado · Critérios de aceite · Referências |
| Bug | Problema observado · Impacto · Resultado esperado · Critérios de aceite · Evidências |
| Épico | Contexto · Resultado esperado · Critérios de aceite (opcional: Escopo do épico, Medida de progresso) |
| Spike | Perguntas de pesquisa · Achados · Evidências · Viabilidade · Riscos · Alternativas · Recomendação · Referências |
| Subtarefa | Contexto da execução · Entrega esperada · Evidências · Dependências |

- **Contexto** = por que existe agora (quem pediu, o que revelou). **Resultado esperado** = o estado final, verificável.
- **Critérios de aceite** = verificáveis, observáveis, ligados ao resultado esperado e suficientes para QA e revisão (comando + resultado esperado, tela + comportamento). Proibido: "funcionar corretamente", critério que só repete o título, critério sem forma de validar.
- **Referências** = caminho de arquivo, commit, issue, print (`docs/reference/ux/...`).
- **Linkagem**: agrupar por Épico/Parent; link entre issues só para bloqueio, dependência, duplicidade ou relação técnica real.

## 5. Comentário (estrutura fixa — `template_fields` do dotfiles)
Todo comentário relevante segue o bloco abaixo. O cabeçalho vem dos campos do canal (autor = ator, `kind`, `status`);
o corpo em Markdown carrega o resto:

```
## Contexto
- o que aconteceu / o que foi feito, em frases curtas

## Evidências
- commit `abc1234`, comando + saída, print, teste (ou "sem evidência: <motivo>")

## Próximo passo
- quem faz o quê a seguir (handle) — ou "nenhum: encerrado"
```

Regras (`comments.required_rules` + `reject_when`):
- Comentar **ao começar**, a cada **progresso relevante**, **antes de handoff** e **ao entregar**.
- **Evidência ou justificativa explícita** em todo comentário. Rejeitado: comentário sem prova, status genérico sem contexto,
  handoff sem próximo responsável, entrega em `qa-ready` ou `fixed` sem rastro.
- **Status da issue e comentário em paridade**: se o comentário diz "entregue", a issue está em `qa-ready` (ou `fixed`, se for correção).
- Pausar exige dizer **por que parou e o que retoma**.

## 6. Templates por tipo de comentário (`kind` do canal ↔ `interaction_types` do dotfiles)

| `kind` | Quando | Conteúdo mínimo |
|---|---|---|
| `progress` (progress-update, CHECK-IN) | início e a cada ≤5 min de execução | o que já está provado · o que falta · risco |
| `question` | bloqueio de decisão | pergunta fechada, opções com trade-off, recomendação |
| `answer` | resposta a `question` | a decisão, em uma frase, e o que muda |
| `blocker` | não dá para seguir | sintoma · causa provável · quem destrava (handle) |
| `delivery` (test-success) | entrega do worker | o que mudou (arquivos/commits) · tabela `claim \| verify \| expect \| resultado` · gaps fora do escopo |
| `review` (review-feedback/approval) | revisão do coordenador ou humano | APROVADO/REPROVADO · o que foi verificado e como · correções pedidas ou aplicadas |
| `note` (technical-decision, unexpected-finding, scope-change, priority-change) | decisão, achado, mudança de escopo | a mudança · por quê · quem decidiu |
| `system` | registro automático (despacho, anexo) | só fatos da máquina |

Exemplo (`review`):
```
## Contexto
- Revisão da entrega de `deepseek` na SEG-67: abas Tudo/Comentários/Histórico.

## Evidências
- `bun run test` = 247 passed; typecheck 0 erros; lint 0 erros (worktree, 04:30 BRT).
- Corrigi o eco de "comentou" na aba Tudo e o ator duplicado (merge `4a6ea67`).

## Próximo passo
- Nenhum: revisão com PASS, issue em `qa-done` (fila de homologação do dono).
```

## 7. Humanização — o que cortar (resumo do checklist anti-IA)
Cortar sempre que aparecer:
- abertura que só repete o título; fechamento que só resume o bloco anterior;
- conectores de enchimento: "vale destacar", "nesse sentido", "é importante mencionar", "cabe ressaltar", "vale uma nuance";
- "não é só X, é Y"; trio de adjetivos; frases simétricas em sequência;
- quantificador vago ("diversos", "vários", "uma série de") onde cabe número ou exemplo;
- substantivo abstrato no lugar do termo direto ("camada", "superfície", "lógica", "leitura");
- resíduo de chat: "ótima pergunta", "espero ter ajudado", "me avise se quiser";
- negrito, crase ou lista usados como enfeite; checklist que ninguém pediu no fim de texto curto;
- nota de processo interno vazando para texto de leitura.

Texto longo (relatório, doc, descrição extensa): rascunho, revisão crítica e variabilidade completas na skill `segtools-content`.

Autoteste antes de postar: *apagando a primeira e a última frase o texto fica melhor? Alguém que faz o trabalho falaria assim?
O leitor que chega frio entende sem o contexto da conversa?*
