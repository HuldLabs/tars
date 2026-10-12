# Prompt de worker do segtools — MODELO VIVO

Base: `worker-prompt-template.md` (Fabber, cópia fiel ao lado). Este arquivo guarda **só o que o segtools
acrescenta** e cresce a cada erro. **Regra do dono (2026-09-26):** todo erro de coordenação (meu) ou de
execução (worker) vira, no mesmo ciclo, uma linha no Registro abaixo **e** uma mudança no Esqueleto — para
não se repetir. Commit com `📝 docs(coord): prompt vivo — <erro>`.

## Esqueleto obrigatório (além das seções 1–11 do template Fabber)
- **Contrato de progresso:** commit a cada passo provado (nunca um commit grande no fim); **prazo explícito**
  (**tarefa de 5–10 min**; maior = dividir; `até N min; se travar >5 min num erro, commite o provado e escreva PERGUNTA:`); registrar no corpo do commit
  o tempo gasto no passo.
- **O aceite é a PROVA que o coordenador reproduz — não o atalho.** O `delivery` só vale com o comando
  **completo** (`cd <pasta> && <cmd>` quando não roda da raiz) e a **saída real** (exit code + a linha que prova),
  que o coordenador **reproduz antes de aceitar** (B3.3; "verde" que ninguém repete não é entrega). Reprova como
  prova: `--check`/`--dry-run`/`--help` no lugar do fluxo real; asserção de **string** onde cabia **comportamento**
  (ex.: grep no fonte em vez de exercitar a função); "rodei o teste" sem o comando; tela por `curl`/status HTTP em
  vez do navegador. **Teste que reproduz o defeito primeiro, corrige depois** (R4) — e a prova mostra o ANTES
  vermelho e o DEPOIS verde.
- **Doc oficial citada ANTES de criar/ajustar receita.** Receita/procedimento de ferramenta externa (build, deploy,
  migração, SDK, CLI) só entra depois de ler a **doc/CLI oficial da versão pinada** — não da memória nem de exemplo
  de blog. O `delivery` cita o link/versão lida; sem isso a receita é suposição (B3.3).
- **Check-in por relógio real:** linha `CHECK-IN:` a cada **≤5 min** e em todo marco/desvio/bloqueio.
- **Board reflete o real (SDD, ordem do dono 26/09) — o worker opera a própria issue pelo MCP `projects`:**
  - **Puxar (fluxo puxado, nunca empurrado):** o despacho deixa sua issue em `ready`, sem dono. Quando começar de fato — antes de
    editar qualquer arquivo —, reconcilie (`get_issue`; o trabalho já foi feito?) e **puxe**: `move in-progress` + `assign <seu handle>`
    + comentário `progress` de entrada (`[DEV]`, o que vai fazer, write set, prazo).
  - **Readback obrigatório:** depois de todo `move`/`assign`, `get_issue` e confirmar status e owner. **Comentário nunca declara
    estado que o canal não mostra** (real, 26/09: worker escreveu "in-progress, owner deepseek" sem ter movido; o board ficou em Ready).
  - **Progresso:** comentário `progress` a cada ≤5 min e em todo marco (feito desde o último, próximo passo, bloqueios).
  - **Bloqueio/pausa:** comentário `blocker` com causa e o que destrava + `move blocked` e `assign` sem handle (fila sem dono).
  - **Entrega (handoff):** comentário `delivery` (Contexto · Evidências · Próximo passo + tabela `claim | verify | expect | resultado`)
    → `move qa-ready` (ou `fixed`, quando a rodada atende um `fix-needed`) → `assign` sem handle (fila não tem dono). Status e comentário sempre em paridade.
  - **Nunca** `qa-done` (é do revisor, no PASS de um `qa-doing`) nem `done`/`homolog-doing` (é do `pablo`). `BACKLOG.md` só com o canal fora (contingência).
  - Texto dos comentários: skills `segtools-writing` + `segtools-sdd` §4.
- **Segredos e dados sensíveis — nunca ler, nunca expor (ordem do dono 26/09; incidentes repetidos).** Vai no prompt
  como bloco próprio, em destaque, com estas linhas literais:
  - Segredo só entra como **variável de ambiente injetada** por `node /workspace/tools/framework/secrets.mjs exec -- <cmd>`. Você usa o
    efeito (o comando conecta), nunca o valor.
  - **Proibido**, dentro ou fora do `secrets.mjs exec`: `env`, `printenv`, `export` sem argumento, `set`, `declare -p`,
    `echo $VAR`, `cat`/`grep`/`head` em `.env*`, `*.sops`, `*.key`, `~/.ssh`, `~/.config/sops`, e shell aninhado
    (`bash -c`, `sh -c`) carregando segredo — foi assim que vazaram 5 segredos em 26/09.
  - Não copie para log, comentário, commit, arquivo, teste ou saída de comando: tokens, senhas, chaves, connection strings,
    cookies/sessões, e-mails/nomes/documentos de pessoas reais ou dados de cliente. Em evidência, mascare (`***`, `a…z`).
  - Precisou provar que um segredo existe? `test -n "$VAR" && echo ok` — nunca o conteúdo nem o tamanho.
  - Viu um segredo na tela por acidente? Pare, **não repita o valor**, escreva `BLOQUEIO: segredo exposto em <onde>` e
    espere o coordenador. Nunca "conserte" apagando rastros.
- **Sessão no hub = assinatura na auditoria (SEG-525).** Toda escrita no canal pelo hub vira o handle do usuário
  **logado** (`requireChannelActor`, `apps/hub/lib/projects-server.ts`): o corpo da requisição nunca diz quem é.
  Entrar no hub com a **sessão ou a credencial do dono** assina a ação como ele — evento #3877 da SEG-1: `pablo`
  moveu `pausado → in-progress` em 28/09 13:17 BRT sem o dono ter movido. **Proibido** para agente: a checagem de
  tela entra com o usuário de teste do seed (`e2e@segtools.local`) ou com o próprio ator. Precisou de tela que só
  a conta do dono abre? Então a checagem não acontece: registre a falta no comentário em vez de usar a sessão dele.
- **Comentários no código (docs/AGENT-CONTRACT.md §Referências):** pendência = `TODO(KEY)` com KEY do BACKLOG; fonte = `@see <docs/..|ADR-N|URL>`; também `FIXME`/`HACK`/`NOTE`. Nunca tag inventada (`REVISITAR`, `@ref`…). Pendência nova no código ⇒ linha no BACKLOG com a mesma KEY.
- **Canais:** perguntas/bloqueios = `PERGUNTA:` / `BLOQUEIO:` no texto (o coordenador lê a timeline); correções
  chegam como "MENSAGEM DO COORDENADOR" e têm prioridade.
- **Fontes fora do container:** o devcontainer NÃO vê os repos do WSL (farmega, dotfiles, seo-expert). O
  coordenador cola no prompt os trechos necessários; nunca mandar o worker "ler" um caminho que ele não alcança.
- **"Não tenho acesso" só com o caminho testado (ordem do dono 11/10).** Worker que declara falta de acesso sem
  ter exercitado o caminho da **Daneel** (skill `.ai/skills/daneel/SKILL.md`) tem o bloqueio recusado: o acesso
  de automação não é o seu — é o do bot. Antes de escrever `BLOQUEIO: sem acesso`, teste o caminho real e cole a
  saída: `gh api user --jq .login` (tem de ser `daneel-bot`), `.cache/daneel-ssh.sh <host> true` (host do
  inventário `acessos/daneel.md`), `op vault list`. Só depois de o caminho **falhar de verdade** o "não tenho
  acesso" vale — e ele nomeia o comando e a saída, não a impressão.
- **Ambiente do worktree:** o `node_modules` do worktree é **pasta REAL**, instalada pelo dispatch com `bun install --frozen-lockfile --backend=copyfile` — confira com `ls -la` ANTES do primeiro teste; **se for symlink, `BLOQUEIO:`** (symlink some o isolamento entre worktrees; não copie/mova centenas de MB — o dispatch reinstala). Teste lento ou falhando só no worktree: compare com o checkout base antes de mexer em código. **Nunca `sleep` de espera:** comando longo vai em segundo plano e você segue trabalhando;
  rodar tudo no container; commits dentro do worktree passam pelos hooks completos (inclui lint).
- **Arquivos sob guarda:** `.ai/skills/**` e `.devcontainer/**` barram `Write`/`Edit`; o `block-secret-dump` casa o
  TEXTO do comando (`sops` + `-d`, ex.: `tr -d '\r'`). Escreva por script/gerador; se nem assim, `BLOQUEIO:` com o texto
  pronto no comentário — nunca contorne a guarda.
- **`.devcontainer/` roda do checkout principal:** `post-start.sh` chama `/workspace/.devcontainer/...` por caminho
  absoluto; prove pela cópia do worktree com o prefixo trocado, senão testa o arquivo errado.
- **Recorte em arquivo de teste:** conte os testes antes e depois; "verde" não é "completo".
- **O `delivery` descreve o HEAD:** toda medição que muda o veredito vira `delivery` na mesma sessão.

## Checklist do coordenador ANTES de despachar
1. O prompt tem as seções 1–11 + o esqueleto acima, **incluindo o bloco de segredos literal**? (conferir item a item)
2. Worktree criado + `node_modules` **REAL** (pasta, não symlink) + `git status` limpo no worktree.
3. Gate verde na base (`main`) **dentro do container** (lint incluso) — senão o worker herda um bloqueio que não é dele.
4. Heartbeat e watchdog ativos (watchdog genérico, sem nome de tarefa).
5. Timeline do worker anterior lida por cursor (tudo desde a última leitura), não só o fim.
6. Diagnóstico do worker reproduzido no real antes de concordar ou discordar.

**Proporção (ordem do dono, 26/09 — tarefas foram de 1–3 min para 20+ min):** trivial (1–3 linhas, sem lógica) = o
coordenador faz direto, sem worker nem revisão; pequena com lógica = 1 worker, coordenador confere diff + teste e faz merge;
revisão adversarial SÓ para autorização, segredos, banco com migração destrutiva ou infra. Máquina: orçamento medido
(RAM livre do WSL), não "N pesados". Toda mudança de TELA: coordenador abre o screenshot/console antes do merge.

Linha no Registro sem mudança no Esqueleto/Checklist é diário, não é conserto (Fabber `coord/worker-prompt-vivo.md`).

## Registro de erros → regra (append; mais novo embaixo)
| Data | Quem | Erro | Regra/mudança aplicada |
|---|---|---|---|
| 2026-09-26 | coordenador | Prompt PROJ-CHANNEL-1 sem prazo e com check-in de ~10 min; worker ficou 10 min sem commit | Esqueleto: prazo explícito + check-in ≤5 min + tempo por passo |
| 2026-09-26 | coordenador | Prompt sem auto-registro no tracker | Esqueleto: auto-registro início/fim |
| 2026-09-26 | coordenador | Mandei ler fontes do WSL que o container não alcança | Esqueleto: colar trechos das fontes externas no prompt |
| 2026-09-26 | coordenador | Watchdog com nomes de ferramenta/caminho (a skill proíbe) | Watchdog = procedimento genérico; específico só no heartbeat/bindings |
| 2026-09-26 | coordenador | Heartbeat/watchdog não criados no 1º despacho | Checklist pré-despacho item 4 |
| 2026-09-26 | base (gate) | Lint pulado em commits do host (sem eslint fora do volume) → erro no `theme-provider` bloqueou o worker; hook usava `bun run -s` (inválido no bun 1.4.2) | Checklist pré-despacho item 3; BACKLOG: pre-commit do host roda lint via container ou falha alto |
| 2026-09-26 | coordenador | Gates da raiz varriam `.worktrees/` e bloqueavam meu commit | `.worktrees` no SKIP de config-check/layout-check |
| 2026-09-26 | worker | Diagnóstico parcialmente certo do bloqueio (flag + lint) — coordenador quase descartou o 1º ponto | Coordenador reproduz no real antes de concordar/discordar (memória "ler o trecho inteiro") |
| 2026-09-26 | coordenador | Lia só as últimas N linhas da timeline (perdia eventos entre ciclos) | `ds-worker-tail.sh` lê por padrão TUDO desde a última leitura (cursor por task) |
| 2026-09-26 | base (gate) | Pre-commit lintava o projeto inteiro: 1,5–2 min por commit do worker | Lint só dos staged (HYGIENE-1) |
| 2026-09-26 | base (gate) | pre-commit varria o repo inteiro (layout-check 86s por andar clients/ no OneDrive) | Modelo do Fabber: pre-commit só staged; repo inteiro no pre-push e no `task check` (HYGIENE-1, escopo ampliado) |
| 2026-09-26 | coordenador | Tarefas de 40–90 min (dono: jobs de DeepSeek devem durar 5–8 min) | Regra: toda tarefa despachada cabe em **5–10 min**; maior que isso = dividir em várias (paralelas quando os arquivos não se cruzam). Prazo padrão 10 min |
| 2026-09-26 | coordenador | Branches `wk/<task>` reprovadas pela validação de nome do pre-push (`<type>/<slug>`) | Convenção: `<tipo>/<task>` (bindings) |
| 2026-09-26 | coordenador | Declarei o hub "no ar" pelo status HTTP (curl) e não vi a tela: /projects dava 500 e havia aviso de script no console | Revisão de UI = abrir no navegador (Playwright) logado, ler console e status; curl não prova tela |
| 2026-09-26 | coordenador | Escrevi `REVISITAR (BACKLOG …)` em vez de `TODO(ARCH-THEME)`; prompts não instruíam a regra de referências | Esqueleto: convenção `TODO(KEY)`/`@see` obrigatória |
| 2026-09-26 | coordenador | `dispatch.sh` usava `ln -sfn` sobre um node_modules que já era pasta real: o link foi criado DENTRO dela e o worktree ficou no 9p (testes 17x lentos, falso FIX de regressão) | dispatch apaga pasta real e confere o link; worker confere `ls -la` antes de testar; revisor compara com a base antes de culpar o código |
| 2026-09-26 | worker | Esperou com `sleep 60`/`sleep 150` e copiou 783 MB para /tmp em vez de só trocar por link | Esqueleto: nunca `sleep` de espera; nunca mover node_modules — BLOQUEIO |
| 2026-09-26 | coordenador | Symlink de `node_modules` no worktree compartilhava inodes com o checkout principal (backend hardlink: link count 3) e o worker não instalava dependência só da branch dele | Dispatch instala a árvore no worktree com `--frozen-lockfile --backend=copyfile`; symlink no worktree = `BLOQUEIO` para o worker |
| 2026-09-28 | worker | Crase (`) dentro de comentário SQL num template literal quebrou o hub (SEG-345; 2ª vez no mesmo arquivo) | Esqueleto: dentro de template literal (SQL), comentário nunca usa crase; conferir a página no navegador depois de salvar |
| 2026-09-29 | worker | Entrou no hub com a sessão do dono na checagem de tela; o `move` virou `pablo` no evento #3877 (SEG-1, SEG-525) | Esqueleto: bloco "Sessão no hub = assinatura na auditoria" + a mesma regra no POP de tela do `fast.py` |
| 2026-10-11 | coordenador (curadoria) | Aceite entregue como atalho `--check`/asserção de string e receita criada sem doc oficial; "verde" não reproduzível | Esqueleto: bloco "O aceite é a PROVA reproduzida pelo coordenador" + "Doc oficial citada antes de ajustar receita" (B3.3 do plano de release) |
| 2026-10-11 | worker | Declarou "sem acesso" a host/GitHub sem testar o caminho da Daneel (o acesso não é o dele — é do bot) | Esqueleto: `BLOQUEIO: sem acesso` exige o caminho da Daneel exercitado (comando + saída) |
