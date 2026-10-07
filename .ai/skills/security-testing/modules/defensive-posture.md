# Module — defensive posture (what makes data/APIs hard to scrape or unlock)

> **Related:** `hardening-baseline` (verify the controls *positively*), `authz-idor`,
> `baas-direct-exposure`, `auth-identity`, `headers-cookies`.

## What it tests

**How** the system resists the three things an attacker wants: **read other people's data**
(scraping), **call privileged APIs**, and **unlock paid resources** without paying. This is the
"defenses" view — the complement to `hardening-baseline`, which checks a control is *present*;
this module asks *how many layers a given abuse must cross*, and where they collapse.

Layers, from the client inward:

1. **Client JS** — is anything decided here (plan, admin, feature flags, entitlements)? If yes, it
   is bypassable by an extension/bundle patch. A client check is a **UX** guard, never a security one.
2. **Transport/key** — can the client reach the backend at all, and with what? A **BFF** hides the
   provider; a **BaaS-direct** design exposes the project URL + a public key to every browser.
3. **Key scope** — a public key is fine; an **unrestricted** one is abuse surface. Referrer/API
   restrictions shrink it to the real origins.
4. **Endpoint/RPC authorization** — does every function re-check identity+role, or is there an
   unauthenticated path that returns tenant data (the classic scrape)?
5. **Per-object scoping** — every collection/table scoped to the owner. **One unscoped collection
   is the whole scrape surface**, regardless of the rest.
6. **Entitlement (paid resources)** — plan/quota enforced server-side, or only hidden in the UI?
7. **Anti-automation** — rate limits, lockout, captcha/**App Check** on login, RPCs and cost endpoints.
8. **Blast-radius caps** — pagination caps, row limits, per-call maxima (a cap turns "dump" into
   "sample"; no cap turns one open endpoint into the full table).
9. **Storage** — list/read denied by default.
10. **Minimization** — public payloads carry no third-party e-mail/plan/`isAdmin`/internal ids.
11. **Supply chain** — third-party scripts (CDN, GitHub Raw, analytics, captcha) pinned and **SRI**-protected,
    not loaded at runtime from an unpinned origin. Ten "self-contained" tools that still `fetch` a CDN at
    runtime are not self-contained; an unpinned third-party script is a change-of-behavior vector.
12. **App boundary (MUST)** — the **backoffice/admin** and internal/pro functions are a **separate deploy**
    (own host + auth + CSP), never in the same bundle as the client app. When they ship together, the
    client bundle *contains* the admin panels/pro logic/RPC names — downloadable by anyone, and unlockable
    by editing the JS. Even with correct server-side authz (no data leak), bundling admin+client **leaks
    the architecture/logic/competitive differentiator**. Check: `grep` the public bundle for admin/report
    route & RPC names — it must be empty. Full rule: `HARDENING-PLAYBOOK.md` **§4.6**.

**Test the entitlement endpoint DIRECTLY — a client-side gate whose endpoint answers to anon is a
real bypass.** To separate "cosmetic client-side lock" from "real PRO unlock", don't use the UI: read
the bundle for the **paid endpoint** (`fetch("/api/<paid>…")`) and call it **directly** with no
session and with a free session. If it **refuses** (`401/403`), the lock is cosmetic (safe). If it
**answers the paid payload to anon/a free account**, the lock is fake and **an extension that flips
the client flag unlocks the paid feature** *and* leaks the logic. Observed live on a Next.js BFF:
`POST /api/pricing/advanced` returned the full PRO payload (pricing + per-marketplace fees/strategy =
the product's **math**) to an **unauthenticated** request; the `!isPro && <Locked>` gate was
client-only → **High** (paywall bypass + differentiator leak, §4.6/§5). Optional fields also help:
omitting them, the error ("Missing required fields: …") reveals the schema. The denied response is
the evidence of the control; the **200-to-anon is the finding**.

## Deterrence layers (anti-inspection / anti-copy) — raise cost, **not** a boundary

Beyond the 11 enforcement layers there is a family of **deterrents** seen in the wild: blocking
`F12`/right-click/`Ctrl+Shift+I`, a **console banner** ("stop — this is a protected app"), code
obfuscation, anti-debugger timers, taunting messages. Observed together on the 3DPricing target:
`F12` and right-click were suppressed, and a console hardening message appeared; DevTools only
opened via the Chrome **menu**.

**Frame them as posture, not security:**
- They are **bypassable** — DevTools opens from the menu / `chrome://inspect` / CDP; right-click
  blocking is cosmetic; obfuscation is reversible. They raise the *cost of casual* inspection, not
  the cost of a determined one.
- **Never count them as coverage** and **never let them replace a server-side control**. A paywall
  "protected" by a devtools blocker is still bypassed by calling the API directly.
- They can **hurt** legitimate debugging and accessibility, so they are often theater on their own.

**What actually reduces copy/inspection exposure (the real layers):**
- **Layer 2 (BFF):** the genuine anti-copy — if logic and data live **server-side** and no key/data
  reaches the bundle, there is nothing to read in the client. Copying the UI buys nothing.
- **Server-side authz/entitlement (4–6):** reproducing the front-end does not reproduce the privilege.
- **CSP (headers module):** a real control against injected scripts — unlike devtools-key blocking.

**How to record it:** in the layers matrix, add rows for *devtools-key block*, *console banner*,
*obfuscation/anti-debug*, marked `deterrence (bypassable)` — **not** `enforced server-side`. Name the
bypass you used (e.g. "opened via Chrome menu / CDP"), which is itself the evidence they are cosmetic.

**The ceiling (anti-scrape/anti-cópia/anti-inspeção/anti-invasão):** the full checklist of what a
maximally-hardened system does — architecture (BFF, no business logic in the client, payload
minimization, opaque ids, blast-radius caps), session (httpOnly cookie, short/rotating tokens, origin
check + Fetch Metadata), anti-automation (edge rate-limit, lockout, **server-verified** captcha, bot
mgmt/WAF, request signing), headers (nonce+strict-dynamic, **Trusted Types**, no `X-Powered-By`,
SRI), cache/privacy, payments (hosted checkout + signed webhook), monitoring (audit + alerting) — is
in `HARDENING-PLAYBOOK.md` **§4.4**, each item marked ✅ (already done by the reference target) or ➕
(what it still lacks). Grade a target against that ceiling, not against a single probe.

## Why (the incidents — same surface, opposite outcomes)

The defensible-vs-not contrast is the point:

- **Scrape trivial (LetraMaker):** BaaS-direct (layer 2 absent) + **unrestricted** key (3) +
  **an open RPC** `get_all_users_admin` with no authz (4) → anon pulls user records; no cap beyond
  1000/call. The client key was never the hole — layers 3+4 were. Same surface with the controls
  present (Calc3D) returns **403**.
- **One unscoped collection is enough (CordeiroFlow):** most tables RLS-scope the owner, but
  `storefronts` returns **155 rows across 155 owners** to a normal session, plus an
  `affiliate_balance(user_id)` that **trusts a client-supplied uid** (layer 5/6 collapse). The
  system's own hardening elsewhere does not save it.
- **BFF done right (Primu3D, NeoBrix):** a client-side extension is **cosmetic** (layer 1 is not
  load-bearing); authz is per-object server-side; login rate-limited (`5 → 429`); CORS allowlisted;
  full CSP. Scraping requires defeating the server, not the bundle.
- **Firebase done right (Calc3D):** referrer-restricted key (3) + rules scoping `userId ==
  uid` (5) + `:listCollectionIds` denied + storage locked (9) → enumeration and scrape blocked.
- **The counter-metric:** see `FRAGILITIES-CATALOG.md` baseline matrix — the clients that leaked
  are exactly the ones missing layers **3/4/5**, not the ones with a key in the bundle (all have one).
- **Supply chain is its own layer (11):** a "self-contained" tool that loads a **CDN at runtime**
  (observed in three extracted tools) is neither offline nor pinned; and an **anti-bot widget not
  verified server-side** (Split3MF) is decorative — a script posts past it. Both are *defense*
  failures even when no data leaks.

## How to verify

Probe **each layer's collapse point**, not just the top:

```bash
# 2/3 transport+key: does the public key work from a foreign origin?
curl -s -o /dev/null -w '%{http_code}\n' "https://<provider>/rest/v1/<rpc>" -H 'apikey: <PUBLIC>' -H 'Referer: https://evil.example/'
# 4 unauth path: the admin/aggregate RPCs, with NO auth header (scrape surface)
curl -s "https://<provider>/rest/v1/rpc/<admin_fn>" -H 'apikey: <PUBLIC>' -H 'Content-Type: application/json' -d '{}' | head -c 200
# 5 the unscoped collection: does an own session return OTHER owners' rows?
#   (count distinct owner id in the response; one collection being cross-tenant is the finding)
# 6 entitlement: call a paid function with a free/edited client plan — does the SERVER refuse?
# 7 anti-automation: N sequential login/RPC calls; a 429/lockout is the control working
# 8 caps: ask for more than the cap; note the per-call maximum (blast radius)
```

Record a **defensive-layers matrix** per target: layer × {enforced server-side / client-only /
absent} with the probe output.

## What "covered" means (with evidence)

- A **layers matrix**: for each of the ten layers, where it is enforced and the evidence
  (status code from a foreign-origin probe, a cross-owner count, a 429).
- **The collapse point named**: the single layer whose failure enables the abuse (e.g.
  "CordeiroFlow: layer 5 — `storefronts` cross-tenant, 155/155 owners").
- **The paid-resource verdict**: prove entitlement is server-side by calling a paid function with a
  client-side plan edit; a `200` where a `403`/`402` was due is a finding.
- **Caps quantified**: the per-call maximum a scrape can pull (a cap is a mitigation worth stating).

## Known false positives

- **A client-side check is not a bypass.** "The extension unlocked the PRO UI" is expected; the
  finding is only if the **server** also honored it. Prove with the raw transport (XHR), not the UI.
- **A public key in the bundle is not a failure.** Check its **scope** and what it reaches.
- **An RPC that returns the caller's own data is correct**, even from anon-ish surfaces; ask
  whether the **rows are others'** (count distinct owners).
- **A denial you caused** (malformed query → 400) is not a control; only a valid foreign request
  that is refused counts.
- **A per-call cap is not "secure"** — it is blast-radius mitigation; the endpoint is still a scrape
  at 1000/request. State both.
- **CORS is not authz.** A permissive `Access-Control-Allow-Origin` on an authenticated BFF does
  not leak by itself if the server scopes by session — record the layer, not the headline.
