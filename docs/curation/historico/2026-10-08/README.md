# Curadoria — rodada de 08/10 (a primeira; a base)

Esta é a rodada que o prompt de 11/10 cita como **"última curadoria 08/10 23:34"**. Ela é a
**base do ponteiro**: as rodadas seguintes medem o delta *a partir dela*.

## O que a rodada produziu

Não houve arquivo de coleta separado nesta rodada — ela **escreveu direto no catálogo**, e o
registro é o próprio histórico do repo:

| Evidência | Onde |
|---|---|
| Último commit da rodada | `8f71263` — 2026-10-08 23:34:16 -03 (merge PR #3 `feat/tars-dev9-secrets`) |
| Memórias perenes do agente | `.ai/memory/agent/**` (a rodada de 08/10 é a origem do diretório) |
| Lições 8 e 9 (autoria e push) | `git log -- .ai/memory .ai/governance` a partir de `3c89584` |
| Release da rodada | `0.0.1-dev.8` → `0.0.1-dev.9` (`8f71263`) |
| Primeiro registro de lições de plataforma | `9e2f588` — "platform lessons and the first perennial memories" |

## Por que a rodada não tem pasta de artefatos

O formato A/B/C (coletas em `.md` → consolidação → plano) **só nasceu em 11/10**. Em 08/10 a
curadoria era "ler, julgar e escrever direto no catálogo": memória perene + governança +
lições. Por isso esta pasta registra o **ponteiro e a evidência**, não o conteúdo — o
conteúdo está no repo, versionado.

## Ponteiro

```
tars = 8f71263   (2026-10-08T23:34:16-03:00)
```

As rodadas seguintes leem `git diff 8f71263..<HEAD>` nos **caminhos de conhecimento**
(§2 de `docs/CURATION.md`).
