# Module — navigable evidence panel (per client)

> **Related:** `injected-ui-and-extensions` (the other injected artifact), `live-to-offline-parity`
> (what it displays); security side: `security-testing/evidence-parity-and-provenance` (the raw +
> `sha256` backing) and `SKILL.md` §3 (custody). Answers: "where does the client *see* the proof,
> navigable, instead of a zip?"

## What it covers

A **navigable HTML panel** that serves the engagement's evidence for a client: the **data actually
exposed** (datasets), the **findings** (id/severity/kind), the **recon** (actions, endpoints,
shapes) and, where useful, the **reversed logic** (calc matrices). One server, one route in the hub,
no clicking around a folder.

Shape (pattern proven on makers3d and QVE Comunidade):

- **Server** `server/<app>-evidencias.js` on its **own port** — reads the **client's unified SQLite**
  (`apps/<app>/_data/<app>.db` — the **SAME base the offline app uses**; one DB, different surfaces) plus
  `_recon/*.json`, exposes small JSON endpoints (`/api/<dataset>`, `/api/findings`, `/api/actions`,
  `/api/logic`) and serves **one page** with **tabs** (KPIs → findings → datasets → recon). The **full
  dataset lives in that one DB** — the panel is a reading surface over it, not a count. **Complete
  capture is the contract** for an owner-authorized engagement (`security-testing/SKILL.md` §3): every
  row, reconciled count (parity), navigable — no masking, no deletion.
- **Hub**: a branch in `server/index.js` for `/apps/<slug>-evidencias` → `http://localhost:<port>`
  **plus a card** in `shell/hub.html` (`<app> (evidências)`), exactly like the app itself (§7.1).
- **Datasets navigable**: one table/tab per captured dataset (users, transactions, partners…), with
  sorting/search — the exposed rows **in full, read from the client's SQLite** (`_data/<app>.db`). Never
  a masked sample, never an invented row.
- **Findings tab**: the report's findings (`id`, severity, kind, one-line), each linkable to the
  dataset/command that proves it. Positive controls are rows too (§6.2 of the security skill).

## Why (the incident)

The extracted apps and their audits produced real evidence (QVE Comunidade: 564 members, 216
phones, 11 partners; makers3d anon-matrix + findings). Handing over a `_evidence/` folder is not a
deliverable a client reads. The **panel** made the same proof **navigable** — and it is part of the
same "100% offline, self-contained" bar as the app: served from the hub, at its own port, one click.

## How to build

1. **Collect** the evidence the engagement already produced: `_evidence/*.json` (raw captures),
   `_recon/*.json` (actions/endpoints/logic), the findings list (report → array).
2. **Write** `server/<app>-evidencias.js`: a tiny `http` server with JSON endpoints per dataset +
   `/findings` + `/actions`, and a single self-contained HTML page (tabs, KPI cards, tables,
   search/sort) — no external assets (it must work offline).
3. **Register** the hub branch `/apps/<slug>-evidencias` + the card.
4. **Verify**: `http://localhost:8081/apps/<slug>-evidencias` renders in the hub iframe; every tab
   opens; the dataset counts match the captures (parity, not a re-count).

## What "done" means

- `/apps/<slug>-evidencias` is reachable from the **hub**, like every other app.
- Each dataset is navigable (table, sortable/searchable) and its row count matches the capture.
- The findings tab lists every finding (with its severity) and every positive control.
- It works with the network **off** (only the local server + static assets).

## Known pitfalls

- **Never mask nor thin the rows** — the panel reads the client's SQLite in full; but keep the panel
  **local** (never expose it publicly) — it is the client's deliverable, not a hosted service.
- **One port per panel**; a port clash silently breaks the branch (check `Get-NetTCPConnection`).
- **Don't re-count from the UI** — bind the panel to the captured JSON, not to a live re-query.
- A panel that needs a CDN/tab font is not offline; inline the CSS.
