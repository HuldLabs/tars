---
name: segtools-content
description: >-
  Escrita e revisão de TEXTO de verdade no segtools — rascunho base (clareza,
  densidade prática, voz), revisão crítica (achar o que soa genérico, polido
  demais ou montado por IA) e variabilidade editorial (tirar a regularidade sem
  criar um padrão novo). Carregar ao escrever ou revisar relatório (R1–R4), doc,
  texto de UI, descrição longa de issue ou qualquer texto que alguém vai ler de
  fato.
---
# Conteúdo — escrever, revisar, dar textura

Skill NOSSA. Origem (Regra 1), lida em 2026-09-26, parte genérica absorvida:
- `seo-expert/knowledge/classificar/skills/base/content-writing/content-base/SKILL.md` (rascunho base);
- `seo-expert/knowledge/classificar/skills/base/content-review/critical-review/SKILL.md` (revisão crítica);
- `seo-expert/knowledge/classificar/skills/base/content-review/editorial-variability/SKILL.md` (variabilidade);
- `seo-expert/knowledge/classificar/skills/seo-writing/seo-page-draft-writer/references/writing-anti-ai-checklist.md`.
Fontes de verdade que ficaram lá (ler quando o caso pedir): `seo-expert/knowledge/classificar/patterns/content-writing/`
— `Guia padrão de criação de conteúdo.md`, `Guia de revisão crítica e detecção de IA.md`, `Catálogo de micro-padrões de texto
com cara de IA.md`, `Guia de escrita para web, escaneabilidade e acessibilidade.md`, `Playbook operacional YMYL, E-E-A-T, GEO e
citabilidade.md` (conteúdo público regulado/de referência), `protocols/Protocolo de variabilidade humana real e densidade editorial.md`.
O vault `ai-brain` tem versões curtas (`vault-content-base`, `vault-critical-review`, `vault-editorial-variability`).

Relação com as outras skills: `segtools-sdd` diz o QUE vai em cada seção de uma issue; `segtools-writing` diz COMO escrever
título, descrição e comentário no canal; **esta** é a camada de texto para qualquer saída mais longa.

## 1. Rascunho base
1. Defina tipo de texto, leitor e objetivo antes de escrever.
2. **Explique o conceito antes de comentar ou criticar.** Quem chega frio precisa entender primeiro.
3. Dê peso prático com pelo menos um elemento real: exemplo, cenário, sintoma, número, exceção ou decisão.
4. Use o termo que um especialista usaria. Escolha o termo central cedo e não fique trocando por sinônimos.
5. Defina sigla e jargão interno no primeiro uso que importa (inclusive nossos: "canal", "porta", "worker", "dry-run").
6. Texto que quer autoridade precisa de pelo menos uma âncora verificável (caminho de arquivo, commit, doc, dado público).
7. Separe o que a fonte diz, a sua interpretação e o que ainda depende de verificação. Silêncio de uma fonte não é permissão
   nem proibição.
8. Fato volátil (preço, política, versão) vai com data de verificação; uma âncora de data basta.
9. Estrutura escaneável: títulos informativos, ideia principal no começo, uma ideia por parágrafo, nada que só funcione em
   leitura linear.
10. Termine o raciocínio. A conclusão não repete a seção anterior com palavras mais suaves.
11. Versão curta (resumo) é **reescrita** a partir do objetivo, não o texto longo comprimido seção por seção.
12. Nota de processo interno (lembrete, instrução de ferramenta) não vaza para o texto que o leitor vai ler.

Não invente: caso, cliente, número, citação ou experiência em primeira pessoa. Se precisar de ilustração e não houver caso real,
marque como "cenário típico" ou "exemplo plausível".

## 2. Revisão crítica (depois do rascunho)
Leia o texto inteiro antes de corrigir frase solta. Procure **famílias** de problema, não palavras:
- aberturas, fechamentos, cadência e início de frase repetidos;
- introdução-fórmula ("a resposta é simples", "em termos diretos"), síntese anunciada ("o quadro que se forma é este"),
  falsa nuance ("não é só X, é Y", "isso não quer dizer X");
- cobertura simétrica: todo ângulo com o mesmo peso, sem hierarquia;
- escudos repetidos ("na documentação consultada") que protegem sem acrescentar precisão;
- tom de relatório/memorando onde deveria haver texto para leitor;
- prosa que é lista escondida; listas sempre de 3 a 5 itens; seções todas no ritmo afirmação → explicação → ressalva → lição;
- substantivo abstrato no lugar do termo do campo ("camada", "superfície", "lógica", "fronteira", "eixo");
- afirmação forte sem fonte rastreável; pesquisa ou patente tratada como prova de comportamento atual;
- resposta enterrada; seção que só faz sentido para quem leu a anterior;
- conceito prometido no título da seção e não definido logo abaixo.

Ordem da entrega: achados primeiro, por gravidade; depois uma segunda passada curta atrás de resíduos; reescrever só depois.
**Revisão independente:** quem escreveu não é o revisor do próprio texto publicável. Autorrevisão vale como autoavaliação, não
como gate.

## 3. Variabilidade editorial (só quando o texto está correto mas liso demais)
1. Confirme que o texto já é útil e correto — variabilidade não conserta conteúdo fraco.
2. Ache o problema real: cadência, densidade, simetria, falta de textura ou série repetida.
3. Escolha **3 a 5** recursos para o bloco, não todos: contraste de tamanho de frase e parágrafo, detalhe concreto, fricção,
   mudança de pressão, um recorte próprio.
4. Tire **20% a 40%** do que acrescentou se começar a formar um padrão novo.
5. Releia a sequência inteira, não só o trecho.
6. Frase densa com abstração: teste a versão direta; se diz o mesmo sem perda, fique com a direta.
7. Não "humanize" com gíria, erro proposital, emoji, voz de WhatsApp ou troca de sinônimo palavra por palavra — mude pressão,
   ordem e enquadramento.

Heurística rápida: apagando a primeira e a última frase do parágrafo, o meio fica melhor? Então apague.

## 4. Checklist final (antes de entregar)
- Soa como alguém que faz o trabalho?
- Tem algum parágrafo que dá para tirar sem perder sentido?
- As duas ou três "marcas de montado" de sempre continuam aparecendo?
- A afirmação mais forte tem caminho de fonte fácil de mostrar?
- O leitor frio entende sem o contexto da conversa?
