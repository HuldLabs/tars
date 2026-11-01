# Avaliar o catálogo para um repo

Instalar o Tars não basta: o `sync` só traz o que está declarado. Este é o passo que decide o
que declarar. Faça-o **na adoção** e **em toda atualização**, sem esperar alguém pedir.

## Na adoção

1. Liste o que existe e o estado no repo:

   ```sh
   tars catalog
   ```

   Cada item sai como `adotado`, `recusado` ou `pendente`. Sai com erro enquanto houver pendente.
2. Analise o repo: stack, CI, deploy, serviço com estado, backup, segredos, quem comita, hooks
   e regras próprias.
3. Para cada pendente, leia a ficha (`GATE.md`, `SKILL.md`) e decida:
   - **Adotar:** declare no `.ai/tars.toml`.
   - **Adaptar:** adote e registre o parâmetro em `[gates.params.<nome>]`.
   - **Recusar:** registre o motivo em `.ai/catalogo-decisoes.json`.

   ```json
   { "gates/healthcheck": { "porque": "repo sem serviço" } }
   ```

4. Compare as regras próprias do repo com o catálogo: a duplicata sai do repo, e o que for
   melhor que o catálogo vira proposta de `tars promote`.
5. Rode `tars sync`, `tars check` e `tars doctor`, e comite manifesto e decisões.

## Em toda atualização

1. Faça a atualização de `adocao.md`, seção 4.
2. Rode `tars catalog`: só o que é novo aparece como `pendente`.
3. Leia em `tars upgrade-notes` o que mudou nos itens adotados e faça as ações do consumidor.
4. Reveja uma recusa quando o motivo tiver mudado, por exemplo se o repo ganhou um serviço.
5. Decida cada pendente como na adoção.

## Terminou quando

`tars catalog`, `tars check` e `tars doctor` saem com código 0, e `tars adopt` só traz avisos
que você decidiu manter.
