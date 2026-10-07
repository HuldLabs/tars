---
name: segtools-sdd
description: >-
  Pacote SDD (Spec-Driven Delivery) do segtools — templates de DESCRIÇÃO de
  issue por tipo/intenção (tema, iniciativa, épico, história, tarefa, bug,
  spike, subtarefa), regras de critério de aceite falsificável, fronteira de
  escopo e templates de COMENTÁRIO por momento do fluxo (progresso, QA pronto,
  veredito, homologação, desfecho, defeito de processo, recorrência). Carregar
  ANTES de criar, refinar, fazer backfill ou comentar qualquer issue no canal
  (módulo projects).
---
# Pacote SDD — descrição e comentários de issue

Skill NOSSA. Origem (Regra 1), lida em 2026-09-26:
- `farmega.v2/.ai/patterns/sdd/jira-description-templates.md` — templates por tipo e regras gerais (núcleo desta skill);
- `farmega.v2/.ai/patterns/sdd/comment-templates/*.md` — 8 templates de comentário;
- `farmega.v2/.delivery/templates/{task,bug,epic,spike,subtask}` — pacote por tipo (checklists DoR/AC/DEL/DoD/GAT, design, verificação);
- `dotfiles/config/ai/jira-model.yaml` (`narrative_schema`) e `dotfiles/docs/atlassian-ia/artifacts/jira-writing-standards.md`
  — seções de Bug e Spike, escolha de tipo.

Escrita (tom, humanização, título): skill `segtools-writing`. **Esta skill diz O QUE vai em cada seção; aquela diz COMO escrever.**

**O runtime existe desde a SEG-90** — esta skill deixou de ser só texto. O plugin de SDD
(`modules/projects/plugins/sdd/`) implementa o que está aqui: o preset das abas (DoR, AC, DEL, DoD, GAT,
com os status do farmega e o fechamento restrito aos papéis que fecham cada aba), os templates de
descrição por tipo (§3) e os templates de comentário por momento do fluxo (§4/§6).

**Critérios de aceite e entregáveis saem do corpo.** O SDD vive em abas (checklist) — e a regra do
farmega é *nunca nos dois lugares*. O que muda na prática:

- item novo nasce com a descrição do template do tipo;
- item que já tem `## Critérios de aceite` / `## Entregáveis` no corpo passa pela migração
  (`migrate_sdd_ac_del` no MCP, com `dryRun`): o que sai do corpo vira item das abas AC/DEL e o corpo
  fica com o ponteiro;
- o fechamento de uma aba é dos papéis que a fecham (o agente não fecha AC sozinho) — regra
  `BR-PROJ-027`, declarada no plugin e enforçada na config da checklist.

Esta skill continua sendo o O QUE vai em cada seção (e o porquê). O plugin é o COMO em runtime;
divergir dos dois é defeito de um deles — a fonte canônica segue sendo este arquivo.

## 1. Regras gerais (valem para toda descrição)
- PT-BR, Markdown com títulos `##` reais, linha em branco entre blocos; tabela quando melhora a leitura.
- A descrição define a **fronteira de aceite** — não narra a sessão, não é relatório de fila. Telemetria de execução vai
  em **comentário**.
- O que já é campo da issue (responsável, status, prioridade, pai, tipo) **não se repete** no corpo.
- `Escopo da demanda` é o título do escopo, com `### Fora do escopo` dentro dele.
- `Principais riscos e dependências` vem **antes** dos critérios de aceite (o leitor vê as restrições antes de julgar o fechamento).
- **Critério de aceite objetivo e falsificável:** diz o que será operado, observado ou inspecionado e em qual superfície
  (rota, comando, arquivo, tela). Proibido: "fica claro", "faz sentido", "funciona corretamente" sem dizer como se verifica.
  Escreva de trás para frente: *que parâmetros, ações, asserções e evidência um teste precisaria?* Se não vira teste plausível,
  está vago.
- Quantidade de critérios é a que a fronteira pede — não existe "3 por issue". Numeração local começa em `01`.
- História usa **Gherkin** (Dado / Quando / Então) nos critérios.
- Arquivo ou pasta conhecidos com confiança: nomeie o caminho real.
- **Critério de aceite que cria ou altera uma regra de negócio exige o marcador.** Se a fatia decide uma política do
  domínio (limite, prazo, autorização, o que a operação garante), o aceite tem de dizer **onde** a regra fica declarada
  (`BR-<MODULO>-<NNN>`, no ponto de decisão) e que o catálogo foi regerado — e, se ela toca o banco, que o id está no
  `COMMENT ON`/nome do objeto **na migration**. Convenção completa: `docs/STANDARDS.md` §12; gerar/verificar:
  `task rules:catalog` · `task rules:check`. Regra sem marcador não passa o gate.
- NFRs (performance, segurança, observabilidade) moram no **Épico**; os filhos referenciam ("NFRs: ver SEG-N").
- `Fontes que embasaram` (de onde veio a demanda) ≠ `Rastreabilidade` (âncora estrutural: spec, ADR, doc canônico).
- Evidência de QA/revisão/homologação é **prova explícita** (teste, log, print, diff, comando). Afirmação de humano ou agente
  sozinha não basta.
- Fechamento (`## Metadados`) fica **no fim**: tabela `Campo | Tipo | Valor`.

## 2. Escolha do tipo (intenção)
| Intenção | Tipo |
|---|---|
| Valor para usuário/operador com persona real e aceite revisável | **História** |
| Trabalho técnico, operacional, arquitetural, de governança ou processo, sem persona | **Tarefa** |
| Algo que funcionava e quebrou / comportamento incorreto | **Bug** |
| Incerteza a reduzir antes de executar (pesquisa, benchmark), com prazo | **Spike** |
| Agrupar um contexto com meta de valor e filhos | **Épico** |
| Fatia executável de um pai, com write set próprio | **Subtarefa** |
Uma issue que mistura mais de uma fronteira honesta de aceite **vira duas irmãs** — não force um texto único.

## 3. Templates de descrição

### Tarefa
```markdown
## Objetivo técnico
<intenção da fatia, sem persona>

## Fontes que embasaram esta demanda
- [interna] <caminho no repo ou doc> — <por que importou>
- [externa] <url> — <por que importou>

## Escopo da demanda
- <escopo 1>
- <escopo 2>

### Fora do escopo
- <não objetivo 1>

## Principais riscos e dependências
- <risco ou dependência (SEG-N)>

## Critérios de aceite
- AC-01 — <o que se opera/observa> em <superfície> resulta em <resultado verificável>

## Entregáveis
- DEL-01 — <arquivo/artefato concreto> (criar | alterar | remover)

## Metadados
| Campo | Tipo | Valor |
| --- | --- | --- |
| Camada | Classificação SDD | <kernel | platform | module | theme | app | tooling | docs> |
| Domínio | Classificação SDD | <domínio> |
| Risco | Classificação SDD | <baixo | médio | alto> |
| Fonte canônica | Rastreabilidade SDD | <doc/ADR/spec> |
```

### História
```markdown
## História
- Persona: <persona específica>
- Comportamento esperado: <ação concreta>
- Valor esperado: <valor mensurável>

## Declaração de conclusão
<uma frase com a fronteira de aceite>

## Escopo da demanda
- <escopo>

### Fora do escopo
- <não objetivo>

## Principais riscos e dependências
- <risco ou dependência>

## Critérios de aceite
- AC-01
  - Dado <contexto>
  - Quando <ação>
  - Então <resultado observável>

## Metadados
| Campo | Tipo | Valor |
| --- | --- | --- |
| Domínio | Classificação SDD | <domínio> |
| Risco | Classificação SDD | <risco> |
| Fonte canônica | Rastreabilidade SDD | <spec> |
| NFRs herdados | Rastreabilidade SDD | ver <SEG-épico> |
```

### Bug
```markdown
## Problema observado
<o que acontece, onde, desde quando — sintoma, não hipótese>

## Como reproduzir
1. <passo>
2. <passo>
Resultado atual: <o que se vê> · Resultado esperado: <o que deveria>

## Impacto
<quem é afetado e quanto; contorno existente, se houver>

## Escopo da demanda
- <correção pretendida>

### Fora do escopo
- <o que não será mexido>

## Principais riscos e dependências
- <risco de regressão, área compartilhada>

## Critérios de aceite
- AC-01 — o passo de reprodução deixa de gerar <sintoma> e passa a gerar <esperado>
- AC-02 — teste que reproduz o bug falha antes da correção e passa depois (<arquivo de teste>)

## Evidências
- <print, log, commit, issue relacionada>

## Metadados
| Campo | Tipo | Valor |
| --- | --- | --- |
| Domínio | Classificação SDD | <domínio> |
| Risco | Classificação SDD | <risco> |
| Origem | Rastreabilidade SDD | <onde foi achado: revisão, uso, teste> |
```

### Spike
```markdown
## Perguntas de pesquisa
1. <pergunta fechada que a spike responde>

## Prazo
<até N horas; ao estourar, entrega o que achou>

## Fontes a consultar
- <benchmark (Fabber, dotfiles, farmega, seo-expert), doc oficial, repo>

## Escopo da demanda
- <o que investigar>

### Fora do escopo
- <não implementar>

## Critérios de aceite
- AC-01 — cada pergunta tem resposta com fonte citada (caminho ou URL)
- AC-02 — recomendação única com alternativas, riscos, custo e ganho esperado

## Metadados
| Campo | Tipo | Valor |
| --- | --- | --- |
| Destrava | Rastreabilidade SDD | <SEG-N que espera esta resposta> |
```
Achados, viabilidade, riscos, alternativas e recomendação entram no **comentário de entrega** da spike.

### Tema
Nível 3. Agrupa iniciativas por área permanente do produto; muda pouco. Exemplos: SEG-207..209.
```markdown
## Objetivo
<área permanente do produto e por que ela existe>

## Iniciativas
- <KEY> — <iniciativa>

## Critério de pronto
- <quando o tema deixa de precisar existir ou é revisto>
```

### Iniciativa
Nível 2. Resultado de negócio que agrupa épicos e, quando é do contexto dela (não um projeto derivado), histórias/tarefas diretas (ADR-015). Exemplos: SEG-184..189.
```markdown
## Objetivo
<resultado esperado>

## Épicos
- <KEY> — <épico>

## Itens diretos
- <KEY> — <história/tarefa do contexto da iniciativa>

## Métricas
| Indicador | Valor atual | Valor alvo | Prazo |
| --- | --- | --- | --- |

## Critério de pronto
- <condição verificável>
```

### Épico
```markdown
## Problema
<problema com impacto mensurável>

## Hipótese de valor
- <hipótese>

## Métrica de sucesso
| Indicador | Valor atual | Valor alvo | Prazo |
| --- | --- | --- | --- |
| <kpi> | <atual> | <alvo> | <data> |

## NFRs herdados por todos os filhos
- Performance: <limite>
- Segurança: <política>
- Observabilidade: <sinal>

## Escopo da demanda
- <escopo>

### Fora do escopo
- <não objetivo>

## Principais riscos e dependências
- <risco>

## Critério de encerramento do épico
- <sinal de encerramento>
```
Épico permanente: dizer no critério de encerramento que ele vive enquanto a plataforma existir.

### Subtarefa
Título: `<verbo no infinitivo> <objeto técnico> <recorte>` (ex.: `Escrever teste int do dry-run do lote`).
```markdown
## Objetivo da fatia
<fatia de execução delimitada>

## Saída esperada
- <saída>

## Write set esperado
| Arquivo / superfície | Operação |
| --- | --- |
| <caminho> | criar | alterar | remover |

## Validação desta subtarefa
- <comando + resultado esperado>

## Limites da fatia
- <no que ela não pode crescer>

## Dependências imediatas
- <SEG-N>
```

## 4. Templates de comentário (por momento do fluxo)
Estrutura base (Contexto · Evidências · Próximo passo) vem da `segtools-writing` §5. Estes são os recortes por momento;
o `kind` do canal vai entre parênteses.

| Momento | Conteúdo |
|---|---|
| **Progresso** (`progress`) | Status atual · Feito desde o último update (itens verificáveis) · Próximo passo (ação + handle) · Bloqueios (nenhum ou concreto) |
| **Pronto para QA** (`delivery`) | Resumo da entrega em uma frase · Evidências no trio claim · verify (comando) · expect (literal) (regra: `docs/AGENT-CONTRACT.md` §AI-A1; template: `segtools-writing` §6; no canal, o campo `validation`) · Critérios cobertos (`AC-01`…) · Riscos/atenção |
| **Veredito de revisão** (`review`) | PASS \| FIX \| BLOCKED · Base verificada (comandos, diff, arquivos lidos) · Achados (prioridade — achado com caminho/linha) · Próximo status |
| **Veredito de escrita** (`review`) | PASS \| FIX · Checagens (markdown, ortografia, links) · Evidência · Correções pedidas |
| **Homologação** (`review`, só humano) | APROVADO \| FIX \| BLOCKED · Escopo aceito (ACs e entregáveis) · Evidência de paridade (status do board = comentário = artefato) · Próximo status |
| **Desfecho** (`note`) | Desfecho: concluído \| não fazer \| cancelado \| duplicado \| não reproduz · Razão com evidência · Artefatos finais · Lições/seguimento |
| **Defeito de processo** (`note`) | Defeito objetivo · Impacto (verdade/telemetria, runtime, revisão/escrita, fronteira/tamanho, higiene, docs, automação) · Correção local · Vira regra permanente? sim/não + razão |
| **Sinal de recorrência** (`note`) | Padrão observado · Ocorrências (SEG-N) · Nota 0–3 em impacto, recorrência, alcance, recuperação, risco de verdade · Destino: corrigir local \| issue filha \| atualizar regra/template |

Regras do farmega mantidas: quem executa **não fecha** o critério de aceite sozinho — o DEV entrega na fila (`QA: Ready`;
numa correção, `FIXED`, que volta para o QA e não para `QA: DONE`); o revisor puxa e dá PASS (`QA: DONE`) ou FIX
(`FIX: NEEDED`); o **coordenador não fecha nada** e `Done` é do humano (dono), a partir de `HOMOLOG: DOING`.

## 5. Backfill (reescrever issue antiga no modelo)
- Preserva a intenção original; reescreve na estrutura nova; **não amplia escopo em silêncio**.
- Issue com duas fronteiras de aceite → divide em irmãs.
- Proveniência do backfill vai em comentário, não no corpo.
- Não copia para o corpo o que é campo; não embute telemetria (run id, confiança, status vivo) na descrição.
- Fluxo de execução em lote: plan → dry-run (diff revisado pelo `pablo`) → apply idempotente (SEG-86).

## 6. Protocolo do canal (portado do Jira do tokenhood + dotfiles, 26/09)
Fontes: `tokenhood/.ai/governance/workflows.md` (§Pull-based flow, §Factual pull reconciliation, §WIP, §Kanban WIP limit,
§Material process defect, §Self-reporting failure, §Active statuses by lane, §Focus-switch path, §Atlassian write path),
`tokenhood/.ai/patterns/atlassian/comment-templates/` (base, start-or-resume, pause-or-block, recovery, process-defect…),
`dotfiles/config/ai/contracts.yaml` (`agent_activity`). O farmega herdou do tokenhood; aqui entra o que faltava.

**Fluxo puxado.** Quem entrega não ativa o próximo: só move para a fila certa. O próximo papel **puxa**: atribui a si,
comenta como si, e só então trabalha. Fila (entregue, bloqueado, pausado) **não tem dono**; status ativo (em andamento) **tem**.

**Reconciliação antes de puxar.** Antes de tratar uma issue da fila como trabalho novo: reler a issue no canal, confirmar que
ela ainda está na fila que a tornou elegível e olhar repositório/runtime para ver se o trabalho já aconteceu sem espelho no
canal. Se aconteceu, **corrige o canal primeiro** (comentário de recuperação) e não refaz.

**WIP.** Um item ativo por papel/worker. Limites do board (padrão): em andamento ≤ nº de workers vivos; entregue (fila de
revisão) ≤ 3. Idade do WIP é métrica.

**Troca de foco.** Antes de mudar de item: comentário com o motivo e o ponto exato de retomada → `pausado` (perdeu prioridade)
ou `blocked` (impedimento real) → tirar o responsável → só então ativar o próximo.

**Contexto do próximo papel vem do último comentário de handoff na issue**, não de um prompt longo reescrito. Handoff faltando
ou raso é defeito de processo e se reporta antes de continuar.

**Papel atual e próximo papel** (campos `current_agent_role` / `next_required_role`, quando a SEG-81 existir): status ativo
mantém o papel atual; fila e terminal limpam. Ao entregar numa fila, preencher o próximo papel; quem puxa limpa.

**Prefixo de papel** no comentário: `[DEV]`, `[REVIEWER]`, `[COORDENADOR]`, `[PO]` na primeira linha (sem horário).

**Seção de artefatos.** Se a rodada entregou ou validou artefatos, nomeá-los numa seção própria com caminho real; o resto do
comentário aponta para ela em vez de repetir a lista.

**Templates extras** (além do §4): *Início ou retomada* (o que mudou · foco e superfícies da rodada · motivo do status ·
próximo passo · evidências) · *Pausa ou bloqueio* (ponto seguro de parada · entregáveis até ali · motivo · condição de
retomada) · *Recuperação* (depois de reinício/perda de contexto: escopo recuperado · estado verdadeiro com evidência).

**Defeito de processo material** — afeta a verdade do canal (status, responsável, papel), a evidência exigida (handoff,
validação), o transporte/runtime ou a integridade de papel/gate. Fazer, na mesma rodada: (1) corrigir o estado; (2) comentário
de defeito de processo na issue afetada; (3) se já existe regra/issue permanente do tema, sinal de recorrência lá.
**Não se autodenunciar sem ser lembrado é um segundo defeito** (`self_reporting_failure`).

**Bypass** de checkpoint obrigatório só com autorização explícita do `pablo`.

## 7. Liberação para trabalho — ordem de criação e Definition of Ready (portado do farmega, 26/09)
Fontes: `farmega.v2/.ai/patterns/sdd/creation-order-and-readiness.md` e `definition-of-ready-by-type.md`.

**Ordem de criação (cada passo é pré-requisito do seguinte):** épico classificado → intenção/escopo → história ou tarefa
(`rascunho` → `refinada` → `validada`, isto é, UMA fronteira aceita) → critérios de aceite (só depois de validada, escritos a
partir da verificação) → entregáveis concretos → DoR/DoD/gates → subtarefas (só dividem execução; escopo novo = issue irmã).

**Antes de criar (preflight, DOR-00; portado de `dotfiles/docs/ai-operating-model.md` §3.3, 29/09):** nenhuma demanda nasce sem dois passos registrados:
- **(1) Duplicata:** rodar `search` no canal pelo título e por 2 ou 3 termos do tema. Se já existir item aberto equivalente, não criar: comentar no existente ou dizer por que ele não serve.
- **(2) Pai:** achar o épico ou agregador aberto que cobre o tema e ancorar a demanda nele com `edit_issue({parent})`, porque o `create_issue` ignora o campo (SEG-623). Se não houver épico aderente, criar o épico ANTES do filho (G1).

Bypass só com justificativa em comentário (busca feita, item avaliado, motivo). O coordenador executa; o revisor confere a evidência (busca + `parent_id`). Fonte: `docs/research/regra-antes-de-criar-demanda.md`. A versão com IA é a SEG-640.

**Gates que bloqueiam pular etapa:** G1 sem épico classificado não nasce filho · G2 sem história validada não se escreve AC ·
G3 sem AC não há entregável/DoR · G4 sem pai sólido não há subtarefa · G5 nada de placeholder (`TBD`, "a definir", "ajustes
necessários", "doc explicando").

**Entregável concreto:** `<tipo de artefato>` em `<caminho real>` contendo/implementando `<conteúdo>`, com
`Validação exigida: QA | DOC | QA+DOC | PO`.

**Liberar para trabalho (`refinando` → `ready`) é ato só do coordenador/PO**, e só com o DoR do tipo inteiro cumprido. Worker
não puxa item que não está em `ready`. Enquanto o plugin de checklist não existir, o DoR vai numa seção `## Definition of Ready`
da descrição, item a item (`DOR-01…`), e o coordenador confere antes de mover para `ready`.

**DoR comum (todo item executável):** pai/épico classificado · descrição no template do tipo (objetivo, escopo, fora do escopo) ·
contexto do domínio nomeado (skills e docs que o worker precisa) · fontes reais (caminhos, links) · tipo de ciclo declarado
(`mecânico | sensível a design | bloqueado`) · **fatiado** pelos gatilhos do §8 (nenhum gatilho ativo).

**Anexos (ordem do dono, 02/10):** todo print, link ou insight que o dono mandar sobre a demanda vira **anexo da issue**
(`attach`) no mesmo passo em que ela é criada ou atualizada — `kind: reference` para referência externa (Jira, outro
produto), `kind: evidence` para bug ou estado do nosso sistema, `kind: link` para URL. O arquivo mora em
`docs/reference/ux/<tema>/` com linha no README; o anexo é o que liga a prova à demanda. Arquivo salvo no repo sem
anexo na issue é DoR incompleto.

**Incremento por tipo:**
- **Qualquer item de tela do módulo Projects:** referência de UX do Jira anexada (prints em `docs/reference/ux/jira-dot/` + o que muda e por quê) — regra do `segtools-frontend`.
- **Tarefa:** entregáveis com caminhos reais · teste declarado (comando + arquivos) quando produz código · write set e caminhos proibidos.
- **História:** persona + comportamento + valor · AC em Gherkin · NFRs do épico referenciados.
- **Bug:** reprodução determinística (passos, ambiente, versão) · evidência (log, print, diff) · esperado × observado · **teste de
  regressão vermelho** antes da correção · severidade.
- **Spike:** pergunta + prazo · saída = decisão registrada (ADR/relatório), nunca código de produção · caminho do artefato.
- **Subtarefa:** fronteira do pai validada · write set · limites da fatia · dependências.

Trava técnica disso: SEG-94 (transição para `ready` recusada sem o papel de coordenador/PO e sem o DoR do tipo).

**Checklist de renomeação em massa** (entra no DoR e na revisão de toda issue que troca nome/namespace/prefixo; regra
completa no `AGENTS.md` §5):
- REN-01 — padrão exato declarado na issue (token + superfícies: import, `paths`, `package.json`), nunca a palavra solta.
- REN-02 — exclusões listadas: locks/hash/cifrados, migrations aplicadas, identidades de dado, handoffs, arquivos de outra frente.
- REN-03 — simulação com contagem por token anexada ao comentário antes de aplicar.
- REN-04 — árvore limpa ou worktree própria; commit com pathspec explícito.
- REN-05 — prova depois: `task verify:lock`, typecheck e `task check` completo (int + e2e de login).

## 8. Fatiamento de demandas (aprovado pelo dono em 29/09/2026)
Estudo e fontes: `docs/research/fatiamento-de-demandas.md` (Humanizing Work, SPIDR, Elephant Carpaccio, DORA, Parallel
Change, METR). Regra: **sempre fatiar; demanda grande não entra em `ready`.**

**Gatilhos — qualquer um obriga a fatiar antes de `ready`:**
- estimativa de worker acima de 10 min (ou humano acima de 1 dia);
- mais de uma fronteira de aceite (vira irmã, §2);
- write set previsto acima de ~15 arquivos de código (troca mecânica via `tools/framework/rename.py` é exceção declarada);
- um "e" ligando duas entregas no título ou no objetivo;
- infra viva junto com código (infra é singleton: fatia própria);
- incerteza que impede estimar → **spike** antes.

**Ordem de corte (tentar nesta ordem):**
1. Spike com prazo (saída = decisão ou medição, nunca código de produção).
2. Versão mais simples de ponta a ponta; variações viram irmãs.
3. Um caminho, uma regra ou um tipo de dado por fatia (SPIDR).
4. Ler antes de escrever (operações).
5. Adiar performance/segurança extra quando o funcional já é verificável (o NFR do épico vale no fim).
6. Técnico sem usuário: **expand → migrate → contract**, por pacote/superfície (`packages/*` → `modules/*` → `apps/hub`).
   Sem legado: o contract é a **fatia seguinte**, nunca fica para depois.

**Critérios da boa fatia (o coordenador confere antes de `ready`):**
- INVEST, com teste forte: AC com comando/superfície de prova;
- vertical quando há usuário; reversível quando é técnica;
- write set declarado e disjunto das fatias paralelas;
- cabe em 10 min de worker, checkpoint em ~5;
- o critério de aceite **cabe no prazo**: prova pelo teste do item, não pela suíte inteira; `task check` completo só uma vez no fim, e vermelho novo fora do escopo vira irmã (SEG-679: o AC "task check exit 0" levou o worker a 20 min investigando colisão de banco);
- vale sozinha: se só ela sair, entrega valor ou prova algo;
- irmãs de tamanho parecido;
- traz os fatos que precisa (arquivos, decisões, skills) — sem eles o agente inventa.

**Quem fatia:** o coordenador/PO no refinamento. O worker que estoura 10 min aplica o recorte 10+5 e **abre a irmã** com o
resto. Fatia é **subtarefa com número sequencial** do pai (nunca sufixo de letra); a ordem vai no título (`fatia 1/3`) e em
links `blocks`.

**Métricas:** % de fatias fechadas no prazo (alvo ≥ 80%) · mediana de arquivos por commit · recortes 10+5 por semana
(subindo = refinamento fatiando pouco).

**Agente que cobra (futuro):** preflight da SEG-640 aplica os gatilhos e sugere os cortes na criação e no `ready`.
