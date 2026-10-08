---
root: true
targets: ["claudecode", "codexcli", "opencode"]
---

# Princípios de boot

Regra de boot de **todo** projeto que consome o Tars: o catálogo a leva ao consumidor
(`tars sync`) e o adaptador a põe no topo do arquivo de boot gerado. Vale para qualquer
sessão de agente, em qualquer projeto.

## Regra zero: todo problema passa pela skill `root-cause-debugging`

Todo problema, bug, bloqueio, erro, falha de teste ou condição inesperada é tratado
**pela skill `root-cause-debugging`**, antes de qualquer outra ação: reproduzir, medir,
levantar hipótese, testar a hipótese e só então corrigir ou pedir algo a alguém.

- **Nunca chutar:** sem afirmar causa, estado ou "como era antes" sem conferir.
  Hipótese não testada se apresenta como hipótese.
- **Conferir antes de pedir:** antes de pedir ao dono uma ação, uma credencial ou uma
  decisão, verifique o que você mesmo pode verificar (só leitura, sem efeito colateral).
- **Falha silenciosa é falha:** saída vazia, `cat` que não leu ou comando que "não fez
  nada" vira uma investigação, não uma suposição.

Porquê (incidente de 08/10/2026): o agente afirmou de memória como o push funcionava antes
do crash e errou; acionou a biometria do dono antes de procurar o token de automação que
existia; e pediu ao dono ações que ele mesmo podia testar.

## Mantras (a régua de todo desenho)

Toda decisão de arquitetura — e todo ADR — é julgada por estas bases, e o desenho **diz
como atende cada uma**:

- **R1 · Já existe? Onde? Portar a ideia.** Antes de criar qualquer coisa, pergunte se
  já foi resolvido — no próprio repo, nos projetos vizinhos e benchmarks (só leitura) e no
  mercado. Porte a **lógica**, adaptada à nossa proporção; **nunca** credenciais, dados,
  bancos, hosts ou ambiente de outro projeto. Reinventar a roda é proibido.
- **R2 · KISS.** Menos código, mesma função, mais rápido. Estenda antes de criar; sem
  abstração antecipada; apagar é entrega; medir, não achar.
- **R3 · SSOT.** Toda regra, cálculo, validação, lista e componente existe em **um** lugar;
  o resto consome. Duplicação é defeito, não estilo — inclusive em docs.
- **R4 · Falha rápida e alta.** Comece pelo menor caso: 1 ou 2 testes, valide, só então o
  completo. Erro **grita** e nomeia o que faltou; nada de falhar calado.
- **Hooks em tudo.** Todo sistema e toda função de núcleo oferece hooks — antes, depois e
  ao falhar — para as ações e os filtros, em vez de acoplar quem estende a quem é estendido.
- **Idempotência.** Install, upgrade, migrate, seed, backfill: rodar de novo sem mudança
  não muda nada. Repetível e seguro por construção.
- **Modularidade.** Peça coesa, fronteira clara; um módulo se entende e se testa sozinho.
- **Plugabilidade.** Módulo ou plugin **acrescenta** capacidade em todas as superfícies
  (API, CLI, tela, evento), sem editar o núcleo.
- **Agnosticidade.** De runtime e de stack: o núcleo não conhece a ferramenta nem o banco
  de quem o consome.

## Doutrinas de extracao

- **Versionamento:** toda peça extraída (Tars, Tomo, Sofon, Pion, Kipp, Lazarus, Endurance)
  nasce em `0.0.1-dev.N` e sobe a versão a cada entrega, com as notas de upgrade —
  `.ai/governance/versionamento-de-extracao.md`.
- **Estado:** serviço com estado não sobe sobre volume vazio; o preflight exige o marcador do
  datadir, salvo init explícito — `.ai/governance/estado-exige-datadir.md`.

## Ao fechar trabalho

- **Origem antes do sintoma.** Toda falha tem uma origem (a causa da causa raiz), não só um
  sintoma; corrija lá e propague a classe na camada mais automática que a impeça em todos os
  consumidores. Campos da lição (`origem`, `propagacao`) e a régua em
  `.ai/governance/incidente-vira-prevencao.md`; a investigação em
  `.ai/skills/root-cause-debugging/`.
- **Limpeza (SOP).** Antes de fechar: apague morto, duplicata, flag sem uso e arquivo
  órfão; o que era temporário some junto. Entrega que reduz linhas ganha.
- **Segredos.** **Nunca** imprima segredo (nem em log, teste ou evidência). O cofre
  (1Password) só é aberto no refresh; em runtime leia o cache cifrado (sops+age), jamais a
  fonte.
