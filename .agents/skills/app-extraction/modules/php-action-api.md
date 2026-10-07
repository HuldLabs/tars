# Module — single-dispatcher action API (`?action=`, PHP)

> **Related:** `vanilla-static`, `node-local-server`, `stubs-and-mocks`, `auth-bypass`,
> `live-to-offline-parity`; security side: `security-testing`'s `authz-idor` (per-action),
> `client-supplied-identity`, `write-path-authz`. For apps where **every backend call is one
> endpoint** dispatched by an action name.

## What it covers

A classic PHP backend shape: **one** `api/api.php?action=<name>` (plus a few `*.php` siblings),
`GET` with `credentials:'same-origin'` and — when a body is passed — `POST` JSON. The client helper
is usually `api(action, data, params)`. Session is a **server-side cookie** (not a JWT). Extraction
and testing both hinge on **enumerating the action space**.

## Why (the incident)

Two apps in the same family (`docs/security/querovender-report.md`, `apps/qve-financeiro/EXTRACTION.md`)
shared this shape. Two lessons came out of it:

- **The unit of coverage is the action, not "the API".** In the community app, **4 actions returned
  `401` for anon while 18 sibling read actions returned `200`** (member list, phones, partner
  emails/CNPJ). "It requires auth" is false at the action granularity — enumerate every action.
  In the finance app the inverse held (all actions `401` anon), which is the **positive** result.
- **The action map is the extraction.** 37 and 94 actions respectively; capturing `action → payload →
  response` per view is what lets the mock and the parity harness exist at all.

## How to extract

1. **Enumerate actions** from the client bundle: the app calls `api('name', …)` / `fetch('api/api.php?action=name')`.
   Grep the (verbatim) bundle for the action strings — build `_recon/actions-map.json` (`action`,
   request params/body, response fields inferred).
2. **Capture live per action** (authorized session via CDP): wrap the client `api()` (or intercept
   `fetch`/XHR) and navigate each view, recording `{action, method, payload, response}` — see the
   **capture-and-diff harness** in `live-to-offline-parity`.
3. **Infer the schema** from the shapes: one SQLite table per entity (`users`, `clients`, `receitas`,
   …); keep complex-shaped responses (aggregates) in a `kv` table for exact parity.
4. **Mock the dispatcher**: `server/<app>.js` routes `?action=` to a handler over SQLite; siblings
   (`receita-status.php`, `*-bulk.php`, `*-webhook.php`) get their own handlers.
5. **Reimplement the business rules you can observe** (not the response bytes): e.g. an aggregate
   that is *computed* from transactions (revenue by date; expenses by category) must be computed,
   not stored — see the DRE/cash-flow case where the field `realizado` is derived. This is what
   makes the offline copy *functional*, not a fixture.
6. **Expose a profile/role shim** for multi-portal apps (see `injected-ui-and-extensions` §selector).

## What "done" means

- `actions-map.json` covers **every** action the client can call, with a verdict per action for the
  mirror (implemented / read-only / denied).
- The mock serves the app and each view's real shape; parity harness in `live-to-offline-parity`.
- Per-app `API-MAP.md` lists base + siblings + auth model; `EXTRACTION.md` has the live→offline §.
- Security side (cross-ref `security-testing`): a per-action **anon × role** matrix, so an action that
  *should* be authz'd but isn't is a finding — and the ones that are is a named control.

## Known pitfalls

- **`GET` vs `POST` by body presence** — the helper turns into POST only when a body is passed; a
  no-body read is a GET. Mirror that exactly or the mock's routing misses.
- **Soft-403**: some actions return **HTTP 200 with `{"error":"Acesso negado"}`** — a 200 is not a
  pass; classify by the body, and (for writes) re-read the effect (`security-testing/write-path-authz`).
- **Undocumented-action probe**: an unknown action often returns a typed error
  (`400 "Ação inválida"`) — cheap to sweep `admin/dev/debug/root/impersonate/install/sql/export` to
  prove there is no hidden action.
- **Multi-tenant param** (`?c=<id>`) is copied into every call; a wrong id may fall back to a default
  tenant — record the fallback (it is often a white-label tell).
- **Hardcoded integration tokens** in the client bundle (`REDE_TOKEN_*`-style) are a **security**
  finding, not just an extraction fact (`security-testing/secrets`).
- **Don't reimplement from a screenshot** — reimplement from the captured payload/response and the
  computed rule; a UI number is merge/dedup, not rows.
- **A computed read must not be served from the capture cache.** The cheap parity trick — serve any
  action's captured JSON from a `kv` table — silently *wins* the diff for aggregates and hides a
  broken rule: `getPlanejamentoDRE`/`listarFluxoCaixa`/`getMinhaAssinatura` returned the captured
  bytes (all-zero `realizado`) while the real fix was to **compute** from the rows. Keep a
  cache-first list per action, and **remove every computed action from it** the moment you
  reimplement it, or the parity number is a lie. (Seen on the finance app: the DRE was "0 diffs"
  against a snapshot, then went red the instant the cache was removed — the true state.)
- **The session is a server-side cookie with no refresh token.** After a PHP session is invalidated
  server-side, restoring the captured cookie is **not** enough (`me` → `null`). Only the real
  `login {email, password}` mints a new session, so a bundle whose validation depends on a live
  session must **store credentials for a dedicated test account** and auto-login; a captured
  `session.json` is continuity, not autonomy. The response-signature check (§ `live-to-offline-parity`)
  will show `me=null`/`401` as a hard signal the session died.
- **Gate the mock by role like the live does.** Multi-role apps answer **differently per role**
  (`getTicketStats`/`getSaasMetrics`/`listAllTickets` → `[]`/`{error}` for a client, data for admin).
  A mock that ignores role pairs against the wrong profile and hides the real gate; run the parity
  harness **under the same profile** as the capture (see `injected-ui-and-extensions` §selector).
