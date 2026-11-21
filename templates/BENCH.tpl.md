<!-- docs/engineering/bench/NNN-<slug>/REPORT.md; dados brutos ao lado (ex.: hyperfine --export-json). -->
# Bench NNN · <o que se mede>

- Data: AAAA-MM-DD · commit: <sha> · rodada: <n>

## Ambiente

<CPU, RAM, SO, kernel, versões de runtime e dependências, carga concorrente>

## Método

- Warmup: <n> · execuções: <n> · ferramenta: <ex.: hyperfine x.y>
- Baseline: <com o que se compara>
- Comando:

```bash
<comando exato>
```

## Resultado

| Caso | Mediana | Desvio | Mín–máx | vs baseline |
|---|---|---|---|---|
| <…> | <…> | <…> | <…> | <…> |

## Análise ativa

<fator limitante observado durante a medição (CPU, I/O, lock, rede) e a evidência; Gregg, active benchmarking>

## Ameaças à validade

<o que pode distorcer (Heiser, benchmarking crimes): subconjunto escolhido, cache quente, média sem dispersão…>

## Dados brutos

<arquivos ao lado>
