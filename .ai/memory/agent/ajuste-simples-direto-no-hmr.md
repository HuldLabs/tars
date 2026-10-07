---
name: ajuste-simples-direto-no-hmr
description: "Ajuste simples de UI/código se faz direto no checkout com o hub em Turbopack (HMR), sem worker, worktree nem e2e"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-26T17:28:16.896Z
---

A metodologia base do segtools é o `next dev` Turbopack (porta 47000) para ver cada ajuste em tempo real. Ajuste simples = editar direto no checkout principal, olhar na tela (HMR), conferir o console e commitar.

**Why:** em 26/09 o dono reclamou que worktree + worker + e2e + revisão transformaram ajustes de 1–3 min em mais de 20 min, e que isso inviabilizou a metodologia de codificação.

**How to apply:** worker/worktree só para tarefa com lógica real ou para trabalho em paralelo. Tela quebrada ou ajuste visual: corrigir no main, com o hub rodando, e validar no navegador. Ver [[coordenador-so-despacha]]: esta regra vale como exceção para ajustes simples.

Atualização 26/09 (dono): "apenas despacho do deepseek, rápido, sem teste e2e, sem esteira complexa, coisas básicas como antes de migrarmos para o WSL". Nada de watchdog/heartbeat, revisão adversarial, e2e obrigatório ou screenshot por padrão; o projeto não tem maturidade para isso. Prioridade é agilidade.
