# Incidente → prevenção propagada

Toda falha de agente é uma **classe**, não um episódio. Corrigir a ocorrência sem
fechar a classe garante que ela volte no próximo projeto. Este documento é a régua:
ao consertar um bug, responda as três perguntas e **propague na camada mais automática
que o impeça em TODOS os consumidores**.

## As três perguntas (obrigatórias no registro da lição)

1. **Qual a classe?** — não "o `git fetch` travou", e sim "comando de agente que bloqueia
   esperando entrada interativa sem TTY". A classe é o que se propaga.
2. **Qual camada do Tars a impede em TODOS os projetos?** — na ordem de preferência
   abaixo. O mais automático ganha: uma camada que roda sozinha vale mais que uma que
   depende de alguém lembrar.
3. **Qual teste prova?** — sem prova que **reprova** sem a correção, a prevenção é
   promessa, não gate (R4).

## Camadas, da mais forte para a mais fraca

- **guard** — barra o comando na hora (`.ai/guards/`, hook PreToolUse).
- **doctor** — acusa o estado errado no `tars doctor` (config, wiring, doutrina).
- **env/config do sync** — o `tars sync` já emite o certo por padrão (ninguém precisa lembrar).
- **gate de CI** — reprova na integração, depois do commit.
- **skill** — instrui o agente; a mais fraca (depende de leitura e disciplina).

Uma falha que só a skill cobre ainda pode acontecer; o alvo é subir a classe para o
guard/doctor/sync sempre que der.

## O 5º campo da lição

A lição em 4 campos (`erro` / `porque` / `causa raiz` / `correcao`) ganha um quinto:

    propagacao: <camada> + <commit>, ou `n/a` com motivo

`propagacao` nomeia **quem impede a classe de voltar** — a camada escolhida na pergunta 2
e o commit que a instalou. `n/a` só com motivo (ex.: "classe só existe neste projeto").
O validador (`tars verify`/lesson) **avisa** quando falta em lição antiga e **exige** em
lição nova — sem isso a pergunta 2 vira boa intenção.
