# Module — service hardening anti-patterns (auth, cookies, rate-limit, origin, timing)

> **Related:** `headers-cookies`, `auth-identity`, `authz-idor`, `write-path-authz`,
> `defensive-posture`, `hardening-baseline`, `origin-exposure`, `secrets`.
> This module is the **negative** counterpart of `hardening-baseline`: concrete
> anti-patterns that pass a casual review but fail a real one.

## What it tests

Whether a **login/auth service** got the decisions right that are routinely wrong.
Each is a *mechanism* mistake, not a missing feature — it tends to survive code review,
linters and even a green test suite, because the happy path works.

| # | Anti-pattern | Detect | Why it matters | Test |
|---|---|---|---|---|
| 1 | **App connects to the DB as superuser/owner** | read the runtime DSN/role; run `SELECT rolsuper FROM pg_roles WHERE rolname = current_user` as the app | one SQLi (or an AI agent with a query tool) gets total DB power; on Postgres, `COPY … TO PROGRAM` runs OS commands in the container | a test that **fails** if the app user is superuser; a separate DML-only role for the app, superuser only for migrations |
| 2 | **Cookie `Secure` decided by `NODE_ENV`** | grep the cookie setter; inspect `Set-Cookie` of the login over plain HTTP in a **production build** | `next start`/`NODE_ENV=production` sets `Secure`, and a `Secure` cookie is not resent over HTTP → login silently breaks (or, worse, is "fixed" by disabling it) | assert `Secure` follows the **real protocol** (`x-forwarded-proto`) or a configured public scheme, never `NODE_ENV`; unit-test the decision (Chromium treats localhost as secure and won't catch it) |
| 3 | **Sensitive data in the URL before hydration** | load the login form with JS disabled / slow network and submit; watch the address bar | a form without `action`/`method` does a native **GET** → `?password=…` lands in history, server logs and `Referer` | progressive enhancement: `method=post action=/api/auth/login`, route accepts form-urlencoded and answers **303**, never echoes; an e2e with `javaScriptEnabled:false` asserting the URL never contains the secret |
| 4 | **`X-Forwarded-For` trusted without a trusted proxy** | send the request with a changing `X-Forwarded-For` and watch a rate limiter | the header is client-controlled → lockout/rate-limit per-IP is trivially bypassed | ignore XFF unless a proxy is configured; key the lockout on the **authenticated identity** (count only failures), or by `user.id`; test by varying XFF and asserting the block still happens. **The same header also poisons the audit trail:** session rows and audit logs that store the XFF value record an IP the attacker chose — grep every consumer of the client IP (rate limit, session, audit log, allowlist, geo-block), not only the limiter |
| 5 | **Origin/`Host` check that doesn't stop DNS rebinding** | compare `Origin` to `Host` only | a page on `evil.com` whose DNS points to `127.0.0.1` sends `Origin: evil.com` **and** `Host: evil.com` — they match, and the check passes; any unauthenticated route is reachable via the victim's browser | allowlist the `Host` (`127.0.0.1`, `localhost`, `*.localhost`, configured domain) and answer **400** otherwise; test `Host: evil.com` → 400 |
| 6 | **User enumeration via response timing** | time the login for an existing vs non-existing identifier | `user ? bcrypt.compare(.| 7 | **Expensive hash with no global budget (asymmetric DoS)** | read the login path: is the full KDF (Argon2/scrypt/bcrypt) run on **every** attempt, including the dummy hash for unknown users (#6), and is any limit **global** (or a concurrency cap on hashing) rather than only per-IP/per-account? Multiply KDF cost (ms, MB) × the request rate the limits still allow across the IP space | the attacker spends bandwidth, the server spends CPU and RAM per request; per-IP limits fall to rotation (#4) and per-account windows to fresh usernames, so the sum is unbounded. **White-box only — this skill never runs load (`SKILL.md` §10)** | a global login budget (requests/s and a semaphore on concurrent KDF work) in addition to per-IP and per-account; captcha after N failures; prove by code + a unit test of the budget, never by a load probe |
| 8 | **Rate-limit / lockout state in process memory** | grep the limiter's store (`Map`, `LRU`, in-process default) and the deployment's replica count | each replica (and each restart) has its own counter: N replicas = N× the budget, a deploy resets every lockout | shared store (DB/Redis) for counters; test two instances against one store and assert the second one sees the first one's failures |
| 9 | **Sliding session with no absolute cap** | read the session config: is `expiresAt` pushed forward on use (`updateAge`/refresh) and is there **any** ceiling from `createdAt`? | a stolen session used once per idle-window never dies — "30 min" is an idle timeout, not an expiry | an absolute lifetime (e.g. `createdAt + 12h`) checked on every request, forcing re-auth; test with a clock: active use past the cap → 401 |
| 10 | **Session renew races logout (unchecked UPDATE)** | the guard does `SELECT session` then `UPDATE … SET expires_at`; is the UPDATE's row count checked? | a logout between the two leaves the in-flight request authenticated; Postgres reports 0 rows and the code proceeds. Impact depends on what runs after `next()` — measure it before ranking | single conditional statement (`UPDATE … WHERE id=$1 AND expires_at>now() RETURNING …`) or treat 0 rows as 401; test: delete the row between read and renew, assert 401 |
| 11 | **Critical advisory in an auth dependency** | `npm audit --omit=dev --json` (or the ecosystem's equivalent) against the **exact lockfile that ships**, plus the advisory titles against the features actually enabled | the login runs code nobody on the team wrote (e.g. better-auth 1.7.5: OAuth state reusable as a magic link) | pin exact versions, read the diff of the upgrade, re-run the auth suite; a CI gate that **fails** on high/critical in prod deps (mutation: pin the vulnerable version back and watch it go red) |
| 12 | **Weak or breached password accepted; no progressive lockout** | register/set a password like `abc123`; fail N times on one account and time the answers | lists of leaked passwords are tried the same day; a flat limit without backoff lets a slow attacker continue forever | length + breached-password check (k-anonymity range API or a local list); per-account progressive delay after N failures (the pair rule in `auth-identity`) |
| 13 | **Stateless token outlives logout** | after logout, replay the access token (JWT) until `exp` | a JWT cannot be revoked without a server-side list; a long TTL makes logout cosmetic | short TTL (minutes) + `sid` claim checked against the session store on sensitive actions; refresh rotation with reuse detection; test: logout → sensitive call with the old token → 401 |
..) : false` returns in ms when the user is absent and ~100 ms when present; the generic message hides the text, not the clock | always run the hash compare (fixed dummy hash when the user doesn't exist); test that the compare runs on **both** paths |

## Findings compose — rank the combination, not each row

Rows that each look "resolved" can combine into a weapon: #6 (dummy hash on every miss) + #4
(attacker-chosen IP) + a per-account window that a fresh username resets = #7, an unbounded
CPU/RAM budget sold to anyone. After filling the rows, ask for every pair: **does one row's
fix assume another row's control holds?** The combined finding gets its own id and severity.

## Incidents (provenance)

Rows 1–6 were found building **our own** service (`segtools` hub), 2026-09-24/25 — which is
exactly why they belong here: they reproduce the mistakes our clients make, on code we wrote
and thought was clean. Fixes and tests: `docs/security/hub-lessons.md`, `docs/security/hub-threat-model.md`.
Rows 7–13 and the composition rule come from a public self-audit series on a session-based
auth system (10 audits, 2026-11) and were checked against our own SELD/IAM service on
2026-11-08 (row 11 was LIVE there: better-auth 1.7.5 → 1.7.18).

## False positives / cautions

- #4: an *absence* of `X-Forwarded-For` in a request is normal for non-browser clients; the
  finding is trusting it for a security decision, not seeing it.
- #5: `Origin: null` (sandboxed iframe) must be **rejected**, not treated as "no origin".
- #2: `Secure` must still be `true` behind real TLS; the fix is protocol-derived, not "always off".

## Related

`hardening-baseline` (positive pass), `headers-cookies` (cookie flags), `auth-identity`
(session/identity), `origin-exposure` (Host/origin), `defensive-posture`.
