---
name: design-review
description: Checklist de design review e de code review pelos mantras (R1–R4, hooks, idempotência, modularidade, plugabilidade, agnosticidade, consistência declarada, carga com limite, isolamento por construção) — cada item com o teste ou o comando que prova, nunca opinião. Use ANTES de aprovar ADR, desenho, lote de worker ou PR; complementa o `security-testing` (não o repete) e o `agent-coordination/review-prompt-adversarial.md` (que confere o critério de aceite).
---

# Design review e code review pelos mantras

A régua é `.ai/rules/principles.md` (Mantras). Esta skill transforma cada mantra em **perguntas com prova**:
para cada item, a saída de um comando, um teste que falha sem o conserto, ou um arquivo:linha. Item sem prova é
**não verificado** — nunca aprovado. Notícia ruim primeiro; nada de "parece ok".

## Como usar
1. Leia o diff inteiro (ou o ADR inteiro) antes de responder — sem amostra.
2. Percorra as seções abaixo; para cada item marque **OK (prova)**, **FALHA (arquivo:linha + como reproduzir)** ou
   **N/A (por quê)**.
3. Segurança: rode os módulos do `security-testing` indicados (não copie o conteúdo deles aqui — SSOT).
4. Saída: lista de falhas em ordem de risco, cada uma com a prova e o conserto proposto; depois o que não foi medido.

## Checklist

### R1 · Já existe? (portar)
- O que a mudança cria já existe no repo, nos vizinhos ou no mercado? (grep pelo conceito, não pelo nome)
- Se portou: a lógica veio, nunca credencial, banco, host ou ambiente de outro projeto.

### R2 · KISS
- Um mecanismo para cada coisa? (dois caminhos para a mesma regra = defeito)
- Chamada sem uso do retorno, helper que só repassa, abstração sem segundo consumidor → apagar.
- O desenho cobre o que já se sabe; o que fica de fora está mapeado (tela planejada / BACKLOG), não esquecido.

### R3 · SSOT
- A regra, a lista, a constante, o texto existem em UM lugar? (literal repetido = defeito)
- Docs: a mesma informação não mora em dois documentos; o resto aponta.

### R4 · Falha rápida e alta
- Erro grita e nomeia o que faltou? `except` largo, valor padrão que esconde ausência, saída vazia lida como sucesso?
- Script de subir/medir prova pelo resultado real (código HTTP, contagem), não por "rodou sem erro".

### Hooks · Modularidade · Plugabilidade · Agnosticidade
- Quem estende acopla em quem é estendido? (import do núcleo dentro do módulo, ou o contrário)
- O módulo se testa sozinho? O núcleo conhece ferramenta, banco ou provedor do consumidor (nome de produto em dado,
  ex.: `seld:<sub>` gravado como autor)?

### Idempotência
- Install, migrate, seed, backfill, workflow: rodar de novo sem mudança não muda nada? (rode duas vezes e compare)
- Ação externa (cobrar, disparar coleta, enviar) tem chave de idempotência?

### Consistência declarada
- Cada escrita diz a garantia: transação e nível de isolamento, ou eventual + o mecanismo (outbox transacional,
  consumidor idempotente, token de consistência sem buraco)?
- Duas edições do mesmo objeto: há **lock otimista** (versão no payload, `WHERE version = :v`, 409)?
- Regra sobre o conjunto (último dono, cota, soma): há constraint, gatilho ou `SERIALIZABLE`? Teste concorrente que
  quebra sem ela.
- Teste de banco limpa SÓ o que criou, pelo caminho único de escrita; estado herdado (pai) entra no escopo.

### Carga com limite
- Toda fila, worker, LLM e rota cara tem teto e recusa explícita (429/503 com motivo)?
- Desempenho medido em p99 sob carga, dizendo LAB × LIVE? Nada de média.
- Custo de LLM: cota por pessoa/organização, limite de chamadas de ferramenta por turno.

### Isolamento por construção (rodar `security-testing`: `authz-idor`, `write-path-authz`, `client-supplied-identity`,
`injection`, `ai-code-flaws`)
- Toda rota que recebe id/endereço de objeto (caminho, **query e corpo**) passa pela porta de acesso **no código**?
  Lista nova também? (o RLS não conta como a regra; o teste de banco roda como superusuário e ignora o RLS)
- Teste de IDOR com DUAS organizações: o objeto da outra = 404, com controle positivo (o do escopo = 200).
- O autor de toda escrita é a pessoa (não o papel de banco nem o id do provedor)? A identidade vem da sessão, nunca do
  pedido?
- SQL só com parâmetro; ORDER BY/coluna dinâmica só por lista branca.
- Assistente/LLM: pedido fora do escopo é recusado com a verdade (não vira "lacuna"); ferramenta só com o principal da
  sessão; dado de terceiro no contexto é dado, nunca instrução.

### Higiene de teste e de ambiente
- Dublê troca a costura da borda, nunca a função do módulo que outros testes usam (teste que passa sozinho e falha na
  suíte = ordem; ver `root-cause-debugging` §B4.7).
- Nada de lista de tolerados, `skip`/`xfail` para esconder, ou teste que lê arquivo apagado.
- Dependências na última versão (exceção só com o motivo técnico medido); lockfile versionado.
- Worktree/branch: o trabalho está na branch e no backup (HEAD destacado = trabalho fora do backup).

## O que esta skill NÃO prova
Comportamento do modelo de LLM (isso é eval), desempenho LIVE (isso é medida em produção) e segurança de borda/infra
(isso é o `security-testing` contra os nossos hosts).
