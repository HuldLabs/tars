# Skills canônicas (central)

Local canônico dos bundles **genéricos**, reutilizados em qualquer auditoria de segurança ou
extração. Padronizar aqui mantém **qualidade linear** entre projetos.

| Bundle | O que é |
|---|---|
| `security-testing/` | Testes/auditoria de segurança (base + módulos): authz/IDOR, BaaS-direct, evidência/paridade/proveniência, injection, edge-allowlist, auth/identity, secrets, headers/cookies, webhooks/payments, CI gates, AI-code flaws, deploy drift. Inclui `fabber-bindings.md` (hosts/invariantes/findings do Fabber) e `CHANGELOG.md`. |
| `app-extraction/` | Extração de app live → offline: base (5 fases), matriz de isolamento, regras de mock, contrato de documentação por app, e módulos por stack (Supabase-direct, Next.js SSR, Clerk, Vite/Rolldown, roteamento SPA, vanilla, servidor local, stubs/mocks, auth-bypass, realtime, live→offline parity, verificação CDP, gotchas Windows). |
| `EVOLUTION.md` | **Passo obrigatório de auto-evolução** (retrospectiva ao fim de toda sessão): colher aprendizados, mapear cobertura (COVERED/PARTIAL/MISSING/N/A) e atualizar os bundles. Disparado por `AGENTS.md`/`CLAUDE.md` do repo. |

## Princípios

- **Bundles são vivos**: cada stack/obstáculo novo vira um módulo; todo módulo tem as 5 seções
  + linha **Related** + entrada no `CHANGELOG.md`; toda adição precisa de um incidente real.
- **Superado por skill ⇒ aposentar, não mergear.** Quando uma prática antiga (um doc, um
  script, um runbook, um trecho de prompt) foi **substituída** por uma skill canônica, a
  saída é **aposentar** a origem — não fundir o texto antigo dentro da skill nova. Mergear
  preserva as duas versões com pequenas divergências, e a partir daí ninguém sabe qual vale:
  a regra volta a ser ambígua exatamente na camada que existe para acabar com a ambiguidade
  (R3). Ao aposentar: a skill nova recebe o que ainda for regra, a origem ganha um ponteiro
  curto apontando para a skill, e o corpo antigo some — o histórico fica no git, não em
  prosa duplicada.
- **Auto-evolução é obrigatória e automática**: ao fim de toda sessão, a retrospectiva
  (`EVOLUTION.md`) roda por padrão (sem o usuário pedir) — ver `AGENTS.md`/`CLAUDE.md` do repo.
- **Sem dados de cliente nos bundles** (hosts/chaves/tokens/PII) — no máximo o nome como
  proveniência de uma lição.
- **Documentação normativa** no repo de extração: `docs/METHODOLOGY.md`,
  `docs/EXTRACTION-STANDARD.md` (contrato per-app incl. a etapa Live→offline, §4).
- **Duas camadas**: `app-extraction` coloca o app **rodando**; `security-testing` testa o que
  isso **expõe**. Mantenha separadas e cruzadas por referência.

> Próximo passo: empacotar este diretório num repositório dedicado de skills e trocar os
> ponteiros no repo do Fabber por **git submodule** (ou symlink).
