# Origem antes do sintoma — incidente → prevenção propagada

Toda falha de agente é uma **classe**, não um episódio. Corrigir a ocorrência sem
fechar a classe garante que ela volte no próximo projeto. Este documento é a régua:
ao consertar um bug, responda as perguntas na ordem abaixo e **propague na camada
mais automática que o impeça em TODOS os consumidores**.

## As perguntas (obrigatórias no registro da lição, nesta ordem)

1. **Qual a ORIGEM — a causa da causa raiz, e não o sintoma?** — antes de tudo.
   A causa raiz é o **buraco estrutural** que permitiu a falha; a origem é **o que
   fez esse buraco nascer**. Um buraco não aparece sozinho: alguém decidiu, ou
   ninguém escreveu. Enquanto a lição só corrige o buraco, a fonte continua lá
   gerando buracos novos.
   - Se **"por que ocorreu"** e **"causa raiz"** soam iguais, **cave mais um nível**;
     se **"causa raiz"** e **"origem"** soam iguais, cave de novo.
   - **Causa desconhecida: diga, não chute.** Investigar até o fim é obrigatório;
     apresentar palpite como achado, não. Sem origem confirmada, a lição registra
     `origem: desconhecida após <o que foi tentado>` — o campo honesto é esse, não
     a invenção.
2. **Qual a classe?** — não "o `git fetch` travou", e sim "comando de agente que bloqueia
   esperando entrada interativa sem TTY". A classe é o que se propaga.
3. **Qual camada do Tars a impede em TODOS os projetos?** — na ordem de preferência
   abaixo. O mais automático ganha: uma camada que roda sozinha vale mais que uma que
   depende de alguém lembrar.
4. **Qual teste prova?** — sem prova que **reprova** sem a correção, a prevenção é
   promessa, não gate (R4).

## Como a origem se investiga

- **Defina o esperado e o real** — precisamente, com a saída de verdade, não a paráfrase.
- **Reproduza pelo menor caminho confiável** — tire tudo o que não é necessário para
  disparar a falha antes de continuar.
- **Estreite a fronteira uma variável por vez** — não conserte e investigue ao mesmo tempo.
- **Ache a causa raiz ANTES de alargar a correção** — o primeiro lugar plausível não é o
  culpado, e mexer nele apaga a evidência.
- **Ande para trás até a primeira invariante violada** — o sintoma é onde a violação
  apareceu; a causa é onde ela **nasceu**. Volte pelo fluxo até o primeiro ponto em que o
  invariante já não valia, e conserte ali. Se o que quebrou **funcionava antes**, é
  regressão: `git bisect run <repro>` acha o commit culpado em `log2(n)` passos — o diff
  desse commit é a evidência.
- **Anote as hipóteses descartadas** — cada experimento muda **uma** variável; hipótese sem
  experimento é palpite. O campo `hipoteses:` guarda o que foi testado e derrubado (e por
  quê) para a próxima sessão não repetir o beco sem saída.
- **Reconstrua do zero** — correção aplicada ao sistema rodando, sem a origem nomeada, é
  contorno, não correção.
- **Preserve a evidência enquanto o bug é observável**; se a falha é intermitente, aumente
  a observabilidade antes de aumentar a esperteza.

Passo a passo detalhado: skill `.ai/skills/root-cause-debugging/`. Aqui fica a regra.

## Camadas, da mais forte para a mais fraca

- **guard** — barra o comando na hora (`.ai/guards/`, hook PreToolUse).
- **doctor** — acusa o estado errado no `tars doctor` (config, wiring, doutrina).
- **env/config do sync** — o `tars sync` já emite o certo por padrão (ninguém precisa lembrar).
- **gate de CI** — reprova na integração, depois do commit.
- **skill** — instrui o agente; a mais fraca (depende de leitura e disciplina).

Uma falha que só a skill cobre ainda pode acontecer; o alvo é subir a classe para o
guard/doctor/sync sempre que der.

## Os campos da lição

A lição em 4 campos (`erro` / `porque` / `causa raiz` / `correcao`) ganha três, na
ordem em que se pensa:

    origem: <o que fez o buraco estrutural nascer — não repita a causa raiz>
    hipoteses: <testadas e descartadas, uma variável por experimento, com o porquê>
    propagacao: <camada> + <commit>, ou `n/a` com motivo

`origem` é a **primeira** pergunta e por isso vem antes de `propagacao`: primeiro
entende-se de onde a falha veio, depois decide-se quem impede a classe de voltar.
`hipoteses` fica **entre** as duas, porque é o que a investigação produziu de concreto:
a hipótese que caiu vale tanto quanto a que ficou — a próxima sessão não repete o beco
sem saída. `propagacao` nomeia **quem impede a classe de voltar** — a camada escolhida na
pergunta 3 e o commit que a instalou. `n/a` só com motivo (ex.: "classe só existe neste
projeto").

O validador (`.ai/gates/commit-msg/validate-commit.mjs`) **exige** `origem` e
`hipoteses` no bloco de lição nova e **avisa** quando faltam em lição antiga (trailer de
1 linha); com `propagacao` e a validação de camada, faz o mesmo. Sem isso as perguntas
viram boa intenção.

**Origem do port (R1).** As perguntas vêm de benchmark, não de invenção: o critério
"cave mais um nível" e "causa desconhecida: diga, não chute" vêm de
`fabber/.claude/skills/root-cause-debugging/SKILL.md:31-45`; a separação
**sintoma × causa raiz × prevenção** no formato da lição vem de
`farmega/docs/operations/licoes-aprendidas.md:26-34`; o padrão de falha "raiz comum" —
vários erros que só se explicam ao perguntar quem deveria ter verificado antes — vem de
`farmega.v2/docs/operations/RETRO-2026-06-10-erros-e-aprendizados.md:120-137`
("Passei para o executor a responsabilidade de verificar condições que eu deveria ter
verificado antes").
