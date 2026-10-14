---
root: false
targets: ["claudecode", "codexcli", "opencode"]
---

# Ambiente: nunca cruzar sistemas de arquivos

Regra curta, universal e cara de ignorar: **a ferramenta roda do mesmo lado do repo.**
O que está no sistema de arquivos do Linux é lido, editado, buscado, instalado e testado
**de dentro do Linux** (container/WSL) — nunca pelo *mount* do Windows.

## Por que (a classe de bug que isso evita)

Atravessar a fronteira (`\\wsl.localhost\...` a partir do Windows, `/mnt/c|d/...` a partir
do WSL) passa por uma **camada de tradução** (9P/DrvFs). A tradução não é "um pouco mais
lenta": ela muda o **comportamento** que o build e o teste dependem.

- **Lentidão extrema** — a mesma instalação que leva segundos do lado certo leva minutos
  atravessando; e a lentidão aparece em CADA passo, não uma vez.
- **Eventos de arquivo que não chegam** — o watcher do dev server não vê a mudança (o evento
  morre na tradução): o build não reconstrói, o teste roda contra o código antigo, e o
  sintoma é "não mudou nada" com o arquivo mudado.
- **Symlink quebrado** — o link que vale dentro do Linux aponta para um caminho que não
  existe do outro lado; o `node_modules` vira um espelho quebrado.
- **IO alto e corrupção silenciosa** — permissões e `chmod +x` não sobrevivem de forma
  confiável entre os lados; um script que "é executável" de um lado falha do outro.

A consequência mais perigosa: o erro **não grita**. Ele degrada calado — o teste passa pelo
motivo errado, o build serve o artefato velho. É a mesma classe do `git add -A` esquecido:
não destrói nada na hora, mas põe a decisão sobre uma base falsa.

## A regra

1. **Rode tudo do lado onde o repo mora.** Editar, criar, apagar, buscar, instalar
   dependência, rodar teste/typecheck/lint/build/watcher — do lado do Linux. O lado do
   Windows existe para o que é dele: o app de desktop, o navegador, o link da memória.
2. **Nunca aponte um caminho de ferramenta para o outro sistema de arquivos.** Nada de
   `\\wsl.localhost\...` num comando Linux, nada de `/mnt/c` num processo que escreve no
   repo. A fronteira é a fronteira, não um atalho.
3. **A sandbox fica do mesmo lado do repo.** Um agente em sandbox não a atravessa: se o
   executor roda de um lado, o repo tem de estar do mesmo lado.
4. **Falhe alto em caminho não-Linux.** Um utilitário de núcleo que recebe um caminho do
   outro sistema (UNC `\\`, ou `/mnt/<letra>/`) **recusa** com mensagem nomeando a violação
   — não tenta, não degrada, não "funciona mesmo assim". Recusar é o contrato: quem chama
   aprende no primeiro erro, não no dia em que o build serve o artefato velho.
5. **Um processo, um lado.** Não misture: um watcher de um lado e um teste do outro produzem
   dois universos que não conversam, e o sintoma volta como "às vezes não pega a mudança".

## O que isto NÃO é

- Não é "Windows é ruim". É que a **fronteira** é cara — o custo é da travessia, nos dois
  sentidos.
- Não é "só a primeira vez é lenta". É pior: o watcher que não dispara e o `chmod` que não
  cola são **semânticos**, e não melhoram com o tempo.
- Não é opcional quando "é só um arquivinho". O arquivinho que você lê atravessando é o que
  ensina o hábito que, um dia, roda o build inteiro do lado errado.

## Aplicação

- Antes de rodar qualquer coisa: **onde está o repo, e onde eu estou?** Se são lados
  diferentes, mude de lado antes de rodar — não "só desta vez".
- Script de núcleo que aceita caminho: **valide a fronteira** na entrada (`\\` ou `/mnt/`)
  e recuse. É a única forma de a regra sobreviver a quem não a conhece.
- Ao escrever um procedimento (doc, runbook, prompt de worker): diga **de que lado** cada
  comando roda. "Rode o teste" sem o lado é uma instrução incompleta.

## `.cache/` é o único descartável — e ele nunca é versionado

- **Invariante de layout:** o **descartável mora só em `.cache/`**. `rm -rf .cache/` é seguro a
  qualquer momento, por construção; o que não pode ser apagado assim **não** é `.cache/` — é
  estado de verdade (banco, arquivo versionado), e esse tem outro lugar.
- **Nunca commitar `.cache/`** — nem com `git add -f`, nem porque "é pequeno". Um `.cache/`
  versionado deixa de ser descartável e passa a mentir sobre o que é estado.
- **Revisar o `git show --stat` do commit alheio** (e do próprio) procurando `.cache/`: o
  commit de terceiro é onde o arquivo descartável entra sem ninguém olhar.
- Cada worker escreve em **`--outdir` privado** (`.cache/<slot>/`) — dois runs no mesmo
  diretório sobrescrevem um ao outro.

## Comando longo vai para segundo plano

Comando que pode passar de **~10 s** (suíte, build, apply, push, varredura remota, recriar
container) roda **em segundo plano desde o início**; o resultado é lido na notificação e o
trabalho segue. Fica em primeiro plano apenas o **instantâneo** ou o comando cujo resultado é
o **próximo passo imediato** de uma resposta curta. Nunca um laço de `sleep` esperando: quem
espera o relógio cruzar perde o turno e não ganha informação.

## Python sempre por `uv`

Todo Python roda por **`uv`** (`uv run`, `uv sync --frozen`, `uv run --no-project`), nunca o
`python3`/`pip` do host: o `uv` traz o interpretador e o ambiente, e o mesmo comando vale em
qualquer máquina. Wrapper de hook Python: `command -v uv` e então
`uv run --no-project --quiet python <script>` — e a revisão do diff procura `python3 ` e
`pip install`.
