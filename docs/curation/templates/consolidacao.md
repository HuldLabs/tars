# Curadoria → Tars, fase 1b: CONSOLIDAR as coletas num plano de release para o dono revisar (só leitura)

> **Template reaproveitável.** Portado de `/workspace/.cache/prompts/w-curadoria-consolida.md` (curadoria de 11/10).

Entradas: `SAIDA/*.md` (as coletas, leia inteiras). Tars: `<TARS>` (versão corrente `<versão>`) e as branches de
trabalho em aberto.
Saída: `SAIDA/PLANO-RELEASE-<rodada>.md` (≤200 linhas), em português, para o dono decidir.

1. Deduplique: um item por ideia, com todas as fontes (arquivo:linha) agrupadas.
2. Seções:
   - (A) **Bugs do Tars** → corrigir na próxima release;
   - (B) **Melhorias/novas regras genéricas** (lições, armadilhas, guards/gates novos) → cada uma dizendo **ONDE
     entra** no Tars (memória base, governança, regra de boot, gate, guard, skill, template de prompt de worker) e
     se vira **GATE** (regra sem gate é sugestão);
   - (C) **Registro de acessos da automação**: o que existe, o que falta, o que entra;
   - (D) **Regra nova do dono**, com o texto proposto para os 3 lugares (R3);
   - (E) **Ecossistema → org** (decisões transversais);
   - (F) **Contradições** entre repos, com a versão vigente e o que corrigir em cada repo;
   - (G) o que fica no projeto (só a contagem por repo).
3. Para cada item de A/B: prioridade (P0/P1/P2) e tamanho (fatia ≤10 min de worker ou maior).
4. No topo: um resumo de 10 linhas e **as decisões que só o dono toma**.
