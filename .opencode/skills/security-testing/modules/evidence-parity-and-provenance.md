# Module — evidence parity & provenance (rebutting "it's fake")

> **Related:** `baas-direct-exposure` (the collection this proves), `secrets` (a dataset in the
> bundle is a source label, not a secret), `ci-gates` (a gate that never fails is the same
> honesty problem one level up).

## What it tests

Two properties of the **evidence set**, distinct from the finding itself:

1. **Parity** — does the copy you are delivering match the live source *exactly enough* that the
   subject cannot call it fabricated? Row-for-row per table, and id-for-id for datasets that come
   from a client bundle rather than an API.
2. **Provenance** — is each artifact **tamper-evident**: the raw bytes you captured, their hash,
   the endpoint, the auth level, and the capture time — so a third party can re-fetch and compare?

A finding with a screenshot and no provenance is dismissible. The same finding with a parity
matrix + hashed raw responses is not. This module is how the *evidence* survives the subject's
cheapest rebuttal ("those rows were generated, not collected").

## Why

An engagement where findings were reproduced into an **offline copy** of the target, for
functional proof (the copy renders the real data, so the finding is demonstrably not a static
screenshot). The obvious counter — "you seeded that; a model wrote it" — is only defeatable by
making the copy *reconcilable with the live host*:

- **Parity held where it mattered.** In the case, the exposure tables matched live exactly
  (`suppliers` 22=22, `classifieds` 2=2, `public_label_snapshots` 23=23) and every public catalog
  matched (printers 131, manufacturers 43, brands 32, …) — **12 of 13 tables MATCH**.
- **The one "mismatch" was an artifact, not missing data.** A catalog the UI showed as ~4.174
  items was an embedded **client-bundle** dataset of 3.504; the serving bundle was byte-identical
  to the copied one and the **id sets matched 3.504 = 3.504**. The big number was a UI-derived
  count (merge/dedup), and the API endpoint behind it returned **`[]`**. Capturing the response
  body the page itself received settled it in one step.
- **Scraping the admin surface proved the negative.** Crawling the admin screens and capturing
  their payloads showed the privileged endpoints answered **`400` with the function's own
  `P0001`** — i.e. there is no hidden store the copy missed; the data is server-side gated. A
  400/`denied` capture is *evidence*, not a failed test.

Two portability rules fall out:

- **UI count ≠ row count.** A number rendered on a screen can be a merge/dedup/summary; only the
  response body is data. Never reconcile against a screen.
- **Label the source per dataset** — live API vs client bundle. A bundle entry is public by
  construction; calling it a leak is as wrong as calling collected live rows "generated".

## How to verify

```bash
# 1. Capture raw + hash per table (the provenance artifact). Store bytes, NOT a summary.
#    manifest row: table, url, auth-level(anon|own-session), status, rows, bytes, sha256, date
# 2. Parity matrix: live total (Prefer: count=exact) vs your copy's count. Verdict per table.
# 3. For a dataset the UI shows larger than your API returns: capture the body the PAGE received.
#    (CDP: Network.getResponseBody on the request id) — empty body => UI-derived, not hidden data.
# 4. For bundle-derived datasets: compare id sets between the served bundle and your copy.
# 5. Crawl the privileged surface, capturing payloads: denial codes are the proof the rest is gated.
```

```js
// provenance row (one per table) — the shape that makes the copy reconcilable
{ table, url, auth: 'anon'|'own-session', status, rows, bytes, sha256, date }
```

The **full rows are stored in the client's SQLite** (`apps/<app>/_data/<app>.db`) — the deliverable —
alongside the parity matrix + hashes. The **offline version** and the **navigable evidence dashboard**
are **derived from that DB** (`SKILL.md` §3, `app-extraction/modules/evidence-panel.md`). No masking,
no deletion — complete capture is the mandated step.

## What "covered" means (with evidence)

- **A parity matrix** with a verdict per table — `MATCH` / `SUBSET` / `DIFF` / `OFFLINE-only (bundle)`
  — each row carrying live count, copy count, source label, and the raw file's `sha256`.
- **`MATCH` is the claim you want on every table a finding depends on.** A `SUBSET` on a
  *non-finding* dataset (a public catalog, a seed) is stated as a subset **with its reason**, never
  left to look like a gap.
- **Full rows retained** in the client's SQLite (the deliverable); the offline version and the evidence dashboard are derived from it.
- **Id-set equality** for any bundle-derived dataset (served == copied).
- **The privileged-surface capture** showing denial (`400`/`401` + code) — the negative that proves
  the copy did not simply miss a hidden table.

## Known false positives

- **A UI number bigger than your row count is not a hidden store.** It can be a merge/dedup/count
  of a different collection. Capture the endpoint body; if it is empty, the discrepancy is UI-side.
  (Also: two screenshots of the same app can show different derived counts — `4340` vs `4174` in
  the same session. Neither is a table size.)
- **A client-bundle dataset is public, not a leak** — unless it is proprietary. Its count is the
  bundle's, and it will not match a database endpoint that does not serve it. Label it; don't file
  a "missing rows" gap.
- **RLS means your token sees fewer rows than an admin** — that is server-side authorization
  working, not data you "failed to collect". Do not call the admin's larger view parity debt.
- **A `400` from an admin RPC is a pass for the target, not a broken test.** Capture it as evidence.
- **An offline copy with an extra row is usually your own tooling, not the target.** The case here:
  a mock auto-created an `id:"0"` ghost via a `PATCH` fallback — a copy-side bug fixed by removing
  the fallback, not a target finding. Re-check counts and referential integrity in the copy before
  asserting parity (and before asserting a discrepancy is the target's).
- **A hash proves integrity, not truth.** It shows the bytes are the bytes you captured; the
  provenance is the endpoint + auth + time in the manifest. Record all four, not the hash alone.
