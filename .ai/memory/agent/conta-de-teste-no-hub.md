---
name: conta-de-teste-no-hub
description: "Para conferir tela no hub de dev eu entro com a conta de teste do seed (e2e@segtools.local), nunca digo que \"não posso entrar\""
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T12:15:25.014Z
---

Existe conta de teste no banco de dev e no do e2e: usuário e senha padrão em `apps/hub/e2e/global-setup.ts` (`E2E_USER`, sobrescrevível por `E2E_USER`/`E2E_USER_PASSWORD`). O dono autorizou em 02/10: "só eu e você, sem dados reais no sistema; não é problema de segurança".

**Why:** 02/10 eu disse que o navegador abriu deslogado e que não entrava com a conta dele — e fui ver código/log em vez da tela. O dono: "você tem uma conta de teste, não? Já havia criado".

**How to apply:** verificação visual no `http://localhost:47000` → logar com a conta do seed (preencher o form `identifier`/`password`; o primeiro login pode levar ~20 s com o Turbopack frio). Nunca usar a conta do dono (a sessão é o ator — assina como ele). Valores não vão para o chat. Relacionado: [[hub-em-localhost]].
