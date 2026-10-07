---
name: root-cause-debugging
description: >-
  Processo de investigação antes de propor correção — bug, regressão, validação
  que falhou ou comportamento inesperado. Use sempre que algo quebrou e a causa
  ainda não está confirmada; é o passo que antecede o registro da lição.
---
# Investigação de causa raiz

**Não conserte por palpite.** Este é o processo que roda **antes** de a correção ser
proposta e **antes** de a lição ser escrita: a lição é o registro do que a investigação
achou; esta skill é como achar.

A regra (a primeira pergunta é a ORIGEM; origem ≠ causa raiz; causa desconhecida se
declara) vive em `.ai/governance/incidente-vira-prevencao.md`. Aqui está o passo a passo.

## Passo a passo

1. **Defina o esperado** — o que deveria ter acontecido, precisamente.
2. **Defina o real** — o que aconteceu, com a saída de verdade, não uma paráfrase.
3. **Reproduza pelo menor caminho confiável** — tire tudo o que não é necessário para
   disparar a falha antes de continuar.
4. **Estreite a fronteira da falha** — uma variável por vez. Não conserte e investigue ao
   mesmo tempo: cada mudança isola, não resolve.
5. **Ache a causa raiz antes de alargar a correção** — o primeiro lugar plausível não é o
   culpado. Não aplique o patch ali.
6. **Suba um nível: qual é a ORIGEM** — o que fez esse buraco estrutural nascer. Se a
   explicação de "por que ocorreu" e a de "causa raiz" soam iguais, cave mais um nível; se
   "causa raiz" e "origem" soam iguais, cave de novo.
7. **Valide que a correção ataca a origem** — rode de novo a reprodução exata do passo 3
   contra a correção.
8. **Menor guard honesto para o modo de falha corrigido** — um teste quando for essa a
   camada certa; senão, o check mecânico mais próximo (a lição vira verificação).

## Regras

- **Preserve a evidência enquanto o bug ainda é observável** — capture a saída/estado que
  falha antes que sumam (container que reinicia, log que rotaciona).
- **Falha intermitente: aumente a observabilidade antes da esperteza** — não adicione
  tratamento especulativo para um modo de falha que você não confirmou; some
  log/instrumentação até o gatilho real ficar claro.
- **Causa desconhecida depois da investigação: diga, não chute** — não apresente palpite
  como achado.
- **Refatoração ampla e especulativa não é a primeira resposta a uma falha** — um diff
  largo torna a próxima investigação mais difícil, não mais fácil, se não corrige o problema.
- **Correção de bug concluída sempre ganha guard de recorrência** — se nenhum couber na
  mesma passada, registre o motivo específico e o risco residual, em vez de pular calado.
- **Reconstrua do zero** — pergunta de aceitação: se o ambiente fosse refeito do zero só
  com o segredo inicial, isso volta sozinho? Por qual task/deploy? Se a resposta honesta é
  "só porque eu rodei à mão", a investigação não terminou: conserte a automação, rode a
  automação e confirme o caminho corrigido num alvo limpo.

## Depois da investigação

Se a origem e a correção são achados reais (e não um erro pontual sem causa estrutural),
registre na lição nos campos `erro` / `porque` / `causa raiz` / `origem` / `correcao` /
`propagacao` — o validador de commit exige os campos e reprova o bloco sem `origem`
(`.ai/governance/incidente-vira-prevencao.md` §Os campos da lição).
