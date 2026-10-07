---
name: frontend-security-headers
description: >-
  HTTP-header-level security cookbook (CSP, Trusted Types, cookie recipe, CSRF
  via Fetch Metadata, clickjacking) for Fabber's Next.js/Caddy stack — tactical
  mechanisms that sit underneath the architectural INV-SEG rules in
  security-spec.md. Load this BEFORE configuring CSP, cookies, or any new HTTP
  response header.
---
# Frontend security headers (companion to security-spec.md)

Research pass completed 2026-09-12, live-verified against web.dev (`web.dev/articles/llms.txt`
as index, fetched `.md.txt` per article). This skill is **tactical/HTTP-header-level** —
[`docs/dev/security/security-spec.md`](../../docs/dev/security/security-spec.md) and its
`INV-SEG-1`..`INV-SEG-12` invariants are the **architectural** layer (DTOs, server-only,
Server Action auth re-checks) this skill sits underneath. Don't repeat those here; this
skill is additive, not a restatement.

## Content-Security-Policy (CSP)

Nonce-based for SSR (a fresh nonce per request, generated in Next.js middleware) — not
hash-based, which requires static content, a poor fit for dynamically generated HTML:

```
Content-Security-Policy: script-src 'nonce-{RANDOM}' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'
```

Sources: [web.dev/articles/csp](https://web.dev/articles/csp), [web.dev/articles/security-headers](https://web.dev/articles/security-headers).

## Trusted Types — DOM XSS prevention, incremental adoption

Locks down dangerous sinks (`innerHTML`, `document.write`, `eval`) so untrusted strings
can't reach them without going through a policy first.

1. **Report-only first**: `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; report-uri ...` + a `ReportingObserver` to log violations without breaking anything.
2. **Fix violations**: refactor sinks, use DOMPurify with `RETURN_TRUSTED_TYPE: true`, or a custom policy via `trustedTypes.createPolicy`.
3. **Enforce**: `Content-Security-Policy: require-trusted-types-for 'script'`.

Support: Chrome/Edge 83+, Firefox 148+, Safari 26+ — secure context only (HTTPS).
Source: [web.dev/articles/trusted-types](https://web.dev/articles/trusted-types).

## Other response headers

- **`X-Content-Type-Options: nosniff`** — recommended for every site.
- **`Referrer-Policy: strict-origin-when-cross-origin`** — the recommended value: no
  leakage on HTTPS→HTTP downgrade, only origin sent cross-origin, full URL kept same-origin.
  Set explicitly via header — never rely on browser default.
  Source: [web.dev/articles/referrer-best-practices](https://web.dev/articles/referrer-best-practices).
- **Clickjacking**: `X-Frame-Options: DENY` (or `SAMEORIGIN` if same-origin embedding is
  needed), plus the modern CSP equivalent `frame-ancestors 'none'`/`'self'` — CSP's
  `frame-ancestors` is the current-generation control for who may embed this page.
- **Permissions-Policy**: **not confirmed** in this research pass — no dedicated, current
  web.dev article was found (may have moved to developer.chrome.com). Don't assume a
  directive list from memory; fetch developer.chrome.com directly before configuring this
  header for real.
- **HSTS**: mentioned but without exact `max-age`/`includeSubDomains`/`preload` syntax in
  the source consulted — Caddy already issues this automatically via its Let's Encrypt
  integration in this project, so it's covered operationally even though the header syntax
  wasn't independently re-confirmed here.
- **Subresource Integrity (SRI)** for third-party CDN scripts (analytics, pixels): **not
  confirmed** — no standalone current web.dev article found. Consult MDN (already this
  project's normative fallback per `CLAUDE.md`) for the `integrity="sha384-..."
  crossorigin="anonymous"` mechanism before implementing.

## A real incident lesson: "noindex"/hidden-from-UI is not an authorization boundary

From a real security incident on a sibling project (`D:\calculadora-impressão-3d`,
LetraMaker, `evidencias-seguranca/RESUMO_SEGURANCA.md`, 2026-08-30 — not hypothetical, a
confirmed live data leak): the app's Supabase anon key was visible in the shipped JS bundle
(normal, expected — anon keys are meant to be public), but several privileged RPC functions
(`get_all_users_admin()`, `get_admin_user_stats()`) had **no server-side check that the
caller was actually an admin** before returning data. Result: 9,729 real user emails
extractable by anyone with the anon key and zero login, because the admin login screen's
redirect was the *only* thing standing between an anonymous caller and the data — the
underlying RPC endpoint itself never checked authorization.

**The generalized rule, not specific to Supabase**: a client-reachable key/token being
"public" (anon key, unauthenticated route, `noindex` page) says nothing about whether the
*operation* behind it is safe to expose — every privileged operation must check
authorization **inside itself**, server-side, never relying on "the UI doesn't link there"
or "it's not indexed" as the actual security boundary. This is exactly `INV-SEG-6`'s own
principle (*"every Server Action re-checks auth inside itself... reachable via a direct
POST even when it's not in the UI"*) — the LetraMaker incident is the concrete, real-world
proof of what happens when that discipline is skipped.

**A live, present-tense instance of this exact risk pattern already exists in this
project**: `apps/web/src/app/status/page.tsx` is explicitly unauthenticated today (a
documented, deliberate "dev-time, no real users yet" decision, with a stated plan to add
Cloudflare Access — the same mechanism already gating `/wp-admin`, `INV-SEG-11` — as a
follow-up). It doesn't leak user PII the way LetraMaker did, but it's the same *shape* of
risk: reachable with zero authorization check, protected only by `noindex` + obscurity.
Given this concrete incident, **this follow-up should be treated as due, not "someday"** —
the exact gap that turned into a real leak elsewhere is currently open here too, just with
lower-sensitivity data (deploy/build/infra status, not user emails).

## Cross-origin isolation (COOP/COEP/CORP) — confirmed low priority for this project

Web.dev is explicit: most sites only need this if using `SharedArrayBuffer`,
`performance.measureUserAgentSpecificMemory()`, or high-precision timers — none of which
this project uses. **Not a priority.** If a future payment gateway integration needs a
cross-origin-isolated resource, the syntax is `Cross-Origin-Opener-Policy: same-origin` +
`Cross-Origin-Embedder-Policy: require-corp`, with `Cross-Origin-Resource-Policy:
cross-origin` on each cross-origin subresource, testable first via
`Cross-Origin-Embedder-Policy-Report-Only`.
Sources: [web.dev/articles/coop-coep](https://web.dev/articles/coop-coep), [web.dev/articles/cross-origin-isolation-guide](https://web.dev/articles/cross-origin-isolation-guide).

## Cookie recipe — cart/session

```
Set-Cookie: __Host-session=...; Secure; Path=/; HttpOnly; Max-Age=7776000; SameSite=Lax
```

The `__Host-` prefix forces `Secure`, forbids `Domain`, and requires `Path=/` — stronger
than `__Secure-`. Use `SameSite=Strict` for sensitive actions specifically (password
change, purchase finalization). A cookie with no `SameSite` is already treated as `Lax` by
modern browsers; `SameSite=None` requires `Secure`.
Source: [web.dev/articles/first-party-cookie-recipes](https://web.dev/articles/first-party-cookie-recipes).

**Third-party cookies / Privacy Sandbox**: **not confirmed with confidence** in this pass —
only a passing mention found, no detailed current guidance. Low practical relevance today
(checkout is first-party via `INV-SEG-12`'s BFF, no third-party tracking cookie in the MVP)
— reconfirm directly against privacysandbox.com if/when third-party remarketing is added.

## CSRF for Server Actions — Fetch Metadata as an additive layer

On top of `INV-SEG-6`/`INV-SEG-7` (auth re-check inside every Server Action + configured
`allowedOrigins`), web.dev recommends inspecting **Fetch Metadata** request headers
server-side as an extra layer: `Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`.
Strategy: allow requests missing these headers (older browsers), trust
`same-origin`/`same-site`/`none`, allow simple GET navigations, allowlist public/CORS
endpoints by path, reject (403) everything else. Start in log-only mode before enforcing.
This is **additive** to `allowedOrigins`, not redundant with it — worth adding to the
checkout Server Action routes specifically.
Source: [web.dev/articles/fetch-metadata](https://web.dev/articles/fetch-metadata).

## Forms and autofill

Autocomplete values must match the exact token the browser recognizes — a documented
common mistake is `autocomplete="first-name"` (not recognized; the correct token is
`given-name`). Wrong syntax silently means zero autofill, not a partial degradation — a
real checkout-abandonment driver.
Source: [web.dev/articles/autofill-measure](https://web.dev/articles/autofill-measure).
Cross-check every checkout field against the WHATWG autocomplete spec's exact token list
(`cc-number`, `cc-exp`, `cc-csc`, `cc-name`, `shipping street-address`, etc.) — this article
confirms the *principle*, not the full token table.

## Known gaps — deliberately not filled from memory

Permissions-Policy directive list, SRI syntax, exact HSTS header syntax, Privacy
Sandbox/Topics API current relevance — none of these came back with confirmed, current
web.dev content in this pass. Fetch developer.chrome.com or MDN directly before writing
any of these into a real config, rather than assuming from general knowledge.
