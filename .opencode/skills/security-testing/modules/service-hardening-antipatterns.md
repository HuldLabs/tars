# Module — service hardening anti-patterns (auth, cookies, rate-limit, origin, timing)

> **Related:** `headers-cookies`, `auth-identity`, `authz-idor`, `write-path-authz`,
> `defensive-posture`, `hardening-baseline`, `origin-exposure`, `secrets`.
> This module is the **negative** counterpart of `hardening-baseline`: six concrete
> anti-patterns that pass a casual review but fail a real one.

## What it tests

Whether a **login/auth service** got the six decisions right that are routinely wrong.
Each is a *mechanism* mistake, not a missing feature — it tends to survive code review,
linters and even a green test suite, because the happy path works.

| # | Anti-pattern | Detect | Why it matters | Test |
|---|---|---|---|---|
| 1 | **App connects to the DB as superuser/owner** | read the runtime DSN/role; run `SELECT rolsuper FROM pg_roles WHERE rolname = current_user` as the app | one SQLi (or an AI agent with a query tool) gets total DB power; on Postgres, `COPY … TO PROGRAM` runs OS commands in the container | a test that **fails** if the app user is superuser; a separate DML-only role for the app, superuser only for migrations |
| 2 | **Cookie `Secure` decided by `NODE_ENV`** | grep the cookie setter; inspect `Set-Cookie` of the login over plain HTTP in a **production build** | `next start`/`NODE_ENV=production` sets `Secure`, and a `Secure` cookie is not resent over HTTP → login silently breaks (or, worse, is "fixed" by disabling it) | assert `Secure` follows the **real protocol** (`x-forwarded-proto`) or a configured public scheme, never `NODE_ENV`; unit-test the decision (Chromium treats localhost as secure and won't catch it) |
| 3 | **Sensitive data in the URL before hydration** | load the login form with JS disabled / slow network and submit; watch the address bar | a form without `action`/`method` does a native **GET** → `?password=…` lands in history, server logs and `Referer` | progressive enhancement: `method=post action=/api/auth/login`, route accepts form-urlencoded and answers **303**, never echoes; an e2e with `javaScriptEnabled:false` asserting the URL never contains the secret |
| 4 | **`X-Forwarded-For` trusted without a trusted proxy** | send the request with a changing `X-Forwarded-For` and watch a rate limiter | the header is client-controlled → lockout/rate-limit per-IP is trivially bypassed | ignore XFF unless a proxy is configured; key the lockout on the **authenticated identity** (count only failures), or by `user.id`; test by varying XFF and asserting the block still happens |
| 5 | **Origin/`Host` check that doesn't stop DNS rebinding** | compare `Origin` to `Host` only | a page on `evil.com` whose DNS points to `127.0.0.1` sends `Origin: evil.com` **and** `Host: evil.com` — they match, and the check passes; any unauthenticated route is reachable via the victim's browser | allowlist the `Host` (`127.0.0.1`, `localhost`, `*.localhost`, configured domain) and answer **400** otherwise; test `Host: evil.com` → 400 |
| 6 | **User enumeration via response timing** | time the login for an existing vs non-existing identifier | `user ? bcrypt.compare(...) : false` returns in ms when the user is absent and ~100 ms when present; the generic message hides the text, not the clock | always run the hash compare (fixed dummy hash when the user doesn't exist); test that the compare runs on **both** paths |

## Incidents (provenance)

All six were found building **our own** service (`segtools` hub), 2026-09-24/25 — which is
exactly why they belong here: they reproduce the mistakes our clients make, on code we wrote
and thought was clean. Fixes and tests: `docs/security/hub-lessons.md`, `docs/security/hub-threat-model.md`.

## False positives / cautions

- #4: an *absence* of `X-Forwarded-For` in a request is normal for non-browser clients; the
  finding is trusting it for a security decision, not seeing it.
- #5: `Origin: null` (sandboxed iframe) must be **rejected**, not treated as "no origin".
- #2: `Secure` must still be `true` behind real TLS; the fix is protocol-derived, not "always off".

## Related

`hardening-baseline` (positive pass), `headers-cookies` (cookie flags), `auth-identity`
(session/identity), `origin-exposure` (Host/origin), `defensive-posture`.
