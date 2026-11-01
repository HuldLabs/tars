---
root: true
---

# Doutrina: onde mora o dado do projeto

Dado perene mora em `data/`, separado por finalidade: `runtime/`, `dev/`, `poc/`, `bench/`.
`var/` não é convenção, e `.cache/` é o único descartável (decisão do dono, 01/11/2026; migração
do Kerr). Antes de apagar `.cache/` nada se perde; antes de mexer em `data/`, vale
`estado-exige-datadir.md`.
