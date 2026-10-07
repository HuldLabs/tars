---
name: camada-ai-agnostica
description: "A camada .ai é fonte neutra e independente de ferramenta, no PADRÃO DE MERCADO onde existe; formatos de fornecedor são só saída gerada"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T19:28:26.486Z
---

Nada no projeto pode depender de infraestrutura de agente específica. O `.ai/` (ADR-019) é a FONTE, e foi feito para ser extraído e distribuído como pacote próprio, usável com ou sem o Sofon. Formato da fonte: **o padrão de mercado onde ele existe** (ex.: `AGENTS.md`, `SKILL.md` com os campos comuns, MCP); **formato próprio só na lacuna** (papéis, guards, memória), com adaptador. `.claude/`, `.claude-plugin/`, `.codex/` e afins são **saída gerada**, nunca fonte; `ai:check` reprova saída editada à mão. Enforcement crítico também fora da ferramenta (git hooks/CI). Não construir motor próprio que reimplemente o que as ferramentas já fazem nativamente: o pacote é render (TS) + check.

**Why:** 02/10 eu propus empacotar como plugin + marketplace do Claude (formato proprietário como fonte). O dono: "nada de .claude-plugin no Sofon… posso mudar amanhã para Codex". Depois: "usar a mesma tomada USB-C em todo lugar — não quero uma tomada nossa quando o mercado usa outra"; fazer bench dos fornecedores e pegar o melhor de todos, sempre convergindo para o padrão.

**How to apply:** antes de definir o formato de qualquer peça da camada, checar se há padrão de mercado (bench SEG-836); se houver, usar só o subconjunto portátil; se não, desenhar o mínimo próprio a partir do melhor dos fornecedores. Pesquisa de fornecedor é fonte de ideias, não de formato. Relacionado: [[estado-da-arte-antes-de-construir]], [[skill-so-coordenador]].
