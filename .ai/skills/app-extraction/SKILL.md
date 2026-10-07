---
name: app-extraction
description: How to extract a live web app into a 100% offline, runnable, locally-served copy in this monorepo — verbatim assets, stubs/mocks, sub-path routing, live→offline data parity, and per-app documentation. Covers Supabase-direct, Firebase, Next.js/SSR, Clerk, Vite/Rolldown and vanilla stacks. Use before extracting, re-extracting, or debugging any app under apps/, and whenever an app's mirror drifts from its source. Companion to the security-testing skill.
---

# App extraction — offline monorepo

Base skill. Read this file, then `docs/METHODOLOGY.md` and `docs/EXTRACTION-STANDARD.md`
(the normative, perennial method and the per-app documentation contract), then the
module(s) for the target's stack under `modules/`.

Companion skill: `../security-testing/` — this bundle gets the app **running**;
security-testing tests what running it exposes. Extraction often produces the evidence a
security audit then proves (and vice versa). Keep them separate, cross-reference freely.

## 1. Golden rule

> **Never recreate HTML/CSS/JS by hand.** Capture the original **verbatim** and only change
> what is needed to run locally (paths, stubs, third-party scripts off). Hand-recreation
> breaks layout/render — that was the #1 error on PrintPal Vase (`docs/METHODOLOGY.md` §0).

Corollary: a copy is done when it is **reproducible from the doc**, not when it happens to
render once. The per-app `EXTRACTION.md` is the deliverable that proves that.

## 2. What "extracted" means (definition of done — the single checklist)

1. **100% visual pairing** — the live's **verbatim** assets (HTML/CSS/JS); **zero 404** (browser, not
   curl — `docs/METHODOLOGY.md` §2). Only the API base changes.
2. The app **runs isolated** (own port / `<base>`) and — when the engagement produced evidence — the
   **navigable evidence panel** at `/apps/<slug>-evidencias` (`modules/evidence-panel.md`), both
   reachable from the **hub** (§7.1).
3. The backend is **our REAL API over SQLite** (§3 Phase 5) — compute/persist, shapes correct; stubs
   only for non-app services (analytics/captcha). No live third-party calls remain.
4. **All functionality works, verified** (§3 Phase 6): **per-action parity** (reads+writes), **CRUD**
   create/edit/delete (persisted + real-time UI), **calculations matrix-tested** (client **and**
   server-side logic), **definition/reference data REAL** (live/bundle/defaults — never invented).
5. A **profile selector** when roles differ (§7.2); hard reload on a sub-route works.
6. **Docs** at the app root: `meta.json`, `EXTRACTION.md`, `API-MAP.md` (with definition-table sources),
   **`PARITY.md`** (per-action), **`VERIFY.md`** (control × verdict) + `_recon/ui-inventory.json` +
   `_recon/live-requests.json` — enough for a fresh agent to reproduce from scratch.
7. **EVOLUTION close** (`../EVOLUTION.md` §6) run — the bundle updated with any new lesson.

## 2.1 Versioning & backup — MANDATORY, after every step

Every extract/audit is **versioned in git**, and the history is **mirrored to OneDrive** for real-time
backup + rollback (local git alone is not a backup).

- **Init once** if the repo has no history: `git init` (+ a `.gitignore` for junk: `*.log`,
  `Thumbs.db`, `*.tmp`). **Commit everything** — assets, `_data/*.db`, `_auth`, `_evidence`, `_recon`,
  `docs`, skills. An extract without history is one bad edit from being lost.
- **Commit after every step** (each phase, each fix, each new client scaffold) with a clear message —
  small commits = fine-grained rollback.
- **OneDrive mirror** (real-time backup): a **bare repo** in OneDrive, wired as a remote, so every push
  lands on the synced drive:
  ```powershell
  git clone --bare "D:/onedrive/segtools" "D:/onedrive/segtools.git"   # once
  git remote add onedrive "D:/onedrive/segtools.git"                   # once
  ```
  Then, **after each commit** (or at the end of each step): `git push onedrive --all`.
- **Rule:** no engagement step ends without a commit (+ push to the OneDrive mirror). The working dir
  stays at its canonical path (`D:\onedrive\segtools`) so absolute paths in tools/docs keep resolving;
  OneDrive holds the **history**, not a second working copy that can drift.

## 3. Method — the phases

**ORDER (fixed — do not re-litigate): pentest first, anon then authenticated, extraction last.**
1. **Security Pass A — anon (deslogado)** on the live: surface (routes/endpoints/tables/RPCs) + the
   reachable data + RPC/storage exposure. Worst case, no credential needed.
2. **Security Pass B — authenticated (logado)** on the live: the owner logs in **once** (extraction
   Phase 1.5 / `security-testing` RUNBOOK) and everything is repeated plus the tenant data, elevation
   and the surfaces Pass A flagged. Session persisted for autonomy.
3. **Extraction** — from the **dossier both passes produced** (endpoints, shapes, data), materialize
   the **client's own DB** into the unified SQLite, then the offline app + evidence dashboard + parity.

Why this order: anon proves the worst case **without** a credential and maps the surface cheapest;
authenticated completes the tenant data and the privilege picture; extraction then reimplements and
proves exactly what both passes found. The two bundles are one loop — the audit finds, the extraction
proves. **This order is the default for every client.**

### Phase 0 — identify and bound
Write down: source URL, stack (from the bundle: `_next`, Vite/Rolldown, plain script tags),
auth provider, API shape, and the target route/port. Discover the stack from artifacts, not
from assumptions.

### Phase 1 — capture (verbatim)
Save the served HTML, a HAR of the network, and a session (`localStorage` keys, cookies) to
replay. Then mirror assets: JS/CSS/WASM/fonts/images/HDRI. For code-split SPAs, recover the
lazy graph from `__vite__mapDeps`, dynamic `import()`, `new URL(..., import.meta.url)`, or
the webpack runtime's chunk map. Reference: `docs/METHODOLOGY.md` §1–§2.

### Phase 1.5 — authenticated capture + autonomy (credentials/tokens) — default, do not wait to be asked

Phase 1 mirrors the **public** surface. The authenticated surface needs a real session. This phase is
where the **owner logs in once** and we make ourselves **autonomous for every later step** (re-capture,
parity, verification, pentest) without asking again:

1. **Front the window for the owner** (`tools/method/cdp-focus.mjs <port> <match> <url>`); the owner logs in
   once, interactively.
2. **Persist the session**: `tools/method/cdp-session.mjs <port> <match> apps/<slug>/_auth/session.json`
   (cookies + `localStorage`). Restore with `tools/method/cdp-restore.mjs`. **Never delete** this file — it is
   continuity, and it is *ours to keep* (see `security-testing/SKILL.md` §3).
3. **Token-based auth (Supabase/JWT/Firebase/Clerk): persist the refresh token and wire auto-refresh**
   (e.g. `POST /auth/v1/token?grant_type=refresh_token` ~5 min before `expires_at`) so the session
   renews itself.
4. **Server-side session (PHP `PHPSESSID`/`*_SESS`, cookie-auth): a cookie is continuity, not autonomy.**
   Keep a **dedicated test-account credential** and **auto-login** (`login {email,password}`) when the
   server invalidates the session.
5. **Record** where the autonomy lives (auto-refresh vs auto-login) in the app's `EXTRACTION.md`.

Only after this do the offline data captures (Phase 5) and the parity/pentest run on the **real**
(authenticated) shape.

### Phase 2 — neutralize the backend (stubs/mocks)
Intercept at the earliest point (before the bundle runs) or serve from a local path:
`window.fetch` for APIs, `window.WebSocket` for realtime, and no-op the analytics/captcha
providers. Prefer **maximum access** (a logged-in user with the top plan/admin) over deleting
auth gates — see `modules/stubs-and-mocks.md` and `modules/auth-bypass.md`. **REST LIST
shape matters:** return `[]`, never `{}`, or the app's `forEach`/`.map` breaks.

### Phase 3 — isolate the route
Routers read `window.location.pathname`; an SPA will not run under a sub-path without a
`basename`. Patch the router (1 line) when possible; serve at the root of its own port when
not (Next.js). See `modules/spa-routing-basename.md` and `modules/nextjs-ssr.md`.

### Phase 4 — serve + verify
One local server, app under `/apps/<slug>/` (or its own port), SPA fallback, correct MIME
types, CORS, and — for realtime apps — a WebSocket stub that answers the handshake (a
Supabase app stays ~60s in loading without `phx_join`; `modules/realtime-websocket.md`).
Verify per §2, with the CDP tools in §6.

### Phase 5 — our REAL API over the client's unified SQLite (not a mockup) — MANDATORY
**One unified database per client** (`apps/<app>/_data/<app>.db`) is the single base: the captured data
lives there, and the different **surfaces** — the **offline app** (our API) and the **evidence
dashboard** — are **views over the same DB**. Never two stores that can drift.

**And it is the client's OWN database by construction.** The data we capture *is* the same data that
feeds the live app — the exposed rows are its own rows, not a separate "leak dataset". So there is
**no split** and **no synthetic seed**: the mirror **materializes** that one DB (a faithful copy of the
same schema + rows), and everything derives from it. Seeding "realistic data" means **copying the
client's real rows**, not inventing a parallel set — inventing one re-creates the exact split we must
avoid.

The mirror must talk to **our own API** (`server/<app>.js`) over **SQLite**, implementing the
source's contract (REST/RPC/auth) — **not** `window.fetch` stubs. It must **compute and persist**,
so the offline is a real system, not a fake. Rules: honor shapes (`.single()`/`.maybeSingle()`
return an **object**, lists return `[]`; PostgREST 406 when a single is empty); no ghost rows
(a PATCH without a filter is a no-op, never `id:"0"`); scope by owner; implement the **computed
rules** the app relies on. Seed = **materialize the client's OWN DB** (the same rows that feed the live app — never a synthetic/parallel set). Module:
`modules/live-api-reverse-engineering.md`.

**Extract everything you have ACCESS to — that is the whole rule.** With no session/credentials there
is no app data to read; that is the **boundary**, not a blocker (never frame it as "needs a paid
account"). Populate the DB from what is reachable (the anon surface, captured rows) **and from the data
the app itself creates as you use it** (drive the UI → our API → our SQLite). Where access is
technically unavailable, the extraction covers what it can and **stops — there is nothing else to do**.
An empty table is an honest result; a fabricated parallel dataset is not.

### Phase 6 — PER-ACTION parity (reads + writes), functionality by functionality — MANDATORY
Capture **every HTTP call of every screen and every button/functionality** — reads **and** writes —
with a **netlog injected at `document_start`** (patch `fetch`/XHR), in **one CDP session**, and
**accumulate** across navigations (the buffer and the injected script are per-document/session — a
one-shot dump captures only the last route). Then, in **our API**, reproduce each action and build a
**parity matrix**:
`screen × action × method+URL+payload → our-API result (status + persisted? + rendered?)`.
Cover **all** functionalities: **CRUDs**, **calculations** (matrix-test the computed ones: vary the
inputs, read the outputs, derive the formula/table), **accounts/auth**, **imports**. A functionality
is "covered" only when its **real payload was captured/compared** *and* our API reproduces it.
Data parity + provenance (`MATCH`/`SUBSET`/`DIFF`, `sha256` manifest, never against a UI number):
`docs/EXTRACTION-STANDARD.md` §4 and `modules/live-to-offline-parity.md`.

**Verify every control, not just the render** (`modules/live-api-reverse-engineering.md` "Verification
procedure"): per screen, **change each control and assert the EXPECTED BEHAVIOR** — a select must
**recompute** the derived numbers **to the right values**, and a button ("Reprecificar"/"Salvar"/"Excluir")
must **do what it says** (navigate/recompute/persist/delete). **"It didn't error" is not "it works"**:
a screen that renders with **zeros/empty/wrong values** or a button that does nothing is a **FAIL**.
Then run the **CRUD** (create → edit → delete → persisted?) and the **calc matrix**.
**Seed live AND offline with the SAME values, all fields** — then, for **each create/edit/delete**,
**capture the payload/HTTP**, confirm it **really saved** (read-back, not the DOM) and that the screen
**updated in real time** as it should (value → totals/calcs). Artifacts: `_recon/ui-inventory.json` +
`VERIFY.md` (control × verdict: works/no-op/error). **Compare live × ours at the same access level and
the same seed** — a **free** live vs a **max-access, seeded** offline **will differ by role/data**
(attribute the delta; also check deploy drift).

## 4. Isolation matrix (choose per app)

| Approach | Use when | Notes |
|---|---|---|
| **Router `basename` patch** | React Router / TanStack SPA | ✅ coexists with the hub. Find the minified constructor. |
| **Serve at its own port** | Next.js/SSR (no source to rebuild) | ✅ used for Primu3D (:8083). |
| `<base href>` + relative paths | self-contained HTML | ✅ assets only, not the router. |
| `history.replaceState('/')` | legacy only | ❌ hijacks the URL; avoid. |
| iframe per app | micro-frontend | ✅ total isolation; used by the shell/hub. |

## 5. Backend rules (our API first; stubs only for non-app services)

- **The data backend is our real API over SQLite** (Phase 5) — implement/compute/persist; stubs are
  only for **non-app services** (analytics/captcha/Sentry → no-op/`204`).
- **Lists are `[]`**, objects are objects; **`.single()`/`.maybeSingle()` return an object** (406 if empty).
- **Auth**: our API returns a logged-in session/user (highest plan/admin); don't delete checks.
- **Realtime**: answer the handshake; don't leave it pending.
- **Fonts**: serve locally under `/fonts/*`.

## 6. Toolbox

- **CDP family** (`tools/`): `cdp-eval.js` (eval expr), `cdp-run.js` (run a `.js` in the page),
  `cdp-shot.mjs` (screenshot), `cdp-session.mjs` (save cookies+localStorage), `cdp-restore.mjs`
  (restore + reload), `cdp-focus.mjs` (front the window for a manual login), `cdp-cookies.mjs`,
  `cdp-console.mjs`, `cdp-net.mjs`, `cdp-inspect.js`, `cdp-ssr.js` (skeleton capture, JS off),
  `cdp-addscript.mjs` (inject at `document_start`).
- **Parity**: `tools/method/app-parity.mjs` (generic per-view action+response-signature capture; wraps
  `window.api` and/or `window.fetch`; `--wrap api|fetch|both`) + `tools/method/app-parity-diff.mjs`.
- **Cloudflare/WAF / stealth**: real Chrome over CDP (persistent profile, manual login once) or
  `tools/method/camofox-fetch.mjs` — see `modules/cloudflare-cdp-fetch.md`.
- **Fixtures**: `tools/method/capture-live-fixtures.mjs`.
- Mirror: `tools/clients/primu-mirror.js`, `tools/clients/primu-chunkmap.js`, `tools/find-missing.js`,
  `tools/find-dynamic-imports.js`.
- Patch: `tools/clients/patch-primu-auth.js` (auth-state always logged-in).
- Audit/interaction pattern: `tools/clients/printcal-audit.js`, `printcal-click.js`, `printcal-net.js`.
- Security: `tools/method/pentest/*` (see the companion skill).

### 6.1 Agnostic tools (adapt, don't rewrite)

Generic, parameterized (`--port --base --match --routes --out …`). The **only** app-specific pieces are
the **seed** (`tools/<slug>-seed.js`, data) and **our API** (`server/<slug>.js`), adapted from a template.

| Tool | Purpose |
|---|---|
| `tools/method/app-netlog.js` + `tools/method/app-livecapture.mjs` | capture **every real HTTP call** (reads+writes) in ONE CDP session, accumulating per navigation (`document_start` injection — required for BaaS that binds `fetch` at boot) |
| `tools/method/app-ui-inventory.mjs` | per-screen control inventory (buttons/selects/inputs) → `_recon/ui-inventory.json` |
| `tools/method/app-button-audit.mjs` | click **every button** (clean state each), classify `navigated/modal/content-changed/no-op/error` → `_recon/button-audit.json` |
| `tools/method/app-error-sweep.mjs` | per-screen console-error + empty-root sweep (catches crashes) → `_recon/error-sweep.json` |
| `tools/method/app-parity.mjs` + `app-parity-diff.mjs` | per-view action+response-signature parity (wrap `window.api`/`fetch`) — **for helper-based apps**; BaaS-direct → use the netlog |
| `tools/cdp-*.js|mjs` | `eval`, `run`, `shot`, `session`, `restore`, `focus`, `cookies`, `console`, `net`, `ssr`, `addscript` |

## 7. Per-app documentation (perennial — `docs/EXTRACTION-STANDARD.md`)

Every app carries, at **its own root**: `meta.json`, `EXTRACTION.md` (7 mandatory sections,
including the live→offline parity §4), `API-MAP.md` (apps with an API), `_recon.json`. An
extraction without these is not reproducible and doesn't meet this skill's bar.

### 7.0 Living handoff — `HANDOFF.md`, updated AT EACH STEP

Every client/app carries a **`HANDOFF.md`** (`apps/<slug>/HANDOFF.md`; for a multi-app tenant, also a
tenant-level `docs/clients/<tenant>/HANDOFF.md`) **updated continuously — after each step, not only at
the end**. It answers "we come back later: what was done, what is pending, where is everything?".

Sections (keep current):
1. **Estado atual** — one paragraph + a status line per surface (recon / mirror / API / seed / verify / security).
2. **O que já foi feito** — bullets, dated.
3. **Pendente / próximo passo** — the open queue, ordered.
4. **Onde está tudo** — ports/servers, DBs, session (`_auth/`), evidence, docs, tools, CDP ports.
5. **Como retomar** — exact commands to bring it back up (`node server/<app>.js`, hub…).
6. **Bloqueios / limites** — access/gated, deploy drift, known gaps (honest, not "pending tasks").

Rule: **if you did a step, update the handoff before moving on.** The per-client counterpart of the
repo-level `HANDOFF.md` and of the EVOLUTION close.

## 7.1 Hub registration (part of "done")

An app served on **its own port** must be reachable from the **hub** exactly like the others —
otherwise it is not extracted to the same bar. Three edits, every time:

1. `server/apps.json` — add the entry with **`iframePort`** (and `type`, `source`, `mocks`, `status`).
2. `shell/hub.html` — add a **card** linking `/apps/<slug>`.
3. `server/index.js` — add an **   iframe branch** for `/apps/<slug>` → `http://localhost:<port>`
4. **Evidence panel** (a real deliverable, not optional when there is evidence): a navigable panel at
   `/apps/<slug>-evidencias` → its own port (`server/<app>-evidencias.js`), showing the exposed
   datasets + findings + recon, one tab each. See `modules/evidence-panel.md`.

Verify: `http://localhost:8081/apps/<slug>` renders the app inside the hub iframe.

**Server lifecycle (hub as admin panel).** An own-port app is not kept running by default: the hub
**starts the asset's server on demand** (cold start when you open it) and **stops it** on close/idle TTL,
tracking `{pid, port}`. This keeps memory at ~0 with everything stopped — each client's offline server
runs **only when needed**. Full spec: `docs/HUB.md`.

**Port discipline (mandatory before launching any server).** Never hardcode a colloquial port. Use the
dedicated range **47000–47999** (above common ports, below the Windows ephemeral range) with the central
registry `central/ports.json`: `node tools/framework/ports.mjs alloc <slug>` reserves a free port and records it;
`check <port>` tests one; `scan` detects collisions (registry duplicate / occupied by a process).
**No server starts without alloc/check.** Legacy low ports (8080/8081/809x) stay noted as legacy.

## 7.2 Access-profile selector (automatic when the app has more than one role)

If the live exposes **different menus/data per access profile** (customer / merchant / admin, free /
pro, multi-portal, farm member vs owner), the offline must ship a **profile selector at the top** to
switch role without re-login. This is **automatic** — do it without being asked. Enumerate the roles
from the bundle (role literals, menu conditions, `is_admin`/`plan`/`user_access` fields) and expose
one item per role.

- Implement as a shim injected before the app (`_shim/role.js` or the mock): the role lives in a
  cookie / `localStorage` key that the app's boot consumes; the selector toggles it and reloads.
- Fallback when the role is **server-bound** (real RLS): a **dedicated session/port per role**.
- Verify: each role shows its **own menu/data**; the switch is one click, no credentials.

## 8. Modules

One file per stack/component. Load the ones the target uses.

| Module | Covers |
|---|---|
| `modules/supabase-direct.md` | Supabase-from-the-browser apps (REST/RPC/storage/auth), anon key, RLS |
| `modules/firebase-app.md` | Firebase apps (Auth/Firestore/Storage), dev-localhost mode, bundle gate patches (admin/PRO) |
| `modules/nextjs-ssr.md` | Next.js App Router mirrors: `_next` chunks, own-port serving, RSC |
| `modules/clerk-auth.md` | Clerk-gated apps: `clerk-stub.js`, auth-state patch, Account Portal |
| `modules/vite-rolldown-spa.md` | Vite/Rolldown bundles, preload helper base patch, hashed chunks |
| `modules/spa-routing-basename.md` | React Router / TanStack basename patch; hash vs path routing |
| `modules/vanilla-static.md` | plain HTML/JS/CSS apps and widget embeds |
| `modules/node-local-server.md` | the one-port local server: static, SPA fallback, MIME, CORS, mocks |
| `modules/stubs-and-mocks.md` | fetch/WebSocket/analytics/captcha stubs; shape rules |
| `modules/auth-bypass.md` | max-access vs stub vs delete; the always-logged-in pattern |
| `modules/realtime-websocket.md` | Supabase Realtime / Phoenix `phx_join` handshake stubs |
| `modules/live-to-offline-parity.md` | capturing real data, parity matrix, sha256 provenance |
| `modules/live-api-reverse-engineering.md` | complete extract: capture real requests → reimplement the API over SQLite (CRUD + computed rules) → 100% visual pairing + hub registration |
| `modules/e2e-verification.md` | CDP audit/click/eval; zero-404; console-clean checks |
| `modules/php-action-api.md` | single-dispatcher PHP apps (`?action=`): enumerate actions, infer schema, mock the dispatcher, reimplement computed rules |
| `modules/injected-ui-and-extensions.md` | the artifacts we inject: Chrome extension (MV3/options/Chrome≥137), gate patches, feature flags/betas, multi-portal role selector |
| `modules/evidence-panel.md` | navigable evidence panel per client (`server/<app>-evidencias.js` + hub branch: datasets + findings + recon) |
| `modules/cloudflare-cdp-fetch.md` | fetching a Cloudflare/WAF-protected source (real Chrome over CDP, Camoufox) + the CDP tool family + session continuity |
| `modules/powershell-windows.md` | Windows/PowerShell gotchas that silently break steps |

## 9. How to add a module

Same shape and rules as the companion skill: a real incident behind it, the five sections
(**What it covers → Why (the incident) → How to extract/verify → What "done" means →
Known pitfalls**), a **Related** line, a row in §8, and a `CHANGELOG.md` entry. Keep it
short — a module is loaded to be *used* mid-task.

## 10. What this skill does not cover

- **Security testing** — the companion `security-testing` skill owns it.
- **The live→offline normative contract** — `docs/EXTRACTION-STANDARD.md`.
- The high-level pipeline rationale — `docs/METHODOLOGY.md`.
