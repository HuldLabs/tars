# Module — AI-code failure classes, mapped to this stack

## What it tests

The fifteen failure classes that code written by an AI assistant reliably leaves behind,
each mapped to **this** repo's corresponding surface and check. It is a coverage
checklist for a review, not a list of things to assume are broken.

## Why

**The premise is not an insult to the tooling, it is a stated project fact.**
`docs/dev/security/ci-security-spec.md` opens with it: the code here is **100%
AI-generated**, and 2026 literature is consistent about what that means — AI code has
~1.7× more issues than human code and ~2.74× the XSS rate (VibeGuard, arXiv 2604.01052);
studies point to a 25–40% vulnerability rate in assistant output (SQLi, XSS, insecure
auth). The same spec draws the operative conclusion: *"security enforcement cannot rely
on human review in vibe-coding workflows"* — the automated gate **replaces** the review
that does not exist here. That is why `modules/ci-gates.md` matters more here than it
would in a human-written codebase.

**The classes themselves are a distilled checklist, and the list is worth keeping
whole** (`primu3d-ai-code-test-plan.md` §1.1–§1.15, written for a Next.js + BFF app —
the same shape as ours). Two of the three audited systems had almost all of them; the
one that was clean had them mitigated by architecture, not by review. The single rule
that separates the two outcomes, in the audited ecosystem's own words:
**never let the client be the only place a business rule is decided** —
*"Nunca escreva `if (user.isPro)` / `if (user.isAdmin)` no cliente como **única** decisão
de acesso"* (`HARDENING-PLAYBOOK.md` §5).

## The technique that resolves a row fastest: find the sibling that got it right

The 2026-09-21 audit establishes finding after finding by contrast, and the contrast is
always **inside this repo** — which makes it both cheap and hard to argue with. Four
instances, each closing a different row:

| Finding | The correctly-built sibling |
|---|---|
| MP webhook **fails open** on an unset secret (`HIGH-6`) | `api/revalidate/route.ts:55-64` uses a shared secret and **fails closed** |
| Status DALs hand raw upstream JSON to Client Components (`MEDIUM-7`) | the GitHub Actions path in the *same file* maps fields explicitly (`get-build-info.ts:443-461`) |
| The `INV-SEG-1` CI job asserted nothing (`CRITICAL-4`) | `tests/contracts/test_caddy_wpjson_store_api_exceptions.py` — a real gate, passing, asserting a *different* property |
| `apps/id` has no lockout or rate limit (`HIGH-4`) | WordPress's own 15-minute lockout, `fabber-hardening.php:400-439` — proving the omission is specific, not architectural |

Use it deliberately: when a row looks like "AI code forgot X", grep for X in this repo
before concluding it was forgotten. **A working instance elsewhere in the same codebase
turns a speculative gap into a specific, located defect** — and it removes the hardest part
of writing the finding, which is convincing a reader that the desired behaviour was ever
achievable here. The absence of any sibling is itself a signal (Efí's missing webhook
handler, row 15): then say "confirmed absent", which is a result, not a hole in the pass.

## How to verify — the fifteen, with our surface for each

| # | Class | Our surface | Check |
|---|---|---|---|
| 1 | **IDOR/BOLA** — authn without authz | every route taking an object id | `modules/authz-idor.md` |
| 2 | **Identity from the client** | `orgId`/`userId`-shaped params; our equivalent is any owner id in a query or body — **and any client-supplied *selector* that picks a security-relevant behaviour**, which is the same class even when it is not an identity | does the server derive it from the session (`.claude/skills/identity-auth/SKILL.md`)? A parameter that is *ignored* is the strong form. Counterexample: `payment_method` taken from `FormData` with no whitelist (`store-actions.ts:125` → `store-api-client.ts:258`) lets a client pick the payment path — `MEDIUM-5` |
| 3 | **Mass assignment** — `{...req.body}` straight into an update | Store API calls, WP REST updates, Better Auth user updates | whitelist the fields; ask what a caller-supplied `role`/`plan`/`status` would do |
| 4 | **Unguarded new route handler** | a new `route.ts` or Server Action | `INV-SEG-6` — every Server Action re-checks auth **inside itself**; page-level auth does not extend to it |
| 5 | **Plan/limit enforced only in the UI** | no paid tiers today; the analogue is stock/price/coupon rules | `INV-SEG-8` — price, discount, shipping and total computed server-side from an identifier, never accepted from the client |
| 6 | **SSRF on a URL-fetching feature** | nothing user-facing fetches a URL today (the Melhor Envio / ViaCEP calls are server-side integration code). The nearest surface is `next/image`'s host allowlist (`next.config.ts:45-49,76-83`) | **The guard is Next's own — this repo depends on it rather than reimplementing it**, and the finding is the flag that disables it: `dangerouslyAllowLocalIP: isDev` (`next.config.ts:103`) turns off the private-IP refusal for *every* optimized host in dev (`MEDIUM-10`). Name the dependency explicitly, because "we'd notice an SSRF" is false if the framework's guard is off |
| 7 | **Injection** | `$wpdb`, `mysql2`, Python f-strings | `modules/injection.md` |
| 8 | **Permissive CORS / missing headers** | Caddy + Next header blocks | `modules/headers-cookies.md` |
| 9 | **Secrets in the client/bundle** | `NEXT_PUBLIC_*`, build output, the served artifact | `modules/secrets.md`, `INV-SEG-2`, `INV-CI-2` |
| 10 | **Verbose errors** — stack/SQL leakage | Next error surfaces, WP REST error bodies, the IdP | force a malformed body, an unknown id, a wrong type; check the body carries no stack/SQL/config |
| 11 | **No rate limiting on costly endpoints** | login/PIN/sign-up, cart/checkout, any write | declared in `infra/pulumi` — and real only while the origin accepts HTTPS only from Cloudflare's ranges |
| 12 | **Cache poisoning / caching authenticated data** | ISR, `revalidateTag`, Cloudflare in front | the cache-invalidation chain runs origin→edge (`CLAUDE.md`); verify a personalised route is not shared-cached — and read the body before filing it (see `modules/headers-cookies.md`'s verified non-finding) |
| 13 | **Framework-specific surface** (RSC/Next) | `apps/web` App Router | Server Actions + `allowedOrigins` (`INV-SEG-7`) — **absent from `next.config.ts` entirely, with no encryption key set (`MEDIUM-1`)**. `INV-SEG-8` **holds**, verified: no price/total/discount/shipping value crosses from client to WooCommerce (`store-api-client.ts:234,258`; the checkout form has no amount input). `INV-SEG-3` is **violated in 3 status DALs** — raw upstream JSON `as`-cast and handed to Client Components (`get-build-info.ts:77,134,161` → `status/page.tsx:426,428,436`) → `MEDIUM-7` |
| 14 | **IdP integration trusted from the client** | `apps/id` + the WordPress OIDC client | derive identity from the session/JWKS-verified token, never a client-supplied org/role; `state` single-use (`modules/auth-identity.md`) |
| 15 | **Webhooks / integrations unverified** | Mercado Pago/Efí, Melhor Envio | `modules/webhooks-payments.md`. `HIGH-6`: MP verifies HMAC correctly but **fails open** when the secret is unset and handles chargebacks **before** the check. **Efí has no handler in this repo at all** (`deploy_wp_payment_gateways.py:166-167` registers its gateways installed-but-disabled) — confirming absence is the deliverable, not a gap in the pass |

For a review, walk the table and for each row write either the `file:line` that
implements the control or the finding. "Not applicable" needs a reason.

## What "covered" means (with evidence)

- **Every one of the fifteen rows resolved** — control at `file:line`, finding, or an
  explicit N/A with the reason. Fifteen rows is small enough that partial coverage is
  not defensible.
- **The architecture-level rows (1, 2, 4, 5) are answered structurally**, not by
  sampling: name the invariant (`INV-SEG-6`/`8`/`9`/`12`) and the mechanism that makes
  the client's opinion irrelevant.
- **At least one row is closed by a test you mutation-tested** (`modules/ci-gates.md`),
  because the spec's whole argument is that review is not the enforcement mechanism
  here.
- **Row 10 is checked with a real malformed request**, since error verbosity is a
  property of the running app and of nothing in the source.

## Known false positives

- **This list is a coverage checklist, not a prediction.** An AI-written codebase with
  a BFF, session-derived identity and server-side gating can be clean across most of it
  — the audited Next.js + BFF app was, returning `403` on every IDOR probe and leaking
  nothing. Reporting "AI-written, therefore likely vulnerable" is not a finding.
- **A mitigation elsewhere is still a mitigation.** `INV-SEG-12` (the browser never
  calls `/wp-json/**`) makes several rows structurally inapplicable rather than
  unaddressed; record which mechanism covers them.
- **Vendor "secure by default" is not coverage.** The audited catalog's own conclusion:
  security comes from architecture, not from the library — the same vendor was safe in
  one architecture and leaky in another (`AUTH-STACK-COMPARISON.md`).
- **A finding in the *external* ecosystem is not a finding here.** The catalog's
  client-side-plan-gating and bundle-patching cases describe SPAs that decide access in
  the client; our equivalents are the exemption rows above. Cite them as the lesson,
  never as evidence about our code.
- **`X-Powered-By`-class items are Low and should be labeled as such** — including the
  fingerprinting rows, which scanners weigh more heavily than they deserve.
