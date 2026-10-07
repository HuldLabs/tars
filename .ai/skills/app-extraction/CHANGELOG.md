# Changelog — app-extraction skill bundle

What changed, when, and why. Newest first. This bundle is **living**: every new stack/mirror
obstacle we hit is distilled into a module here, so the next extraction is faster and keeps the
same quality bar. Provenance rule: a client/source may appear only as the origin of a generic
lesson — never its hosts, keys, tokens, URLs or data.

## 2026-09-24 — "Ferramentas AGNÓSTICAS no bundle (adaptar, não reescrever)"

O que era per-app virou **genérico e parametrizado** em `tools/` (catálogo em `SKILL.md §6.1`):

- `app-netlog.js` + `app-livecapture.mjs` — captura **toda** HTTP real (reads+writes) numa sessão CDP,
  acumulando por navegação (injeção `document_start`; obrigatório p/ BaaS que liga o `fetch` no boot).
- `app-ui-inventory.mjs` — inventário de controles por tela.
- `app-button-audit.mjs` — clica **cada botão** (estado limpo), classifica `navigated/modal/content-changed/no-op/error`.
- `app-error-sweep.mjs` — erros de console + root vazio por tela (pega crash).
- `app-parity.mjs` / `app-parity-diff.mjs` — paridade por view (apps com `window.api`).

**Só ficam per-app:** o **seed** (dados) e **nossa API** (`server/<slug>.js`) — adaptados de template.
Validado no alvo: as ferramentas genéricas rodaram sem alteração (0 crashes; 1 `console.error` benigno).

## 2026-09-24 — "Achados de wiring que viram norma (shape completo do registro)"

Rodada de verificação tela-a-tela (offline só). Três armadilhas reais, agora na skill:

- **Shape COMPLETO do registro salvo**: um card de "Precificação Salva" lia `preco_final/lucro_final/
  margem_final` + os campos de cálculo — sem eles, **card zerado** e "Reprecificar" parecia quebrado.
  Regra: ao reimplementar/seed, incluir **todos** os campos que a UI mapeia (não só os "óbvios").
- **Shape errado CRASHA a tela** (root vazio, sem erro de console): `full_planejamentos` esperava
  `{empresa,data_envio,produtos:[{nome,quantidade}],volumes}`; um shape inventado derrubou a rota.
  Regra: **extrair o shape do render** (`select`+`map`/uso no JSX) antes de semear; `root` vazio = falha.
- **Placeholders são estado válido** ("Em breve: …"): não confundir tela vazia por design com dado
  faltando. **Ferramenta:** `tools/makers3d-errors.mjs` (coletor no `document_start`, varre console+root
  por rota) — achou **0 erros/crashes** em 18 telas.
- **`app-parity.mjs` (genérica) não pega BaaS-direct**: o supabase-js **liga o `fetch` no boot** —
  envelopar depois do load captura **0**. Para BaaS-direct, usar **netlog em `document_start`**.

## 2026-09-24 — "Extract completo: DoD, nossa API real, definição REAL, matriz (client+server), VERIFY"

Rodada de consolidação — o extract passa a ter **um único Definition of Done** e cada peça virou norma:

- **`SKILL.md` §2 — Definition of Done (checklist único):** pareamento 100% visual → roda isolado +
  **hub iframe** → **nossa API real sobre SQLite** → **funcionalidade verificada** (paridade por ação,
  CRUD com persistência+tempo real, **matriz de cálculo client E server-side**, **definição REAIS**) →
  **seletor de perfil** → docs (`PARITY.md`/`VERIFY.md`/`ui-inventory`/`live-requests`) → **EVOLUTION**.
- **Dados de DEFINIÇÃO/REFERÊNCIA — sempre REAIS** (taxas, correlação, selects, catálogos, enums):
  de **uma de três** fontes — **API viva**, **bundle** (embutido) ou **defaults da app** — **nunca
  inventados**, e **rotulados** (`live-api-reverse-engineering` passo 3b + `EXTRACTION-STANDARD` §4.1.6).
  (Select vazio / default `NaN` = definição faltando; inventar = divergir da live.)
- **Matriz de valores múltiplos/aleatórios** para auferir lógica — inclusive **server-side que não está
  no bundle** (edge function/RPC/endpoint computado): variar inputs, ler outputs, derivar a regra.
- **Verification procedure** (módulo): inventário de controles → **change-it-and-assert** → **CRUD**
  (payload + salvou? + tempo real) → **matriz** → **doc drift**. Artefatos `ui-inventory.json` + `VERIFY.md`.
- **Symmetric seeding:** live E offline com os **MESMOS valores, todos os campos, um de cada tipo/status**.
- **Nota de comparação:** no **mesmo papel + mesmo seed** (free ≠ max-access) + *deploy drift*.

**Por quê.** No alvo de hoje descobrimos na prática: `.maybeSingle()` como array → tela `NaN`; RLS
inconsistente (uma tabela gravava com conta não-aprovada); bug de margem no teto (preço 0/prejuízo);
seleção de categoria que recalcula; frete/taxa = tabelas embutidas. Tudo isso agora é **procedimento**,
não improviso.

## 2026-09-24 — "## 2026-09-24 - Versioning & backup mandatory: git + OneDrive mirror, commit every step

**Incident.** The monorepo held thousands of files (extracts, DBs, evidence) with **no version control**
and no backup — one bad edit from irrecoverable, and the owner flagged it.

**Change.** `SKILL.md` gains **§2.1 (mandatory)**: init git if absent; commit everything (assets,
`_data/*.db`, `_auth`, `_evidence`, `_recon`, docs, skills); **commit after every step**; mirror the
history with a **bare repo in OneDrive** wired as a remote (`git clone --bare … D:/onedrive/…git`,
`git remote add onedrive …`) and `git push onedrive --all` after each commit. Working dir stays at its
canonical path (absolute paths keep resolving); OneDrive holds history/rollback. Mirrored in
`security-testing/RUNBOOK.md`.

**Why.** Real-time backup + fine-grained rollback; no step ends without a commit.

## 2026-09-24 - Canonical order fixed: pentest anon -> pentest auth -> extraction

**Incident.** The order was re-debated per client. It is now fixed as the default.

**Change.** `SKILL.md` §3 opens with a numbered **ORDER** block: (1) security **Pass A anon** on the
live; (2) security **Pass B authenticated** (owner logs in once; session persisted for autonomy);
(3) **extraction** from the dossier both passes produced (materialize the client's own DB -> offline
app + evidence dashboard + parity). "Do not re-litigate." Mirrored in `security-testing/RUNBOOK.md`
(16th round).

**Why.** Anon = worst case, no credential, cheapest surface map; auth completes the tenant data and
the privilege picture; extraction proves both. Fixed order for every client.

## 2026-09-24 - No split: the base IS the client's own DB (by construction)

**Incident.** We were treating "the live DB" and "our seed" as two datasets to reconcile. But the
exposed rows *are* the client's own rows, served by the **same** database that feeds the live app — so
splitting them is unnecessary and makes parity meaningless.

**Change.** `SKILL.md` §3 Phase 5 and `modules/live-api-reverse-engineering.md` step 4 now state: the
client's database is the single base **by construction**; the mirror **materializes** it (faithful copy
of the same schema + rows) and every surface derives from it. "Seed realistic data" = **copy the
client's real rows**, never a synthetic/parallel set.

**Why.** One base, several surfaces; a synthetic seed re-creates the split and breaks the parity claim.

## 2026-09-24 - One unified SQLite per client; the offline app + evidence dashboard are surfaces over it

**Incident.** The contract requires the **complete capture** persisted in the client's SQLite, and
from it derive the **offline version** and the **evidence dashboard** — one base, different surfaces,
never two stores that drift.

**Change.** `SKILL.md` §3 Phase 5 now states it explicitly ("one unified database per client
(`apps/<app>/_data/<app>.db`); the offline app and the evidence dashboard are **views over the same
DB**"). `modules/evidence-panel.md` reads that same DB (not a separate `evidence.db`);
`modules/live-to-offline-parity.md` done-criteria updated (full rows in the client's SQLite; no
masking/deletion).

**Why.** A single reconciliable base is what makes the parity claim and the exposure provable.

## 2026-09-24 - Sequencing: the security recon runs first

**Incident.** The order of the two bundles was implicit. The owner noted the **security recon/pentest
pass runs first** on the live, because it discovers (cheaply) the endpoints, RPCs/tables, authz and
BaaS/RLS exposure that the extraction needs.

**Change.** `SKILL.md` §3 opens with a "Sequencing" note: run the read-only security recon (companion
skill, Pass A anon) before/at Phase 0; it feeds Phase 0's bounding and Phase 5's reimplementation.
Mirrored in `security-testing/RUNBOOK.md` (14th round).

**Why.** One loop: the audit finds what to extract; the extraction proves what the audit found.

## 2026-09-24 - Phase 1.5: authenticated capture + autonomy (credentials/tokens)

**Incident.** The owner had to say, repeatedly, "I'll log in and you save the credentials/refresh
token so you never need me again". Phase 1 mirrored only the public surface; the authenticated
capture + the **autonomy** (so later re-capture/parity/verification don't need the owner) lived only
in the chat.

**Change.** `SKILL.md` gains **Phase 1.5 — authenticated capture + autonomy (default, don't wait to
be asked)**: front the window (`cdp-focus.mjs`) for a one-time owner login; persist the session
(`cdp-session.mjs` → `apps/<slug>/_auth/session.json`, **never deleted**; restore with
`cdp-restore.mjs`); **token auth → persist the refresh token + auto-refresh**; **server-side session →
keep a test-account credential + auto-login**; record where the autonomy lives in `EXTRACTION.md`.

**Why.** Autonomy turns "re-login each time" into a one-command step and is a precondition for the
Phase-5/6 captures on the real (authenticated) shape. Mirrored on the security side (two passes:
anon then authenticated — `security-testing` 13th round).

## 2026-09-24 - Evidence panel is a deliverable (module + §2/§7.1)

**Incident.** The navigable evidence panel was only implicit — a parenthetical in §7.1 ("if there is
one") — yet two clients already ship one (`server/makers3d-evidencias.js` :8094,
`server/querovender-evidencias.js` :8090) and a client asked for it as a first-class deliverable
("painel de evidencias navegavel"). The same proof exists as raw JSON, but a folder is not what a
client reads.

**Change.** New module **`modules/evidence-panel.md`** (own port + `/api/<dataset>`/findings/recon
endpoints + one tabbed HTML page + hub branch `/apps/<slug>-evidencias` + card). `SKILL.md` §2
(definition of done) and §7.1 now list the panel as a **deliverable**, not optional when evidence
exists. No masking (owner contract keeps evidence raw; see `security-testing` §3), local-only.

**Why.** "100% offline, self-contained, navigable" is the bar for the app **and** its proof.

## 2026-09-24 - Cloudflare/CDP fetch module + generic parity tool

**Incident.** Two recurring obstacles were only in the chat, not in the bundle: (1) sources behind
**Cloudflare** (QVE family, makers3d, PrintCal) can't be captured from the shell — the working path
is a **real Chrome over CDP** (persistent profile, one manual login, in-page `fetch`) or **Camoufox**
(`tools/camofox-fetch.mjs`), plus session save/restore; (2) the per-view parity diff had per-app
scripts instead of one reusable tool.

**Change.** New module **`modules/cloudflare-cdp-fetch.md`** (Cloudflare/WAF fetch + the CDP tool
family + session continuity + origin-lockdown cross-ref). New generic tools
**`tools/app-parity.mjs`** + **`tools/app-parity-diff.mjs`** (wrap `window.api` and/or
`window.fetch`, auto-detect nav, per-view action+signature diff). `SKILL.md` §6 toolbox rewritten
(full CDP family + parity + Cloudflare) and §8 gained the module row. Proven: on QVE Financeiro the
generic tool reproduced **0 diffs in 20 calls** (16 views).

**Why.** A method that lives only in a transcript is not a method. Both were things we *did, tested
and reused* — they belong in the bundle.

## 2026-09-24 - Pareamento TELA-A-TELA + nossa API real (paridade por ação) — norma obrigatória"

O extract deixa de ser "mirror + stubs" e passa a exigir, por padrão (sem o usuário cobrar):

- **Fase 5 (método) — nossa API real sobre SQLite**, não mock: implementa o contrato (REST/RPC/auth),
  **computa e persiste**; shapes corretos (`.single()`→objeto, listas→`[]`, 406 se single vazio, sem
  `id:"0"`), escopo por dono, **seed verossímil** (nomes reais do domínio, nunca "teste1").
- **Fase 6 (método) — pareamento tela-a-tela live × versão real, funcionalidade por funcionalidade:**
  capturar **toda** chamada HTTP de **toda** tela e **todo** botão/valor (leituras **e** escritas) com
  **netlog no `document_start`**, numa **sessão CDP**, **acumulando** por navegação; reproduzir na
  nossa API e montar a matriz `tela × ação × payload → status + persistiu + renderizou`. Cobrir
  CRUDs, **cálculos** (matriz de inputs → deriva a fórmula), contas e imports. **Diff visual** por tela.
- **Popular dados verossímeis de TODOS os tipos** para exercitar cada tela/botão.
- `docs/EXTRACTION-STANDARD.md` §4.1 (norma) + §6 (checklist: `PARITY.md` por ação, hub, seletor de
  perfil); `EVOLUTION.md` §6 passa a cobrar isso no fechamento.
- Achado real desta rodada: **`.maybeSingle()` exposto como array → tela em `NaN`** (corrigido).

Terminologia: **não é mock** — é a nossa API real sobre o nosso SQLite.

## 2026-09-24 - Parity runner + two silent-parity traps (QVE Financeiro)

**Incident.** Finishing the finance app's offline clone, the "0 diffs" claim was, for a while, a
lie in two ways. (1) The mock served captured bytes for **computed** actions from a cache-first
set (`kv`), so `getPlanejamentoDRE`/`listarFluxoCaixa`/`getMinhaAssinatura` diffed *clean* while
returning all-zero aggregates - the parity number only became real once those actions were removed
from the cache and **computed** from the rows. (2) A per-view probe run inside the browser hung on
views whose role-gated menu redirects. And the captured `session.json` could not be restored after
the server invalidated the PHP session (`me=null`), because the session is a server-side cookie
with **no refresh token**.

**Change.** `modules/live-to-offline-parity.md` gained a **Capture-and-diff harness (the parity
runner)** section: wrap the client helper (`window.api`), reset the buffer per view, wait **outside**
the browser, and diff by **response signature** (`ok` + length + **key count** + enum/case), running
both sides under the same role. `modules/php-action-api.md` "Known pitfalls" gained: *a computed
read must not be served from the capture cache*; *the session is a server-side cookie with no
refresh token* (store credentials + auto-login); *gate the mock by role like the live*.

**Why.** These three are silent: each one produces a *green* parity result that is wrong, which is
the exact failure mode this bundle exists to prevent. Lesson: parity is a per-action, per-role,
signature-level diff over the *computed* value - never a cached byte.

## 2026-09-24 - "Extract completo: API própria + SQLite, hub e seletor de perfil (automáticos)"

Alvo novo (Vite/React + Supabase-direct). O que passou a ser **norma** no bundle:

- **`modules/live-api-reverse-engineering.md`** (novo): o extract completo onde a camada visual é o
  **asset verbatim da live** (CSS/HTML/JS, só a API muda) e a de dados é a **nossa API sobre SQLite**.
  Cobre: capturar as requisições reais numa **única sessão CDP** (`addScriptToEvaluateOnNewDocument` +
  navegar + **acumular** `window.__reqs` — ambos são por documento/sessão; um dump único captura só a
  última rota), reimplementar CRUD + **regras computadas**, e **RE por matriz de inputs** (`_recon/logic.json`).
- **`SKILL.md` §7.1 — registro no hub é parte do "done"**: `server/apps.json` (`iframePort`) +
  card no `shell/hub.html` + branch de iframe no `server/index.js` (+ branch do painel de evidências).
  Foi esquecido uma vez → agora é checklist.
- **`SKILL.md` §7.2 + `injected-ui-and-extensions` — seletor de perfil de acesso (AUTOMÁTICO)** quando
  o app expõe menus/dados diferentes por papel (cliente/lojista/admin, free/pro, multi-portal). Um
  clique troca o papel, sem re-login; fallback por sessão/porta dedicada se o papel for server-bound.

**Por quê.** A extração só está "pronta" quando o offline é funcional (não mockup), alcançável pelo
hub como os outros, e testável em todos os papéis — sem o usuário precisar lembrar.

## 2026-09-24 — "Supabase-direct (Lovable): repoint com esquema + gate por linha de tabela"

Alvo novo (Vite/React + Supabase-direct, build Lovable). Dois pitfalls entraram em
`modules/live-to-offline-parity.md`:

- **Repoint de BaaS troca o ESQUEMA, não só o host:** substituir apenas `<ref>.supabase.co` mantém
  `https://` → `https://localhost:<port>` = TLS contra mock HTTP → **"Failed to fetch"** silencioso.
  Trocar `https://<ref>.supabase.co → http://localhost:<port>/sb` e `wss→ws`; conferir que restam **0**
  ocorrências.
- **Gate server-side é uma linha de tabela:** acesso liberado por um registro (`user_access`/
  `subscription`) lido no boot — o desbloqueio do espelho é **semear a linha**, e a **ausência de
  qualquer outra chamada** numa conta free é o achado.
- Técnica de limpeza: remover scripts do host (proxy de analytics tipo `/~flock.js`) no mirror.

## 2026-09-24 — "Sweep de retrospectiva: dispatcher PHP, UI/estensão injetada, enriquecimento de paridade"

Fechamento dos gaps da sessão multi-cliente (`docs/RETROSPECTIVE-2026-09-24-session.md`).

- **`modules/php-action-api.md`** (novo) — apps de **dispatcher único** (`api.php?action=`): enumerar
  todas as ações, inferir schema, mockar o dispatcher, e **reimplementar regras computadas** (ex.:
  DRE/fluxo derivados das transações). Cross-ref de segurança: matriz por-ação (anon×papel) e soft-403.
- **`modules/injected-ui-and-extensions.md`** (novo) — os artefatos que injetamos: **extensão Chrome**
  (MV3, world MAIN, options por domínio, Chrome ≥137 removeu `--load-extension`), **patches de gate**,
  **feature flags/betas** (flag ≠ rota; forçar todas), e **seletor de perfil multi-portal**. Com os
  gotchas de injeção (regex em template literal, loop de `MutationObserver`, `<td>` em `<thead>`,
  re-render do React, `location.hostname` unforgeable).
- **`modules/live-to-offline-parity.md`** — populate-live-via-UI + medição por **delta**; HAR **sem
  corpos** (Preserve log/Export HAR); **enriquecimento cross-source** (robots/sitemap/`site:` ↔ tabela
  vazada); **shape exato** (case/enum/campo obrigatório); anti-hydration (skeleton SSR).
- **`SKILL.md`** §8 — as duas linhas novas.

**Por quê.** Metade dos apps do engajamento é SPA vanilla + PHP de dispatcher único, e a população
fiel do espelho veio de dirigir a UI e medir o delta — era tribal, não estava no bundle. A extensão
Chrome reutilizável (options por URL, card no hub) também não tinha casa.

## 2026-09-23 - "RSC, Server Actions, BFF e o `send` com Buffer"

Extrações da rodada (Next.js + Firebase; vanilla + Firebase; Next.js + Supabase; Next.js BFF) trouxeram
quatro lições que quebram rotas silenciosamente:

- **RSC (App Router):** sem servir os **payloads RSC** (`GET /<rota>?_rsc=<hash>` + header `RSC: 1`
  → `text/x-component`, salvo em `_rsc/<rota>.txt`), a navegação client-side mostra **conteúdo errado**.
  O hash `_rsc` é build hash (agnóstico à rota).
- **Server Actions:** páginas com dado **server-computed** (`POST /<rota>` + `Next-Action`) só renderizam
  a shell offline; o painel de dados erra a menos que as respostas das actions sejam capturadas/replayadas.
  Nunca responder POST-de-página com HTML/RSC (quebra a hidratação).
- **BFF:** quando o browser não fala com o BaaS (sem anon key), não dá pra stubar o BaaS — há que emular
  os **route handlers/Server Actions**.
- **`send` com Buffer:** `JSON.stringify(Buffer)` → assets viram JSON e quebram; enviar Buffer cru.
- **Sessão `@supabase/ssr`** vive em **cookie** (base64 chunked), não em localStorage.

Detalhe em `modules/nextjs-ssr.md`.

## 2026-09-22 — initial bundle

Created alongside the `security-testing` bundle (canonical home: `D:\onedrive\segtools\.claude\skills\`,
until the dedicated skills repo exists). Distilled from the extractions of LetraMaker, CordeiroFlow,
PrintPal, Split3MF, NeoBrix, 3DPrintManager and PrintCal.

- **`SKILL.md`** — base method (5 phases), isolation matrix, mock rules, per-app documentation
  contract (points at `docs/METHODOLOGY.md` and `docs/EXTRACTION-STANDARD.md`).
- **Modules**: `supabase-direct`, `nextjs-ssr`, `clerk-auth`, `vite-rolldown-spa`,
  `spa-routing-basename`, `vanilla-static`, `node-local-server`, `stubs-and-mocks`,
  `auth-bypass`, `realtime-websocket`, `live-to-offline-parity`, `e2e-verification`,
  `powershell-windows`.

### Why
The per-app `EXTRACTION.md` docs existed but the **cross-app, per-stack knowledge** was tribal.
This bundle makes it reusable: a new app's stack maps to module(s) before touching anything.

## 2026-09-22 — Firebase app + bundle gate patches (from Calc3D)

Source: Calc3D — Vite SPA + Firebase (Auth/Firestore/Storage/AppCheck).

**Added**
- `modules/firebase-app.md` — extracting a Firebase-only SPA: mirror + `firebase-stub.js`
  (Auth/Firestore/Storage/AppCheck), reuse the app's **dev-localhost mode**, disable AppCheck
  (`E0=null`), and the **bundle gate patches** (route `<Navigate>` gate, in-page `Acesso Negado`,
  nav section gate) to unlock admin/PRO UI offline.

**Why.** Firebase is a distinct class (no app API; everything is the SDK), and its admin role is a
**server-verified token claim** (`getIdTokenResult().claims.admin`) that cannot be faked client-side —
so the offline unlock is a **bundle patch**, not a claim spoof. This is the same "patch the gate,
don't fake the secret" lesson the security bundle records as a negative.

## 2kmaker (Next.js App Router, server-actions) — reimplement actions from SQLite

Adds a section to `modules/nextjs-ssr.md`: how to keep the **real mirrored screens** and make them
functional by reimplementing the **Server Actions** (id map via `var=(0,i.$)("<id>")`, id→op via the
toast next to `await X(...)`, read shape via the RSC envelope `0:["$@1",["<hash>",null]]\n1:<json>`).
Writes mutate SQLite and return `1:null`; the client re-calls the read, so the real list updates.
Includes the `@supabase/ssr` cookie detail: `sb-<ref>-auth-token` = `base64-` + **base64url**. Proven: the
original `/filamentos` screen renders our SQLite data and "Nova Marca" persists via the real modal.

## Conventions (hold for every change)

- A module keeps five sections: **What it covers → Why (incident + source) → How to
  extract/verify → What "done" means → Known pitfalls**, plus a **Related** line.
- An addition without a real extraction obstacle behind it is not allowed.
- New module → a row in `SKILL.md` §8, a **Related** line, and an entry here.
- Never add a target host, key, token or client data to this bundle; cite the lesson.
- Keep the two bundles separate but cross-referenced: `app-extraction` gets it **running**;
  `security-testing` tests what that exposes.
