# Segredos e identidade

Cada item abaixo nasce de um incidente real (08/10/2026, o dia em que o `op` ecoou a
chave age num erro e a `{{ op://… }}` se revelou inerte no `op run`). Não é lista de
boas intenções: cada um diz **a regra**, **por que** (o incidente que a produziu) e
**quem a aplica** — a camada mais automática que a cobra em todo consumidor
(`.ai/governance/incidente-vira-prevencao.md`: guard > doctor > env/config do sync >
gate de CI > skill). Regra sem gate é promessa; por isso o campo *Gate* é obrigatório
aqui.

## Segredos e identidade

### 1. Ref de segredo nunca mora em template resolvido em massa

- **Regra.** O template do `op run` só aceita `KEY=op://…` como valor **inteiro** de
  uma atribuição. Nenhum `op://` em comentário, no meio do valor, dentro de `{{ }}`,
  mais de um na linha, ou `export KEY=…`.
- **Porquê (incidente).** O `op run --env-file` resolve **qualquer** `op://` do
  arquivo, inclusive um `# op://…` de comentário: um ref esquecido num comentário
  virava segredo a mais no material cifrado, calado.
- **Gate.** `tars secrets check` — linha `template`, e o próprio `refresh` reprova
  antes de abrir o cofre.

### 2. Erro de ferramenta pode ecoar segredo — nunca repassar stderr cru

- **Regra.** Todo `op`/`sops`/`age-keygen` passa por **um wrapper único** (`roda`):
  a ref `op://` é validada **antes** do spawn (inválida = erro que **não** ecoa o
  valor) e o stderr volta **redigido** (valor de segredo conhecido vira `***`).
  Nunca `>/dev/null 2>&1` — esconderia a causa junto com o valor.
- **Porquê (incidente).** Em 08/10 o `op` cuspiu a **chave age** na mensagem de erro
  de uma referência que não resolveu; repassar o stderr cru imprimiu o segredo.
- **Gate.** O wrapper único em `tars-secrets.mjs` (toda chamada de ferramenta passa
  por ele); a mensagem de `validaRef` não reproduz o valor recebido.

### 3. Valor multilinha: `op run --env-file`, nunca `op inject`

- **Regra.** O template é resolvido por `op run --env-file=<template>` com
  `KEY=op://…`; o helper serializa o env resolvido em JSON. **Nunca** `op inject`.
- **Porquê (prova real, 08/10).** Valor multilinha (chave de assinatura) quebra os
  dois formatos do `inject` — um com JSON inválido, o outro **truncado no primeiro
  `\n`, em silêncio**; e `{{ op://… }}` **não resolve** no `op run` (o filho recebe o
  literal com as chaves).
- **Gate.** `tars secrets refresh` usa `op run` + `tars-secrets-inject.mjs`; um
  comentário de teste prova que nenhum `inject` é chamado.

### 4. Fonte de credencial declarada, sem fallback; automação nunca usa a sessão do dono

- **Regra.** `source` é **obrigatório** (`automation | owner`), sem fallback entre
  fontes. Com `automation`, `OP_BIOMETRIC_UNLOCK_ENABLED=false` é **forçado** no env
  do spawn do `op` — não há dono nem dedo no leitor nesse caminho.
- **Porquê (incidente).** Automação que herdava a sessão/biometria do dono travava
  pedindo a mão humana, longe da causa; e escolher a fonte "por conta própria" era
  decidir se o cofre abre de forma interativa ou não.
- **Gate.** `lerConfig` reprova `source` ausente/inválido; `envDoCofre` força o
  flag e um teste lê o valor no spawn do `op`.

### 5. Rotação de credencial de automação com sobreposição

- **Regra.** Ao rotacionar: gravar a credencial **nova** e **conferir** que ela já
  autentica **antes** de revogar a antiga. Nada trava sem o dono.
- **Porquê (incidente).** Revogar antes de o novo estar em uso cria uma janela em que
  a automação não tem credencial nenhuma — e o conserto exige o dono presente.
- **Gate.** Procedimento de rotação (o novo é conferido com um `refresh` de ensaio
  antes da revogação); sem gate automático — `n/a` enquanto a rotação é manual.

### 6. Shell não exporta segredo; o segredo vai só no env do filho

- **Regra.** `exec` roda o filho por **argv, sem shell**; o filho recebe o cache
  decifrado no seu próprio env e **não herda** o que aponta para a fonte (`OP_*`,
  `SOPS_AGE_KEY`); exporta só `SOPS_AGE_KEY_FILE` (o caminho).
- **Porquê (incidente).** Exportar o token da service account no shell deixava
  qualquer processo filho abrir o cofre inteiro — o cofre deixa de ser o único
  caminho.
- **Gate.** Linha `ambiente` do `tars secrets check` (acusa só os nomes que apontam
  para a fonte) + `envDoFilho` no `exec`.

### 7. Transporte por ator: SSH do dono pelo agente 1Password; automação por HTTPS com o token do bot

- **Regra.** O **dono** usa SSH pelo agente 1Password (biometria ok — ele está
  presente). A **automação** usa HTTPS com o token do bot via credential helper —
  **nunca** o agente SSH do dono.
- **Porquê (incidente).** Agente que usa o agente SSH/biometria do dono só funciona
  com o dono na frente; e `gh` sem keyring no WSL deixa o token em texto em
  `~/.config/gh/hosts.yml`.
- **Gate.** `tars doctor` acusa agente usando agente SSH/biometria e `gh` sem keyring
  no WSL.

### 8. Commit de IA é do bot; o dono entra pelo merge

- **Regra.** Código escrito por agente é autorado e assinado pela conta GitHub
  **própria do bot** (Daneel), com o modelo como **co-autor**; login/e-mail no
  `profile.toml` **do dono**, nunca no catálogo. O dono é PO: entra no histórico pelo
  **merge do PR**, assinado por ele. Nunca assinar commit de IA com chave registrada
  na conta do dono.
- **Porquê (incidente).** Uma chave do bot na conta do dono faria todo vazamento dessa
  chave virar commit `Verified` **do dono** em qualquer repo dele; a conta própria
  limita o estrago às permissões do bot e permite revogá-lo sem tocar no dono. O
  GitHub só marca `Verified` com a chave na conta dona do e-mail do commit.
- **Gate.** Identidade do bot no perfil (não versionada); `tars doctor` confere
  e-mail/assinatura contra a conta declarada.

### 9. Push por ator

- **Regra.** Commit de agente/bot: **push na hora** do commit, com a credencial do
  bot, sem aprovação do dono — toda branch vai para o GitHub na hora. Commit do dono
  (ator humano, ex.: `df sync` com ajustes dele): push **só com ele presente e como
  ação dele**, pela credencial dele. O hook `post-commit` age só no ator agente.
- **Porquê (incidente).** Push adiado de agente acumula trabalho local invisível
  (risco de perda com disco degradando); push automático em nome do dono agiria sem
  ele.
- **Gate.** Hook `post-commit` (só ator agente) + `tars doctor`.

### 10. Backup sincroniza dump, nunca dado vivo, e cifra antes de sair da máquina

- **Regra.** O backup leva um **dump** consistente, nunca o dado vivo em uso, e
  **cifra antes** de sair da máquina.
- **Porquê (incidente).** Copiar o dado vivo sob escrita gera um retrato inconsistente;
  e o que sai em claro da máquina já está exposto no destino.
- **Gate.** Job de backup (dump + cifra antes do transporte); sem gate automático no
  catálogo — `n/a` enquanto é procedimento.

### 11. Nunca imprimir, hashear nem expor tamanho de segredo

- **Regra.** Nada imprime, hasheia ou revela o **tamanho** de um segredo. Fingerprint
  só de **identidade pública**; HMAC (com chave local) fica no backlog.
- **Porquê (incidente).** Hash e comprimento vazam por comparação/força bruta o que o
  segredo esconde; um "fingerprint" do segredo é a segunda cópia que não se pode
  revogar.
- **Gate.** Regra de revisão (`check`/revisão imprimem só **nome** e **caminho**);
  sem gate automático — `n/a` enquanto é disciplina de escrita.

### 12. `op item get --format json` devolve o campo como ele está — inclusive a chave privada

- **Regra.** Ler um item SSH_KEY por `op item get --format json` traz a chave **privada**
  no campo; para a pública use `op read` do **campo público** ou derive-a (`ssh-keygen -y`).
- **Porquê (incidente).** `04/09/2026`, fabber2-ecommerce
  (`infra/pyinfra/_op_secure_write.py`): o helper lia o item inteiro para conferir um
  campo e a chave privada veio junto, no JSON, para dentro do processo — o item "de
  leitura" entregou a identidade que ele não precisava.
- **Gate.** Regra de revisão (scan/revisão: `item get --format json` só onde o item
  inteiro é o que se quer; campo a campo, `op read`).

### 13. Escrita no cofre: JSON por STDIN, nunca em argv nem em arquivo temporário

- **Regra.** `op item edit <item> -` com o JSON pelo **stdin**. Nada de `--template=<arq>`
  (o arquivo fica no disco) nem de valor/payload em argv (`ps` o lê).
- **Porquê (incidente).** `04/09/2026`, fabber2-ecommerce
  (`infra/pyinfra/_op_secure_write.py`): o payload passava por arquivo temporário, uma
  cópia do segredo no disco por escrita, sem dono nem prazo.
- **Gate.** Revisão da estratégia de escrita — **avaliação pendente**: trocar o default
  de `age_key_write` para stdin se o `op` aceitar (teste com stub registrando o stdin,
  na linha do que o stub do `op` já prova para o argv).

### 14. Automação escreve no cofre com SA de escrita própria; o dono só aprova o que ele roda

- **Regra.** Dois tokens: um de **leitura** (uso geral) e um de **escrita**, usado **só**
  no env do `op` que escreve. Nunca pela sessão do dono.
- **Porquê (incidente).** `04/09/2026`, fabber2-ecommerce: escrever pela sessão do dono
  faz toda a automação depender da mão dele e mistura, no mesmo rastro, o que o humano
  aprovou e o que o robô decidiu. O dono aprova o que **ele** roda.
- **Gate.** `source=owner` obrigatório nos comandos de escrita (`set`/`import` recusam
  sem ele) + `envDoCofre` forçando `OP_BIOMETRIC_UNLOCK_ENABLED=false` na automação.

### 15. Rótulo de campo nativo do 1Password é traduzido; ref por rótulo quebra

- **Regra.** Referência só para **campo próprio** de Secure Note, no padrão
  `op://<cofre-do-contexto>/<item>/<secao-do-provedor>/<segredo>`. Chave SSH em campo de
  texto vale-se derivando a pública (`ssh-keygen -y`).
- **Porquê (incidente).** `04/09/2026`, fabber2-ecommerce: o rótulo de campo NATIVO
  (`private key`, `credential`) é traduzido pelo idioma do app — a ref que funcionava em
  inglês passou a não resolver numa máquina em português, e o erro apareceu longe da causa.
- **Gate.** `tars secrets check` (linha `template`) + `fingerprint` derivando a pública,
  em vez de ler a privada do item.
