# Module — live → offline data (parity + provenance)

> **Related:** `supabase-direct`, `auth-bypass`, `node-local-server`; the normative contract is
> `docs/EXTRACTION-STANDARD.md` §4. Security side: `security-testing`'s
> `evidence-parity-and-provenance`.

## What it covers

Populating the offline copy with the **real data** from the source — so the copy is functional
proof and an auditable artifact, not a seeded mockup.

## Why (the incident)

An offline copy seeded with a generic dataset can be dismissed as "AI-generated, not real". The
counter is reproducible: capture the live payloads, keep the **raw bytes + sha256**, build a
**parity matrix** (live count vs copy count per table), and label each dataset's source (live API
vs client bundle). In the PrintCal pass, 12/13 tables matched live exactly and a bundle dataset
matched by **id-set** (3.504 = 3.504); a UI number of "4.174" was a merge/dedup artifact, not
missing rows.

## How to capture

1. **Live session via CDP** (authorized): `node tools/method/capture-live-fixtures.mjs --port <p>
   --match <host> --routes "…" --out <fixtures.json> --manifest <manifest.json>`.
2. Or a **HAR with bodies** — check `response.content.text`; many HARs (e.g. the Primu3D ones)
   come with **empty bodies** and are useless for this.
3. Write into the app's fixtures/DB; restart; verify the real values render.
4. **Parity matrix** live × offline (`MATCH`/`SUBSET`/`DIFF`/`OFFLINE-only`) + `sha256` manifest.
5. **Source label** per dataset: live API vs client bundle.

## Capture-and-diff harness (the parity runner)

The strongest parity check is not a screenshot or a text length — it is **per-view, per-action,
response-signature**. Two tiny scripts (same pattern as `capture-live-fixtures.mjs`, but
action-level):

1. **Wrap the app's client helper**, don't trace the network: inject `window.api = wrap(window.api)`
   so every call records `{action, data, params, res, err}` — the *action* is what you diff, not a URL.
2. **Navigate view-by-view and reset the buffer per view** (`window.__CAP.length = 0` before each
   `goto(view)`) so each view's action list is its delta, not an ever-growing log.
3. **Wait outside the browser.** A view that redirects (role-gated menu) destroys the in-page
   promise and hangs a single awaited eval; do `goto(v)` in one eval, `sleep` in the harness, then
   read `__CAP` in a second eval.
4. **Diff by signature**, not by raw JSON: per action compare `ok`, array length, and **object key
   count** (plus enum/case). `live=[] | off={2k}` or `{1k}` vs `{4k}` catches a shape/gate mismatch
   that a length-only diff misses. The result is a `capdiff.txt` you keep next to the report.
5. **Run both sides under the same profile** and **re-capture the live after every live mutation** —
   a stale capture shows diffs that are just "the dataset moved on".

This is the executable form of the matrix; the `sha256` manifest is its evidentiary backing.

## What "done" means

- Parity `MATCH` on every table a finding/proof depends on; `SUBSET` (with reason) elsewhere.
- A manifest with `{endpoint,status,rows,bytes,sha256,date,auth}` a third party can re-verify.
- **Complete rows stored in the client's SQLite** (`apps/<app>/_data/<app>.db`); the **offline version**
  and the **evidence dashboard** are **derived from that DB** (no masking, no deletion — mandated).

## Known pitfalls

- **Never reconcile against a UI number** — only the response body is data.
- **A bundle dataset** matches by id-set, not against an API that doesn't serve it.
- **Your own mock** may add a ghost row (e.g. `id:"0"` from a PATCH fallback) — check the copy
  before asserting a discrepancy.
- **HAR without bodies** ⇒ no live data; get a session or a proper HAR export (DevTools *Preserve log* +
  *Export HAR*; check `response.content.text` is non-empty — many exports are `bodylen=0`).
- **Populate the live via its own UI, and measure by delta.** The most faithful way to learn a rule
  (a formula, an aggregate, a break-even) is to drive the real app to create each record type, capture
  `{action, payload, response}`, and read the **change** in state (e.g. invested/recovered moves by
  exactly the created amount). Screenshots and UI totals do not give the rule; the delta does.
- **Cross-source enrichment.** Enumerate the public surface (`robots.txt`, `sitemap.xml`, a `site:`
  query) and **correlate** it with a leaked/exported table (e.g. published vitrines ↔ `user_id`) to
  reconstruct and enrich the dataset — a legitimate proof of exposure, not just a row copy.
- **Shape exactness is parity.** A reimplemented action must return **every** field the component
  reads, with the right **case** and **enum** (`unit_price` vs `unitPrice`; `data_venda` vs `data`; a
  valid status value) — a missing field crashes `.toFixed()`/rendering and reads as a "different" app.
- **Anti-hydration-mismatch:** for streamed/Suspense SSR pages, capture the **skeleton (JS off)** and
  remove relative-time/list shims; the mirror otherwise re-renders and drifts from the live.
- **Repointing a BaaS URL must swap the *scheme*, not just the host.** Replacing only
  `<ref>.supabase.co` keeps `https://` → `https://localhost:<port>/sb` = TLS against a plain-HTTP
  mock → **"Failed to fetch"** (and no obvious error). Replace the full
  `https://<ref>.supabase.co` → `http://localhost:<port>/sb` and `wss://…` → `ws://…`, then grep the
  built bundle for **zero** remaining `<ref>.supabase.co`.
- **A server-side gate can be one table row.** When the app's access is a record (e.g. a
  `user_access`/`subscription` row read at boot), the mirror is unlocked by **seeding that row**
  (`approved:true` / `status:'active'`), not by patching a UI flag — and the absence of any other
  call for a free account is itself the finding (see `security-testing/baas-direct-exposure`).
