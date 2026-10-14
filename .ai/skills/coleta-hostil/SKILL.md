---
name: coleta-hostil
description: How to collect data from a source that does not want to be collected — anti-detection browser work, geo/market-anchored requests, session warm-up and persistence, and the failure modes that make a blocked run look like a successful one. Covers the split between parameters that change the RESULT and parameters that only change detectability, the safe path as the only path, and why zero results is never success. Load BEFORE writing or debugging any collector, scraper, crawler or anti-bot capture, and whenever a collection reports "ok" with nothing in it.
---

# Coleta a partir de fonte hostil

> **Origem (R1):** portada do SSOT do coletor do seo-brain (`docs/research/convencoes-coletor.md`,
> as 5 regras não negociáveis + as lições de `serp_capture.py`/`ledger.py`) e do INV-FAIL-1
> (`tests/test_serp_failloud.py`), generalizadas — host, alvo, mercado e nomes de serviço
> ficaram de fora. Registro em `docs/CURATION.md`.

Uma fonte hostil não devolve "não": ela devolve **uma página plausível** — vazia, genérica, ou o
formulário de bloqueio — e o coletor ingênuo grava isso como sucesso. Todo o resto desta skill
existe para que esse caso seja impossível de confundir com coleta.

## 1. Dois parâmetros que parecem um (B3.1)

Antes de variar qualquer coisa, classifique cada parâmetro da requisição:

- **Muda o RESULTADO** — geo/mercado/idioma/dispositivo positado, faixa de data, vertical. Esses
  vêm do **SSOT do domínio** (o cadastro do alvo), nunca de um default de biblioteca nem de um
  sorteio de "parecer humano". Sortear `hl`/`gl`/`device` produz uma coleta de **outro mercado**
  com cara de sucesso.
- **Só muda a DETECTABILIDADE** — UA, viewport, tempos, fingerprint, ordem de headers. Esses são
  livres para variar; variar é o trabalho.

Confundir as duas classes é o defeito-raiz de metade dos incidentes de coleta: a "melhoria" de
anti-detecção muda o resultado, e ninguém percebe porque o pipeline seguiu verde.

**Corolário — derive, não re-derive.** A chave de contexto de um registro filho (qual mercado,
qual keyword) vem **do registro-pai coletado**, nunca reconstruída chamando a função de novo com
os defaults dela. Reconstruir "a partir do nome" cola o parse de um mercado no registro de outro.

## 2. O caminho seguro é o ÚNICO caminho (B3.2)

Stealth não é opção nem flag: é o **default do caminho de captura**. Ligar-por-flag garante que
alguém — o script de debug, o notebook, o caso de borda — chame o caminho cru, e o caminho cru,
sendo mais barato, vira o mais usado.

O mesmo vale para o navegador: **sem o binário real declarado, o coletor levanta erro nomeando o
que falta**, nunca cai calado no substituto que se sabe detectável. Se existir fallback, ele exige
**env explícita E aviso no stderr** — nunca é o silêncio que decide.

## 3. Zero resultado nunca é sucesso (B3.3)

0 itens é `empty` ou `bloqueado`; **nunca** `ok`. Um coletor que devolve "ok, 0 resultados" é
indistinguível de um coletor quebrado, e é assim que um pipeline de meses roda sobre uma fonte que
já bloqueava desde a primeira semana.

- Ausência de dependência, de credencial ou de página esperada → erro **nomeando o que faltou**.
- Resposta que não casa com a forma esperada → `bloqueado`, com o motivo medido (status, título,
  seletor que faltou), não "0 itens".
- O status faz parte do dado: quem consome precisa poder distinguir "não havia nada" de "não
  consegui olhar". Se o schema não tem esse campo, o schema é que está errado.

## 4. Ordem de navegação e sessão (B3.4)

- **Aqueça a origem antes do alvo profundo.** `goto` direto na URL interna é o padrão **mais**
  detectável; passar pela raiz antes põe cookies/consent e muda o veredito. A ordem de navegação é
  parte do procedimento, não detalhe de implementação.
- **Perfil persistente entre tentativas.** Um `user_data_dir` fixo (em vez de um diretório
  temporário por tentativa) faz a segunda tentativa ser uma sessão que já viu a origem — veredito
  diferente de quem chega virgem. Repetir a coleta num perfil novo mede o bloqueio, não a coleta.
- **Cookie de sessão autenticada é credencial.** Não versionar, não logar, não colar em issue:
  vale a regra de segredos do repo (`docs/STANDARDS.md`).

## 5. Quando parar

Coleta hostil não se "insiste" em laço: tentativa repetida no mesmo perfil, no mesmo minuto,
em volume, é a assinatura que a fonte procura. O laço de retry é uma decisão explícita com teto —
quando o teto estoura, o resultado é `bloqueado` **com o motivo medido**, não um sucesso vazio.

## Checklist antes de entregar um coletor

- [ ] Todo parâmetro classificado: muda o resultado (vem do SSOT) × muda a detecção (livre).
- [ ] O caminho de captura aplica stealth/perfil real **por padrão**; não há flag para desligar.
- [ ] Dependência ausente **levanta erro nomeando o que falta** — não degrada em silêncio.
- [ ] Resultado vazio sai como `empty`/`bloqueado` com motivo; **nunca** `ok`.
- [ ] Fallback (se existir) exige env explícita **e** avisa no stderr.
- [ ] A ordem de navegação aquece a origem antes do alvo profundo.
- [ ] O perfil de sessão persiste entre tentativas e o cookie não vaza para o entregável.
