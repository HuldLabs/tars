# Colocação de arquivo — onde cada coisa mora

O lugar errado de um arquivo não é estilo: é o defeito que **só aparece depois**. O
tooling global que cai sob o app impede o app de ser extraído; o adaptador core que nasce
no hub faz o segundo app reimplementar a mesma coisa (a segunda fonte, contra o R3); o
descartável versionado polui o histórico do próximo que for ler o commit alheio.

Esta governança é a **regra**; o **motor** que a aplica (matriz por família, check de
layout) é do projeto que consome — o catálogo guarda a doutrina, o projeto declara a
política (doutrina `layout/file-placement`).

## 1. A matriz é dado, e `nao-classificado` BLOQUEIA

Antes de criar **qualquer** arquivo, classifique-o na matriz (`config/file_placement.toml`
no projeto): **família → `allowed`**. O que não tem família não é "genérico" — é
`nao-classificado`, e o gate **reprova**.

- A ordem é essa: **classifique → (se não há família) adicione a família → só então crie**.
  Adicionar família é parte do trabalho, não um obstáculo: a matriz cresce com o projeto.
- Um arquivo novo que ninguém classificou é exatamente o arquivo cujo lugar ninguém pensou.
  Permitir a criação "até alguém classificar" transforma a matriz em decoração.
- **Portar (R1) antes de inventar a família:** o projeto vizinho e o benchmark já têm a
  matriz dele; leia, porte a **ideia** da família, nunca o conteúdo do outro projeto.

## 2. Global × app: o tooling global NUNCA mora sob o app

O app (`apps/<nome>`) é o app. O que é **compartilhado** — `tools/`, `packages/`, `config/`,
`.ai/`, `central/`, `docs/`, `themes/`, `modules/` — não pode nascer lá dentro.

- **O teste que decide:** se o app fosse extraído (deletado do monorepo) e o arquivo fosse
  junto, algo global quebraria? Se sim, o arquivo é global e está no lugar errado.
- **Por que due:** um utilitário global sob o app cria uma dependência invertida — o
  segundo app precisaria importar do primeiro, ou (pior) copiar. É a origem da duplicação
  que o R3 proíbe, com um agravante: ela nasce justificada ("estava funcionando lá").
- **Import de `apps/*` em tema ou módulo é sempre violação**: tema e módulo são catálogos
  que o app consome, nunca o contrário.

## 3. A taxonomia de `tools/`: framework × method × clients

Dentro de `tools/`, **nada solto na raiz**. Cada script tem um destino, por quem é o dono
daquele código:

| pasta | o que mora | teste |
|---|---|---|
| `tools/framework/` | o **esqueleto da plataforma** — o que a plataforma precisa para existir | outro projeto faria igual? é framework |
| `tools/method/` | **método nosso**, reusável entre clientes (extração, pentest, despacho) | some se o cliente sumir? é método |
| `tools/clients/` | código de **um cliente** | só faz sentido para aquele cliente |

O critério é o **dono**, não o tamanho nem a frequência de uso. Script que serve a um
cliente e mora em `framework/` contamina o esqueleto; o inverso deixa uma peça de
plataforma acoplada a quem a pediu.

## 4. Serviço de núcleo: `packages/platform/<serviço>`, nunca adaptador novo no hub

Serviço de núcleo (IA, filas/jobs, mensageria, IAM, lifecycle, hooks) mora em
**`packages/platform/<serviço>`**, com um adaptador por driver. **Criar adaptador core novo
dentro do app/hub é proibido.**

- O hub é **consumidor**: ele pluga um serviço que já existe e passa **dados/config**, nunca
  implementa o núcleo (a regra de composição: peças genéricas no framework, o app só as usa).
- **A fronteira de dependência é o ponto:** driver/query-builder (`pg`, `kysely`, `postgres`)
  só nas zonas do adaptador — `packages/platform/*` para serviço core e `modules/*/db/` para
  dado de módulo. Portas e DTOs (`packages/core`, `modules`) **não** conhecem driver; o core
  não tem dependência de runtime (ninguém paga o que não usa — ver §5).
- Serviço novo se prova **aditivo**: o segundo consumidor usa o mesmo `packages/platform/*`
  sem editar o primeiro. Se o segundo precisa mexer no primeiro, não era o núcleo — era o app.

## 5. Nada no ecossistema exige runtime de quem não usa

A peça transversal precisa ser **binário único**, sem runtime que o consumidor tenha de
instalar para consumi-la. Exigir um runtime (uma linguagem, um gerenciador, um serviço de
fundo) para ler/absorver uma peça que o consumidor **não usa** é o custo que faz a peça ser
abandonada.

- **O teste:** um consumidor novo consegue instalar/usar/lêr a peça sem instalar nada além do
  que ele já precisa para o **seu** trabalho? Se não, a peça está cobrando pedágio.
- Costurar isso é o que torna as peças **plugáveis**: cada uma é um catálogo que o projeto
  escolhe — não uma torre que arrasta as outras.

## 6. Invariante de `.cache/`

**`.cache/` é o único descartável.** Tudo que é regenerável (log de execução, saída de
ferramenta, artefato de build) mora ali e **nunca é versionado**; `rm -rf .cache/` é sempre
seguro por construção.

- O que não é regenerável (decisão, evidência de incidente, lição) **não é cache** — vai
  para onde aquela coisa mora (`docs/`, memória, ledger), commitado e citável.
- **Ao revisar o commit de outro:** leia o `git show --stat` **antes** de mergulhar no diff.
  Botar descartável dentro do commit alheio é um erro que o `--stat` mostra de graça, e que
  o diff linha a linha esconde no meio de centenas de linhas.
