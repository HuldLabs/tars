# fixtures da memoria operacional

`operational-memory.jsonl` — fixture de teste do `ai-memory.test.mjs`.

## Por que existe

O Tars e' **catalogo**, nao projeto consumidor: a memoria operacional DELE nasce
**vazia** (ou so' com entradas sobre o proprio Tars). Antes, o teste "POSITIVO
(arquivo real)" lia `.ai/memory/operational-memory.jsonl` direto — que hoje e' a
memoria do segtools copiada (484 linhas, `scope: segtools`), alheia ao Tars.

Essa copia quebra o gate por dois motivos legitimos:

- as `source_refs` apontam para arquivos so' existentes no segtools
  (`HANDOFF.md`, `.cache/backfill/*.jsonl`), que nao existem aqui;
- os `scope` sao do segtools, nao do Tars.

## O que os testes fazem

- **Fixture** (este arquivo): valida o schema contra entradas boas — e' o contrato
  que roda sempre (R3: memoria e' de cada projeto).
- **Arquivo real**: so' e' julgado **se nao estiver vazio** (`it.skipIf`); assim o
  gate do Tars nao depende do conteudo herdado de outro repo.

As `source_refs` da fixture apontam para `AGENTS.md` e `CLAUDE.md` — saidas geradas
que **existem na raiz do Tars** (geradas por `rulesync`; ver `.ai/README.md`).
