---
name: cspell-curator
description: Curadoria do dicionário próprio do cspell — corrigir o texto antes de liberar a palavra, conferir com `cspell trace` se um dicionário importado já cobre, separar o dicionário por domínio e nunca transformar o dicionário em lixeira. Use sempre que o cspell reclamar, ao mexer em `cspell.config.yaml`, em `.cspell/*.txt` ou em mudança com muito texto (docs, pesquisa, i18n).
---

# Curadoria do dicionário (cspell)

> Dicionário sem curadoria vira um ciclo sem fim: a palavra errada entra para calar o checker, a forma
> certa passa a falhar, e depois as duas convivem. O cspell só serve se o dicionário for **curado**.

## Origem (portado, não reinventado)

- **tokenhood**, `.ai/skills/project/cspell-curator` (a versão mais completa): dono da config, dicionários
  importados escolhidos com cuidado, dicionário próprio que não vira lixeira.
- **farmega**, `docs/operations/licoes-aprendidas.md` LA-004: o dicionário cresceu sem controle; a correção
  foi rodar `cspell trace` antes de incluir uma palavra. LA-014: só entra o termo realmente específico do repo.
- **farmega.v2** e **agent-skills**, a mesma skill em versão curta; **dotfiles** e **farmega**, `.cspell.json`.

## Ler primeiro

- `cspell.config.yaml` (idiomas, `import`, `ignorePaths`, `dictionaryDefinitions`);
- `.cspell/*.txt` (os dicionários próprios);
- a regra de idioma do projeto (sistema em inglês, docs em português): ela decide se o certo é corrigir a grafia
  ou **traduzir o comentário**.

## Fluxo, por palavra recusada

1. **A palavra está errada?** Corrija no texto. Um erro de digitação nunca entra no dicionário.
2. **É português sem acento em código ou comentário** (`padrao`, `versao`, `excecao`)? O erro é de idioma, não
   de dicionário: o comentário vai para o inglês (a regra de idioma). Em doc, acentue.
3. **Algum dicionário já cobre?** `npx cspell trace <palavra>`. Se cobrir com outra grafia, use essa grafia. Se
   falta um dicionário oficial (`@cspell/dict-python`, `-software-terms`, `-pt-br`, `-es-es`, `-docker`...),
   importe o dicionário, fixado por versão exata, em vez de listar palavra por palavra.
4. **O termo é real, estável e do repo?** Só então ele entra, no arquivo certo:
   - `project-words.txt`: nomes de projeto, ferramentas, siglas e identificadores do repo;
   - `<domínio>-terms.txt` (exemplo: `health-terms.txt`): termos técnicos do domínio, nomes de autores e de periódicos;
   - uma palavra que aparece num único arquivo gerado ou citado (bibliografia, lockfile, `openapi.json`) não entra:
     o arquivo vai para `ignorePaths`.
5. **Mantenha o arquivo ordenado e sem duplicata** (`LC_ALL=C sort -uf`), uma palavra por linha, sem comentário
   no meio.
6. Rode o cspell de novo até zerar, e faça o commit do dicionário **junto** com o texto que pediu a palavra.

## Regras

- Nunca use o dicionário para calar o checker: um erro de digitação fica corrigido no texto.
- Nunca use `cspell:disable` em bloco nem `ignoreRegExpList` amplo para fugir da curadoria. Exceção por linha,
  só com o motivo ao lado.
- Grafia errada que já entrou e é recorrente vai para `flagWords` (exemplo: `possivel`, `tambem`), e o checker
  passa a recusá-la.
- `ignorePaths` só para o que não é texto do repo: vendor, `.ai/base/**` (vem do Tars), `.cache/**`, lockfile,
  arquivo gerado, citação bibliográfica literal.
- Palavras pessoais (nomes de gente) não vão para o dicionário compartilhado: entram em `ignoreWords` do arquivo
  ou o texto as evita.
- Mudança de config (idioma, import, versão) é decisão registrada no CHANGELOG ou na ADR do projeto.

## Verificação

`npx cspell@<versão-fixa> --no-progress --gitignore "**/*"` no gate do repo (pre-commit). O gate falha alto: zero
palavra desconhecida.

## Histórico

- 20/11/2026: portada para o Tars (tokenhood + farmega LA-004/LA-014 + farmega.v2), com a regra de idioma, os
  dicionários por domínio e `flagWords`. Pedido do dono: "dicionário próprio curado para não cair em erros infinitos".
