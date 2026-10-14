---
name: iam
description: Autenticação e autorização do ecossistema — cadeia de provedores plugável, núcleo próprio × casca de terceiro, um engine de jobs só. Carregar antes de mexer em login, sessão, provedor de identidade, papéis/escopos ou orquestrador de jobs.
---

# IAM do ecossistema — cadeia de provedores, núcleo × casca, engine único

Portado da curadoria de 13/10 (mapas `seg-agentmem-1` #69-#71 e `coleta-eco` §1.5-1.7; ADRs da org
lidos **somente leitura**). A lógica entra; host, cofre e cliente **não**.

## 1. Autenticação por cadeia de provedores; autorização no app

- **Todo app autentica por uma CADEIA de provedores plugáveis**: um provedor **local embutido**
  (nasce junto com o app, sem dependência externa) mais os **externos por configuração**
  (OIDC, provedor social, o que o projeto exigir). App novo nasce com a cadeia montada e o local
  ativo — auth própria acoplada ao framework não é caminho.
- **Autenticação ≠ autorização.** Quem prova *quem é* é o provedor; **papéis, escopos e decisão de
  acesso ficam no app**. Um provedor de identidade que passe a decidir autorização virou acoplamento
  escondido.
- **O binário nunca lê cookie do hospedeiro.** Sessão entra por contrato explícito (token/cabeçalho
  definido), nunca por "pegar o cookie que já estava lá".
- **Um token por app chamador**, emitido pelo IAM da org — o app não reusa a credencial do vizinho
  (o mesmo apartamento que o R1 exige entre projetos).

## 2. Núcleo próprio × "casca" de terceiro — com gatilho de reabertura

- **Extraia o núcleo que é seu; adote terceiro só para núcleo de terceiro.**
- Se o núcleo é o IAM base do **próprio framework**, o serviço que nasce dele é a **EXTRAÇÃO** desse
  núcleo (mesma disciplina de extrair um módulo: nasce versionado, com proveniência), **não** uma
  "casca". **Casca** é o invólucro fino em volta de um núcleo **de terceiro**.
- **Toda decisão de adoção carrega o gatilho explícito de reabertura** escrito ao lado (a condição
  que a tornaria errada de novo: um requisito que o terceiro não cobre sem código, por exemplo).
  Sem gatilho, a decisão sobrevive à razão que a sustentava.
- **A ressalva também se escreve:** um estudo que decidiu sem abrir as fontes atuais dos concorrentes
  registra isso — decisão com fonte declarada é auditável; decisão "de memória" não.

## 3. Um engine de jobs só — o segundo vive atrás da porta

- **Não existe segundo engine de jobs rodando em paralelo.** Um orquestrador durável (por exemplo,
  um que reaproveite o banco que já existe) entra **atrás de uma porta** (`OrchestratorPort`), com o
  **caminho de migração escrito** — não como um segundo motor ao lado do primeiro.
- O risco é nomeado: o "orquestrador novo" que vira o **segundo** agendador, com dois lugares
  decidindo o que roda. Duas filas é duas verdades.

## Proveniência

ADRs da org (lidos somente leitura) · `coleta-eco` §1.5-1.7 (14/10) · `seg-agentmem-1` #69-#71 (13/10).
Nomes de host, provedor e cofre ficam **fora** do catálogo.

## 4. Repositório sem upstream: espelho + congelamento (recuperação auditável)

Quando um repositório **não tem upstream** (recuperado de cópia, share ou backup), o lar dele é um
**espelho próprio** — o servidor git da org —, **não** um diretório de arquivos sincronizado por
aplicação caseira: o servidor git **puxa nativamente** e cada repo tem o seu; um diretório cru
exigiria construir um app de sincronismo para replicar o que o servidor já faz.

- **Árvore recuperada congelada, só-leitura**, no branch original intacto, com um **doc que registra**
  o que entrou, o que ficou fora e **como regenerar** — sem esse doc a recuperação não é auditável.
- **A migração vai em branch próprio, por tema**, nunca sobre o original congelado: o original é a
  evidência; a migração é o trabalho.
- **Provisionar repo novo** (org própria no espelho, autenticação como bot, token efêmero para push)
  é rotina do ator de automação, não o jeitinho com a credencial de alguém.
- **Antes de apagar a cópia local: a ponta de CADA branch existe no espelho** (e no upstream, quando
  houver) — critério verificável, não suposição.
- **Código e serviço são separados:** o serviço **nunca roda de dentro do diretório de repos**; cada
  app tem sua cópia de deploy e recebe **release**, não `pull`.
- **Armadilhas da recuperação:** clone de terceiro sem `.gitmodules` vira *gitlink* silencioso (o
  conteúdo não vem), e config de plugin costuma guardar **chave/token reais** — trate o arquivo
  recuperado como dado hostil até provar o contrário.
