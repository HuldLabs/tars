# Module — live API reverse-engineering (capture → reimplement over SQLite → 100% pairing)

> **Related:** `live-to-offline-parity`, `node-local-server`, `stubs-and-mocks`, `auth-bypass`;
> the hub/iframe contract lives in `docs/EXTRACTION-STANDARD.md`. Security side:
> `security-testing/baas-direct-exposure`, `defensive-posture`.

## What it covers

The **complete extract** where the offline is not a mockup but a **faithful clone** with our own API:
the visual layer is the live's **verbatim** assets (CSS/HTML/JS), and the data layer is **our server**
(`server/<app>.js`) over **SQLite**, reimplementing the live's requests. Four disciplines:

1. **100% visual pairing** — never recreate HTML/CSS; ship the live's assets as-is, patch only the
   API base (and routing), so every screen/state is pixel-faithful. The only thing that changes is
   *where the data comes from*.
2. **Capture the real requests** — record the live's HTTP (method, URL, filters, body, response) so
   the offline API answers the **same shapes**.
3. **Reverse-engineer computed logic** — where a value is **server- or client-computed**, discover
   the rule by **matrix input testing** (feed many inputs, read outputs, derive the table/formula).
4. **Reimplement the API over SQLite** — CRUD + the computed rules, scoped by `user_id`, so the app
   saves/reads/persists and the derived views (dashboards, DRE/fluxo, break-even) match the live.

## Why (the incidents)

- **The bundle hides the rule, the matrix reveals it.** Pricing/fee tables are often **embedded in
  the client bundle** (Mercado Livre/Shopee commission matrices + a price-band selector
  `price<=79.99?row=2:…`). Extracting the arrays + the band logic *is* the RE; where the value is
  server-computed, the same idea applies to the API: vary the input, read the output, build the matrix.
- **A capture that resets per document lies.** `window.__reqs` is **per-document**; navigating with
  `Page.navigate` resets it. A one-shot dump captured only the **last** route (2 requests) — the same
  trap that made a whole screen look "not fetching". **Accumulate per navigation** (read `__reqs`
  after each load). And `addScriptToEvaluateOnNewDocument` is tied to the **CDP session** — inject,
  navigate and read **inside one connection**, or the script is gone.
- **The gate can be one row, and the app still works offline.** When the live gates on a table row
  (`user_access`), the offline API **seeds that row**; the app then computes the dashboard from the
  seeded data (`Despesas = sum(despesas)`) — proof the reimplemented API is functional, not a mockup.
- **Hub registration is part of "done".** An app served on its own port must be **iframed from the
  hub** (`iframePort` in `apps.json` + a `shell/hub.html` card + a `server/index.js` iframe branch);
  otherwise it is not reachable the way every other app is. This was missed once and is now a
  checklist item.

## How to do it

1. **Mirror verbatim + repoint** (`tools/<app>-mirror.mjs`): copy assets as-is; replace the BaaS base
   **scheme+host** (`https://<ref>.supabase.co → http://localhost:<port>/sb`, `wss→ws`), 0 remaining.
2. **Capture the live in one session** (`tools/<app>-livecapture.mjs`): `Page.addScriptToEvaluateOnNewDocument`
   with a fetch/XHR netlog (+ the unlock inject), then for each route `Page.navigate` → wait → read and
   **accumulate** `window.__reqs`. Save `_recon/live-requests.json`. From it derive: table per screen,
   query filters, insert/update payloads, and **shapes**.
3. **Reimplement over SQLite** (`server/<app>.js`): a generic `{table→rows}` store + the live's filters
   (`user_id=eq.<uid>`) + **the computed rules**; keep complex shapes in a `kv` table for exact parity.
3b. **Enumerate and read the DEFINITION/REFERENCE data — and it must be REAL.** The lookup data that
   populates **selects, dropdowns, catalogs, enums, fee/tax tables, correlation tables and default
   configs** (categories, marketplaces, plans, statuses, printer models, commission matrices…) must come
   **real, exactly as in the live** — from one of three sources, **never invented**: (a) the **live API**
   (a definition table/endpoint), (b) the **bundle** (embedded arrays/constants — real by construction,
   e.g. `y0`, fee matrices), or (c) the app's **documented defaults** (the `ed`-style fallback constants).
   Read its contents (`_recon/<name>.json`), seed it offline with the **same** values, and **label the
   source** per table/select. A missing definition table is why a select is empty or a default is `NaN`;
   a *fabricated* one is worse — it silently diverges from the live.
4. **Materialize the client's OWN database — do not invent a parallel seed.** The rows we show *are*
   the same rows that feed the live app (the exposed data is the client's own). Copy them faithfully
   into our SQLite (`tools/<app>-seed.js`, idempotent, from the capture) so every screen renders with
   the **real** data and the derived numbers match. "Realistic seed" means **the client's real rows**,
   never a synthetic set (that would re-create the split we must avoid, and make parity meaningless).
5. **Matrix-test computed logic**: vary inputs (price, weight, quantity, marketplace) across the offline
   and record input→output; derive the formula/table; keep the derived table in `_recon/logic.json`.
6. **Register in the hub**: `apps.json` `iframePort`, a `shell/hub.html` card, a `server/index.js`
   iframe branch (+ an evidence-panel branch if there's a panel).

## Screen-by-screen pairing (live × ours) — the bar

Pair **every screen, every button, every value**, not a sample:

1. **Screen list** — enumerate the routes from the bundle; for each: does the **live's** screen and
   **our** screen show the same **structure** (same DOM/CSS — they are verbatim) and the same **data**
   given the same seed? Capture a **screenshot** of each and diff (visual diff).
2. **Button/action list** — for each screen, enumerate the buttons and, per button, the **HTTP call**
   it fires (from the netlog capture), with its **payload** and the **result**. Reproduce each in our
   API and record the verdict in the matrix.
3. **Value/inputs** — for inputs (calculator, filters, forms), vary the values and compare **outputs**
   (client-computed or server-computed) between live and ours — the **matrix** that derives the rule.
4. **Data of all types** — seed **plausible** records covering **every** type/status/enum the UI can
   render (e.g. statuses: pago/pendente/entregue; plans: free/pro; marketplaces: ml/shopee/tiktok/
   direta), so every branch is exercised. Never "teste1".

## Verification procedure (per screen / control / CRUD) — MANDATORY

"Renders" is not "works". For **every screen**, verify **every control** (button, select, input,
toggle) and **every operation** — and record a verdict. Artifacts: `_recon/ui-inventory.json`
(inventory) + `VERIFY.md` (control × verdict).

0. **Symmetric seeding — live AND offline with the SAME values, ALL fields, ONE OF EACH TYPE.** Populate
   **both** sides with an **identical, realistic** dataset that covers **every branch**: **one record of
   every type/variant/status/enum** the UI can render (e.g. if there are 4 product types, create **one
   of each**; every status — paid/pending/shipped; every marketplace; every plan). That is the input to
   compare and the way to exercise every screen/field. On the live, write your **own** rows (RLS permits
   owner writes) and **capture the payload/HTTP of each write**; mirror the exact same values into our
   SQLite. Now any delta is behavior, not data.
1. **UI inventory** — enumerate, per route, the buttons/selects/inputs (a tool that navigates in one
   CDP session and dumps them). This is the checklist; nothing is "done" off-list.
2. **Control audit** — for each control: **change it and assert the expected behavior**. The verdict is
   the **EXPECTED RESULT**, not "no error": a control that renders but leaves values at **0 / empty /
   wrong**, or a button that does nothing, is a **FAIL** — *even with an empty console*. "It didn't
   crash" is **not** "it works". So: a select must **recompute** the derived numbers to the right
   values; a toggle must flip its dependent fields; a button ("Reprecificar", "Salvar", "Excluir"…)
   must do what it says — navigate, recompute, **persist**, or delete — and the outcome must match the
   live's/formula's expected value. Verdict per control: **works / wrong-value / no-op / error**.
3. **CRUD audit + payload capture — per entity, on BOTH sides.** For each **create / edit / delete**:
   (a) perform it and **capture the payload/HTTP** it fires (netlog) — that is the contract our API must
   accept; (b) confirm it **really saved** (read back from the DB/API, not the DOM); (c) confirm the
   screen **updates in real time as expected** (a value change propagates to the totals/calcs, like the
   calculator). Do the same on the live (own rows) and on ours, **with the same values**. A form that
   saves to nowhere, a save that doesn't refresh the screen, or a payload our API rejects = a finding.
4. **Calc/rule matrix — MULTIPLE / RANDOM values, not one sample.** For computed screens, feed a
   **matrix of values** (including **randomized** ones across the domain: prices, weights, quantities,
   marketplaces, plans, statuses) and record the outputs; derive/verify the **formula/table** and its
   **limits/boundaries** (e.g. margin above the fee ceiling yields price 0 — a real app bug). One value
   proves nothing; the matrix is the rule. Keep it in `_recon/calc-matrix.json`.
   **Applies to SERVER-SIDE logic you could not read** in the bundle/chunks (an edge function, an RPC,
   a computed endpoint): probe it with the **value matrix**, vary the inputs, read the outputs, and
   derive the rule — the same method as the client-side, just without the source.
5. **Doc drift check** — comparisons are done **at the same access level and the same seed**. The
   live (e.g. a **free** account, empty config) and our offline (max-access, seeded) **will differ by
   role/data** — attribute the delta, don't call it a bug. Also flag **deploy drift** (live build ≠
   the mirrored snapshot).

## What "done" means

- Every route renders with the **live's own CSS/DOM** (verbatim) **and** the seeded data; derived views
  (dashboards, margins) show correct computed numbers.
- A **`PARITY.md`** exists: `screen × action × method+URL+payload → our-API (status + persisted + rendered)`,
  with the **gaps** and the step to close each. A functionality is covered only when its **real payload
  was captured/compared** *and* our API reproduces it.
- A **`VERIFY.md`** exists: **every control of every screen** with a verdict (works/no-op/error) —
  change-it-and-assert, plus the **CRUD** (create/edit/delete) and the **calc matrix** results.
- `live-requests.json` documents the real requests (reads **and** writes); our API answers the **same shapes**.
- Writes work (app saves → our SQLite → re-read shows it).
- The app + evidence panel are reachable from the **hub** (iframe), like every other app.

## Known pitfalls

- **One CDP session for inject→navigate→read**; accumulate requests across navigations.
- **Change the scheme** on repoint or you get a silent "Failed to fetch".
- **`maybeSingle` vs array**: respect the `Accept: application/vnd.pgrst.object+json` (single object)
  vs the default array — a shape mismatch breaks the screen.
- **Never invent `id:"0"`** on a PATCH without a filter (ghost row) — no-op instead.
- **Don't ship a gate unlock as if it were data** — the client unlock is cosmetic; the server is the
  control (see `security-testing`).
