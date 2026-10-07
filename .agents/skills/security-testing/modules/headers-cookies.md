# Module — headers & cookies (the check)

## What it tests

Whether the headers and cookie attributes the other skills *decide* are actually being
**served**, on each target, right now.

**This module is deliberately thin: it owns the check, not the recipe.**
`.claude/skills/frontend-security-headers/SKILL.md` owns what the values should be
(CSP, Trusted Types, the cookie recipe, CSRF via Fetch Metadata, clickjacking) —
load that one to decide *what to set*; load this one to prove *what is set*.
`docs/dev/security/security-spec.md` §6 is the normative list for this project.

## Why

**Header posture was a real, live gap here twice, on our own host.** The Caddyfile's
`fabber.com.br` block carries the note that the security headers were "a real gap found
live 2026-09-04" — checked against the actual file rather than assumed stale — and that
the block had been added to `api.fabber.com.br` first while the storefront's own block
genuinely did not have it. It also records the deliberate decision that a CSP was
**not** added yet, because `apps/web` was still a placeholder and "a CSP written against
no real page content would be guessed, not verified". That is the standard this module
holds: a header you have not seen in a real response is not a header.

**The cookie half has a concrete failure shape from the catalog.** An audited system's
session cookie was reachable from JavaScript while the same system had no CSP — i.e.
XSS escalates to session theft with no second control (`FRAGILITIES-CATALOG.md`, P11,
`AUTH-STACK-COMPARISON.md`'s "cookie acessível por JS (XSS rouba sessão)"). Our own
model is the opposite by design: a shared `.fabber.com.br` **httpOnly** cookie for
first-party Next.js surfaces (`.claude/skills/identity-auth/SKILL.md`, tier 1). So the
test is simple and load-bearing: **is it actually `HttpOnly`, and is it actually scoped
to the domain the model says?**

**Two cheap fingerprinting findings that generalize.** Exposed `X-Powered-By`, and a
**Sessão compartilhada entre IdP e app não é grátis em configuração.** O default guarda em
`localStorage` (por origem) e compartilhar exige `Domain` de cookie **explícito** em server, browser e
middleware. O servidor de OAuth frequentemente **não** tem `logout`/`end_session`/`revoke` — matar a
sessão do IdP não derruba o cookie do app; e relógios diferentes (clock skew) fazem `iss`/`exp` falharem.
(fonte: fabber/HANDOFF-HISTORY.md:7384,7390, tokenhood/.ai/sessions/tokenhood-master-onboarding-handoff.md:4425-4432,4368-4375)
`/.env` path answering `200` with the framework's 404 page — both Medium/Low, both
trivially checkable, both appearing in two independent audits
(`primu3d-report.md` M2/M3; `FRAGILITIES-CATALOG.md` P4/P5). Neither is dramatic; both
are the kind of thing that is only ever found by looking at a real response.

## The strong reference posture (target state — replicate in Fabber)

The **PrintGest** target (`app.printgest.com.br`) is the most hardened of the audited series and is
the **reference posture** to converge to. The live block:

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-<per-request>' 'strict-dynamic' https://js.stripe.com …;
  style-src 'self' 'unsafe-inline' …; img-src 'self' data: blob: https:;
  font-src 'self' …; connect-src 'self' https://*.supabase.co wss://*.supabase.co …;
  frame-src 'self' blob: https://js.stripe.com; object-src 'none';
  base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
X-Frame-Options: DENY | X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin | Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains | X-Robots-Tag: noindex, nofollow (área logada)
```

- **`nonce` + `strict-dynamic`** (sem `'unsafe-inline'`/`'unsafe-eval'` no `script-src`) is the
  load-bearing control: only the response's nonce'd scripts run; `strict-dynamic` trusts scripts
  loaded by a trusted one. This is what makes XSS-by-script-injection non-trivial.
- **`object-src 'none'` + `base-uri 'self'` + `form-action 'self'` + `frame-ancestors 'none'`** —
  belt-and-suspenders with `X-Frame-Options: DENY`.
- **`connect-src` with an explicit allowlist** (the real backends only), never `*`.
- **Implementation:** Next.js `headers()` + middleware nonce (Fabber `apps/web`); Caddy `header{}`
  for the static set; `firebase.json → hosting.headers` / `.htaccess` for static hosts. Full recipe
  and the Fabber rollout: `HARDENING-PLAYBOOK.md` §4.3.

**Anti-patterns found live in this series (grade down when you see them):**
| Anti-pattern | Seen on |
|---|---|
| CSP only `upgrade-insecure-requests` | Precifi3D |
| CSP **`Report-Only`** (present but non-enforcing) | Precifi3D (dev) |
| `script-src 'unsafe-inline' 'unsafe-eval'` | 3DPricing |
| **No CSP at all** | EiPrint, HypeBuild3D |
| Only HSTS (no CSP/XFO/nosniff) | HypeBuild3D |
| `X-Powered-By` exposed | 3DPricing |

## How to verify

One command per target, and **read the whole header block** — several of these
findings are "the header is absent", which is invisible in a filtered view:

```bash
for h in fabber.com.br www.fabber.com.br api.fabber.com.br id.fabber.com.br stg.fabber.com.br; do
  echo "=== $h ==="
  curl -sSI "https://$h/" | grep -iE "^(HTTP|strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy|x-powered-by|via|server|cache-control)"
done
```

Cookies need a real response that sets one — never fabricate a session, and never print
a cookie value. Inspect the **attributes only**:

```bash
curl -sSI "https://id.fabber.com.br/" | grep -i "^set-cookie" | sed 's/=[^;]*;/=<redacted>;/'
# and, on a real login response, the same: attributes only, value redacted
```

Then check the three properties a header alone cannot show:

- **Does the session-scoped route send `Cache-Control: private`/`no-store`?** A
  `s-maxage` on a personalised route is the shape to look for. Ours is correct live —
  `/api/me` and `/api/login-screen` both answer `private, no-cache, no-store, max-age=0,
  must-revalidate`.
- **A long `s-maxage` on a *public* route is only inert while the CDN is not caching it —
  read `cf-cache-status` to tell which.** `MEDIUM-12`: `https://fabber.com.br/` returns
  `Cache-Control: s-maxage=31536000` with `x-nextjs-cache: HIT`, while Cloudflare reports
  **`cf-cache-status: DYNAMIC`** — so nothing is caching HTML today and the one-year value
  is currently harmless. It stops being harmless the day HTML caching is enabled, and this
  is the project's named risk #1 (a real `consultaremedios.com.br` incident where updates
  stuck in cache). Report it as LATENT with the `cf-cache-status` evidence, not as a live
  stale-content bug. RSC (`?_rsc`) was **not tested** — say so rather than implying it was.
- **Is `/.env` (and `/wp-config-sample.php`, `/readme.html`, `*.log`, `/.git/*`) a real
  `404`/`403`, with a body that is not a page?** `infra/docker/Caddyfile`'s
  `@blocked_sensitive` matcher is the control; verify the *status and content-type*,
  not just that the request did not error. Live: **404** on the storefront, **403** on the
  WP host.

## What "covered" means (with evidence)

- **A per-target table of the six headers plus `X-Powered-By`**, each cell the real
  value or an explicit "absent", from a command whose output is in the report.
- **Cookie attributes observed on a real response** (`HttpOnly`, `Secure`, `SameSite`,
  `Domain`, `Path`) with the value redacted — and a statement of which tier's cookie it
  is.
- **The blocked sensitive paths answered with a real `404`/`403`**, with status and
  content-type.
- **Where a header is deliberately absent, the reason is recorded** — the missing CSP on
  the storefront is a decision with a stated unblock condition ("add a real CSP once
  actual pages/scripts exist to test it against"), not an oversight. A report that
  cannot tell those apart will keep re-filing the same non-finding.
- Any change to these values goes through `frontend-security-headers` for the recipe,
  and through the Caddyfile (versioned) for the deployment — never a dashboard edit
  ("IaC total", `CLAUDE.md`).

## Known false positives

- **A header set at the edge but not at the origin** — and vice versa. Check the layer
  that answers, and say which; `curl` from outside sees the edge.
- **"CSP is absent in production" does not mean the CSP was never written.** `HIGH-1`'s CSP
  half is the trap: `apps/web/next.config.ts:149-161` emits
  `Content-Security-Policy-Report-Only` for `/(.*)` **unconditionally** (no env gate
  anywhere in the file), and production served none — because production was running a
  ~10-day-stale artifact. Two candidate explanations fit a missing header (the artifact
  predates the config; or something strips it in transit), and the reasons the first wins
  here are worth reusing: Caddy `header{}` blocks only *add*, and Cloudflare does not strip
  CSP by default. **Check the file's own git date against the artifact before filing a
  missing header as a missing control** — the fix owed is a promotion, not a header. See
  `modules/deploy-drift.md`.
- **The other five headers being present does not vouch for the sixth.** Live on
  `fabber.com.br`: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy` all present, `X-Powered-By` absent — and CSP missing. A summary row
  saying "security headers: present" would have hidden it.
- **`wp-admin`'s CSP is deliberately permissive** (inline scripts/styles from Yoast,
  WooCommerce and Gutenberg React dashboards), documented in the Caddyfile's own
  comment. A strict-CSP scanner flags it every time; it is a decision, not a defect —
  and the compensating controls are stated there.
- **A permissive `Cache-Control` on a route that renders only a shell is not a leak.**
  The catalog has this exact false positive, verified down: `/dashboard` without a
  session returned only the shell (`BAILOUT_TO_CLIENT_SIDE_RENDERING`, no PII), with the
  data arriving from an authenticated `/api` call, while `/admin` correctly returned
  `private, no-store` — recorded as "resolved, no leak" (`primu3d-report.md` M4). Verify
  by fetching the route without a session and reading the body, not by inspecting the
  header alone.
- **A missing `X-Powered-By` on one host and present on another** is a per-target
  finding, not a global one.
- **Cache headers from Cloudflare** (`cf-cache-status`, `age`) are the CDN's, not ours —
  they are evidence about the cache chain, not about our application's header policy.
- **HSTS on a host that also serves plain HTTP** is only real if the redirect chain
  holds; check `http://` too before scoring it.
