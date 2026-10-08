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

### 8. Commit de automação autorado e assinado pela conta própria do bot

- **Regra.** Commit de automação é autorado e assinado pela conta GitHub **do bot**
  (Daneel) — login/email no `profile.toml` **do dono**, nunca no catálogo —, com o
  modelo como **co-autor**.
- **Porquê (incidente).** Assinar com uma chave registrada na conta do **dono**
  reprova o `Verified`: o GitHub exige a chave na conta dona do e-mail do commit.
- **Gate.** Identidade do bot no perfil (não versionada); `tars doctor` confere o
  e-mail/assinatura contra a conta declarada.

### 9. Push imediato por ator

- **Regra.** Commit de agente/bot faz **push na hora** com a credencial do bot, sem
  aprovação; commit do dono também faz push na hora, pela credencial dele. O hook
  `post-commit` **escolhe a credencial pelo ator**.
- **Porquê (incidente).** Push adiado acumula trabalho local invisível e mistura os
  atores; escolher a credencial a mão vaza a identidade errada no remote.
- **Gate.** Hook `post-commit` (escolhe a credencial pelo ator) + `tars doctor`.

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
