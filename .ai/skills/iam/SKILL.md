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
