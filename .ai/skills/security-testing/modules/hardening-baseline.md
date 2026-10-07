# Module — hardening baseline (positive controls)

> **Related:** `authz-idor`, `baas-direct-exposure`, `auth-identity`, `headers-cookies`,
> `secrets`, `evidence-parity-and-provenance`. This module is the *positive* pass those lean on.

## What it tests

Whether each **baseline hardening is actually present and enforced** — not just that a known
hole is absent. An audit that only tries to break in reports "no finding" for a system that
has no logins, no data, or an empty scope, and misses that a control every comparable system
has is simply **missing** here. A missing control is an **improvement opportunity** with its
own severity, even when nothing is exploitable today.

Twelve controls, each cross-checked across the clients we have audited:

| # | Control | What "present" looks like |
|---|---|---|
| 1 | **Authz decided server-side** | identity derived from the session; client-supplied `userId`/`orgId`/`role` ignored |
| 2 | **Per-object authorization** | every table/collection/route scopes to the owner (RLS / rules / guard) |
| 3 | **Public key least-scope** | a client key (BaaS anon/publishable) is referrer/API-restricted; no private key in the bundle |
| 4 | **Function/endpoint authz** | RPCs/handlers re-check auth+role; no unauthenticated call returns another tenant's data |
| 5 | **Storage locked by default** | list/read denied (anon **and** authenticated) unless a per-object rule allows |
| 6 | **Auth hardening** | email-enumeration protection on; unused password/phone providers disabled; MFA available; lockout; captcha/App Check **required** |
| 7 | **Session cannot be read by JS** (or XSS is mitigated) | HttpOnly cookie, or short-lived token + strict CSP |
| 8 | **Security headers** | HSTS, CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy; no `X-Powered-By` |
| 9 | **No secrets / no source maps / no stray files** | bundle clean; `*.map`, `.env`, `.git/config` → real 404 |
| 10 | **Abuse controls** | rate limit / lockout on login, RPCs and cost endpoints (IA, scrape, email) |
| 11 | **Generic errors** | no stack/SQL/secret in error bodies |
| 12 | **Data minimization** | public payloads carry no third-party e-mail/plan/`isAdmin`/internal ids |
| 20 | **Papel de banco do app é dedicado, nunca superuser** | O DSN do app usa um papel próprio (`*_app`) com os privilégios mínimos; a prova positiva é um teste que lê `rolsuper`/`pg_roles` e exige `false`. (fonte: docs/security/hub-lessons.md:9) |
(Nota: se preferir não inchar a tabela dos doze, anexar ao §"Beyond the twelve" como controle #20 — mesma âncora.)

## Why

The same hardening recurred across independent audits, and **the systems missing it are the
ones that leaked**:

- **BaaS-direct (PrintCal, LetraMaker):** where rules/RPCs scoped by owner and profile-bucket
  keys were referrer-restricted, nothing leaked; where a table lacked owner scoping (`suppliers`)
  or an RPC was open (LetraMaker), PII leaked. The control that separated them is #2/#4.
- **BFF (Primu3D):** authorization on the server (#1) + allowlist SSRF + upload validation +
  field whitelist made every client-side bypass **cosmetic** — the strongest posture we found.
- **Firebase (Calc3D):** referrer-restricted API key (#3), Firestore rules scoping by
  `userId == request.auth.uid` (#2), `:listCollectionIds` denied (#1/#2), Storage list/read
  denied anon **and** authenticated (#5), email-enumeration protection + password provider
  disabled (#6). **Gaps:** App Check initialized but **not enforced** (#6), CSP `script-src`
  `'unsafe-inline'` next to a hash (#8) — both improvement opportunities, neither exploitable now.
- **Contrast that proves the point:** the LetraMaker leak and the Calc3D clean result share
  the same "anon key in the bundle" surface. The difference is #3/#4 — the key's scope and the
  server-side checks behind it. "No secret in the bundle" is not the control; the **reachable
  scope** is.

The failure mode this module exists for: reporting "no finding" without saying which controls
were **verified present** vs **missing vs untested**. A system with four of twelve controls is
not "clean"; it is "four controls present, eight open".

### Patterns observed (present × gap) — feed the matrix

Concrete shapes to look for, from the audits (each is a row in the per-client matrix):

- **#8 CSP:** strongest observed is **nonce + `strict-dynamic`** (Split3MF); weakest is **absent**
  (Primu3D storefront, NeoBrix SPA) or `unsafe-inline`/`unsafe-eval` alongside a hash
  (Calc3D/LocalStorage apps). A permissive token next to a strict one is a gap, not a non-issue.
- **#6 anti-bot:** a **widget without server-side verification** is not a control — Split3MF's
  Turnstile passed a login probe without a captcha token; Calc3D's App Check was initialized but
  not enforced. Positive: NeoBrix **login rate limit `5 → 429`**.
- **#11 generic errors:** watch for **framework codes that echo internals** — PostgREST `PGRST205`
  leaked an unknown table name in one target; stack/SQL still counts.
- **#9 secrets:** a **commented-out** key (`AIza…`) or a **static CSRF token** in a bundled page is
  still a finding to clean, even if currently inert.
- **#1 identity:** "authz decided in the client" shows up as **plan/admin literals in the bundle**
  (CordeiroFlow pre-fix) — grep for `planType`/`isAdmin`/`subscriptionStatus:"active"`.
- **#5 storage:** the denial is the evidence — Supabase `[]` / Firebase `403 Permission denied` /
  "Secret API key required". A returned listing is the finding.
- **#10 abuse/caps:** a **per-call cap** (LetraMaker RPC returns max 1000; total 10900) is
  blast-radius mitigation, not a fix; record both the cap and the endpoint being open.

## Beyond the twelve — controls seen holding that the baseline did not name

Source: the multi-tenant Django engagement (`docs/security/ecommerce-pro-report.md`,
`docs/security/ecommerce-pro-lessons.md`). These *inviabilizaram* whole classes and are **not**
in the list above — promote them into the baseline (a target that has them is materially safer,
and a target missing them is an improvement opportunity).

| # | Control | What "present" looks like (observed) |
|---|---|---|
| 13 | **Tenant boundary is server-derived and enforced per object** | In a multi-tenant system the tenant comes from host/session, never from the request; catalog, media path (`/media/tenants/<slug>/`), and credentials are per-tenant. Probe: a foreign tenant's id/slug must be 4xx/empty. Observed: host of store A served only A's products; cross-tenant media → 404. |
| 14 | **Destructive/irreversible actions are explicit and deliberate** | Delete-account/data requires `POST` + a deliberate confirmation (typed text / re-auth); **no state change via `GET`**. Kills CSRF-by-link and accidental loss. Observed: delete form needs a checkbox **and** typed text. |
| 15 | **Stateful server-side session, no client-held refresh token** | Session is an **HttpOnly** cookie the JS never reads; there is no long-lived refresh token in `localStorage`; logout invalidates server-side. (Here, Django's `sessionid`; contrast the BaaS-direct targets whose tokens sit in JS-readable storage.) Removes the token-theft-by-XSS class. |
| 16 | **CSRF on every state-changing request, including XHR/JSON** | A `POST`/`PUT`/`PATCH`/`DELETE` without the token → `403`, even with a valid session cookie; `SameSite=Lax` as defense-in-depth. Observed on profile edit and cart add. |
| 17 | **Echo-and-ignore identity** | The server may **reflect** a client-supplied `userId`/`role`/`tenant` in the response but must **derive identity from the session**; the reflected value never changes the object returned. (The positive face of identity-from-input; see `client-supplied-identity`.) Observed: `?user_id=1` and `?user_id=999999` both returned the caller's own account. |
| 18 | **Minimal client surface (server-rendered / MPA)** | No API keys, no authorization logic and no embedded dataset in the client bundle; pages are server-rendered, endpoints are ordinary same-origin form/`fetch` calls. The whole BaaS-direct / bundle-dataset class is **structurally absent** (methodological note: a bundle-extraction-heavy playbook finds little here — that is the result, not a miss). |
| 19 | **Server-to-server credentials are per-tenant and scoped** | An integration/partner key is valid **only for its store**, carries explicit scopes, and its denials are **machine-readable** (`MISSING_*`/`INVALID_*`/`INSUFFICIENT_SCOPE`) with no internals — unlike a global admin key. Probe: the same key on another tenant's domain must fail (different scope), and an absent/invalid key must be `401`/`403`. Observed: partner API v1 (`X-Partner-Key`). |

Two method corollaries from the same round:

- **A hardened app can sit next to an unhardened ops host on the same domain** — the tenant boundary
  (#13) and CSRF (#16) held while a sibling subdomain served open automation. Baseline the **domain**,
  not just the app: see `service-subdomain-exposure`.
- **Distinguish "control present" from "class absent":** #17/#18 mean the class *cannot* occur here,
- **Server-rendered não é "nada a analisar":** os endpoints vivem no JS e nos `data-*` do HTML, e o
  bundle textual também vaza caminhos (ex.: `cart/views.py`). Ler o JS + `data-*` antes de concluir
  "sem superfície de API". (fonte: docs/security/ecommerce-pro-lessons.md:52)
  which is a stronger statement than "we found no instance" — record it as such (`authz-idor` "ignored
  (identity from the session)").

## How to verify

Run the **same probe per control** on every target, so gaps are comparable:

```bash
# 3 public-key scope: from a foreign referrer/Origin, is the key refused?
curl -s -o /dev/null -w '%{http_code}\n' "https://<provider>/<endpoint>?key=<PUBLIC_KEY>" -H 'Referer: https://evil.example/'
# 5 storage: list denied for anon AND for a token?
curl -s "https://<storage-host>/v0/b/<bucket>/o"
# 8 headers: read them all, per target
curl -sSI https://<host>/ | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy|x-powered-by'
# 9 maps/env: expect a real 404
curl -sI https://<host>/main.js.map ; curl -sI https://<host>/.env
# 6 enumeration: same shape for existing vs non-existing identifier (no `registered`/`signinMethods`)
# 1/2/4: the authz ladder from modules/authz-idor.md — a foreign query/doc must be 4xx, an own one 2xx
```

Then write the **baseline matrix**: control × target × {PASS / FAIL / N-A (reason) / UNTESTED},
each row with the real status. A `FAIL` or `UNTESTED` is a line item, not a silence.

## What "covered" means (with evidence)

- **A control × target matrix** where every row has a status **and** evidence (status code,
  header, file:line). "No finding" is never a status; "control present, evidence X" or
  "control missing" is.
- **Missing controls get a severity and a failure scenario** ("what this would fail to
  prevent"), so an empty-scope audit still produces a hardening backlog.
- **Cross-client deltas are the value:** if a peer applies a control another lacks, the delta
  is the improvement opportunity. Record it as a row, not as tacit knowledge.
- **Positives are stated as assets** (a referrer-restricted key, a denying rule, a disabled
  provider) — they are what a future auditor should not re-derive.

## Known false positives

- **A control can be legitimately N/A** — but "N/A" needs a reason ("no cookie session"), and
  never "we did not check".
- **An unverified captcha/App Check is not a control** — presence in IaC/`initializeAppCheck`
  is not enforcement; verify a call is **refused** without its token. (Calc3D: initialized,
  not enforced.)
- **A public key in the bundle is not a failure of #3** — the failure is an **unrestricted**
  or over-scoped key. Check what it can reach, from where.
- **A permissive value next to a stricter one is not always inert** — CSP `'unsafe-inline'`
  next to a hash is ignored by CSP3 browsers but honored by older ones; treat it as a gap, not
  a non-issue.
- **A 404 that is the SPA's own page is not a real 404** — check content-type/body.
- **A control present on one host/target may be absent on another** (staging vs prod); the
  matrix is per target.
- **Denial codes are the positive evidence** — a `403` on the foreign query *and* a `200` on
  the own query together prove #2; the `403` alone could be an empty scope.
