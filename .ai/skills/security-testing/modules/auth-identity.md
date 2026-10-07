# Module — auth & identity surface

## What it tests

The properties of the login/sign-up/session surface that no functional test would ever
fail on, because the happy path works perfectly either way:

1. **Enumeration** — can an unauthenticated caller learn which identifiers exist?
2. **Oracles** — does any endpoint answer a question about someone else's account
   (the CPF case is the sharp one)?
3. **Timing** — does the miss path do the same work as the hit path?
4. **Abuse controls** — rate limit, Turnstile, lockout; and whether they can be real.
5. **OIDC** — `state` single-use, `iss`/`aud`/`nonce` verified, no session reuse across
   a relying party.
6. **Open redirect** — does a post-login `next`/`redirect` parameter leave our domain?

Load `.claude/skills/identity-auth/SKILL.md` first: it owns the architecture, the
oracle discipline and the checkout gate. This module owns only the *tests*.

## Why

**Enumeration, from a real client finding.** A Clerk-configured system had
`attack_protection.enumeration_protection.enabled = false`, so sign-in responses for an
existing vs. non-existing e-mail could diverge — alongside MFA not required by default
and a session cookie without `HttpOnly` (`FRAGILITIES-CATALOG.md`, P9/P10/P11). The
current Clerk environment page is readable and versioned, which is what made it a
finding rather than a guess.

**Oracle discipline is a design decision here, and it is asymmetric on purpose**
(`identity-auth/SKILL.md`, "Identifier resolution — the oracle discipline"):

- Every *failure* returns the same shape and the same copy — one shared constant,
  `ERRORS["invalid-credentials"]` in `apps/web/src/lib/themes/auth-feedback.ts` — for
  identifier-not-found, wrong password, malformed CPF and unverified e-mail — and the
  miss path does the same work as the hit path (dummy verify) so timing does not leak.
- PIN requests answer "if an account exists, a code was sent".
- **Guest with an existing e-mail → reveal and block** (accepted, rate-limited);
  **guest with an existing CPF → never reveal**, send a PIN to the owning account and
  show only a masked address.
- **A mask is only a mask if its width is fixed.** `apps/id/src/lib/mask-email.ts:16-22`
  always emits exactly three stars, so the masked string cannot leak the local-part's
  length — the audit's verified-good finding. A mask that echoes the original length
  narrows the search space it was supposed to close, so check the *fixed width*, not just
  that an `@` and stars appear (audit §HIGH-4, "Good practice to keep").

**Masking the e-mail is not the property — and the audit is the proof.** `HIGH-5` is this
exact route: `apps/id/src/app/api/checkout/cpf-check/route.ts:52-72` returns `{found:false}`
or `{found:true, maskedEmail}` and triggers a real OTP to the unmasked address, which the
only test shape this module used to describe ("the e-mail is never in the response body")
would have **passed**. `found: true` *is* the reveal, and it is the thing
`identity-auth/SKILL.md:70-71` forbids: *"Guest with an existing CPF → **never reveal**"*.
Two further facts the route's own docstring gets wrong: it claims to be *"Internal-only by
architecture … never called from the browser directly"* (`:22-23`), but
`id.fabber.com.br`'s Caddy block has **no path allowlist** — only `@migrate path
/api/auth/migrate` → 404 (`infra/docker/Caddyfile:254-255`) before `reverse_proxy
id-prod:3100` (`:257`) — so the internal hostname constrains the *caller*, not the route;
and CPF check digits are computable by definition, so the identifier space is enumerable.
Classified `DOWN` only because the IdP is down (`HIGH-4`'s sibling finding); it is live the
moment the IdP is restored (audit §HIGH-5).

So this module's coverage test is two assertions, not one: **no unmasked identifier in the
body**, *and* **the response does not answer the existence question the rule says must not
be answered**. The e-mail half of the asymmetry is a documented, accepted decision
(`email-check/route.ts:10-16`) — the CPF half is not.

**Open redirect (HIGH-7, 2026-09-21).** `GET` paths validate `next`
(`apps/web/src/lib/themes/login-payload.ts:46`); `POST` paths do not — `next` is taken
raw from `FormData` (`apps/web/src/lib/themes/auth-actions.ts:47`) and reaches
`redirect(next)` at `:189` and `:229`. Five sinks across `apps/web` and `apps/id`. The
"validating" GET path is itself weak: `startsWith("/")` admits `//evil.com` and
`/\evil.com`. A link on a domain we own that forwards to an attacker's page is a
credential-phishing primitive, which is why it is High and not Medium.

**OIDC `state`.** The WordPress OIDC client keeps `state` as a single-use transient,
deleted on read (`fabber-id-oidc.php:~678`, per the audit addendum's clean result) — the
same positive shape the whole module is looking for: a property with a mechanism behind
it, not a convention.

**Abuse controls are IaC and depend on origin lock-down.** Rate limiting on
`id.fabber.com.br/api/auth/*`, Turnstile on login/sign-up/PIN, Bot Fight Mode and Leaked
Credentials Detection are declared in `infra/pulumi` — and "none of it is real unless the
origin accepts HTTPS only from Cloudflare's IP ranges" (`identity-auth/SKILL.md`). That
dependency is itself a test: if the origin is reachable directly, the controls are
decorative.

**`HIGH-4` is what "declared" without "verifying" costs, and it is three stacked gaps, not
one** (audit §HIGH-4) — each with a grep that settles it in one line:

1. **Turnstile is a widget with no server-side verification.** The Pulumi resource exists
   (`infra/pulumi/modules/identity_edge_controls.py:109-116`) and its own output note
   (`:102-108`) says the secret is *"NOT committed anywhere; wire it into `apps/id`'s
   environment"* — it was never wired: `grep -rni turnstile apps/id/src` → **zero matches**.
   A widget with no server-side check is decorative; a script posts straight to the API and
   never sees a challenge. **An unverified captcha is worse than a documented absence**,
   because its presence in the IaC reads as coverage.
2. **No application-level rate limit or lockout exists in `apps/id`** —
   `grep -rniE "ratelimit|rate_limit|rate-limit|lockout|throttle" apps/id/src` matches only
   a docstring, and no `rateLimit` option reaches `betterAuth({...})`
   (`apps/id/src/lib/auth.ts:111-715`). The working counterpart elsewhere in this repo
   proves the omission is specific rather than architectural: WordPress has a real 15-minute
   lockout at `fabber-hardening.php:400-439`.
3. **The one edge rate limit excludes the enumeration endpoints.** The single rule
   (`identity_edge_controls.py:142-163`, 10 req / 10 s) is scoped to
   `starts_with(http.request.uri.path, "/api/auth/")` (`:153`), so
   `/api/checkout/cpf-check` and `/api/checkout/email-check` are covered by **nothing** —
   and the module itself records that Cloudflare's free tier allows exactly one rule
   (`:46-56`), so this is a budget constraint rather than an oversight. **Check the free
   tier's limit before filing "missing rate limit" as a mistake** — the finding is the
   *scoping choice*, not the count.

The consequence once the IdP is back: unbounded password guessing against any known
identifier, and unbounded 6-digit e-mail-PIN guessing against `otp-verify` — 10⁶ candidates,
with no lockout, no captcha verification and no rate limit on the verification route.

## The abuse axis: IP vs account vs session (VPN rotation defeats IP-only limits)

Automated login/credential-stuffing/scraping is run from **many IPs at once** (VPNs, residential
proxies, datacenter, Tor). So a control that only counts **by IP** is bypassable by rotation and must
be reported as such. The questions to answer, per control:

- **Which axis does the rate-limit use — IP, account, or session?** Test the **same account** from
  several source IPs: if each IP gets its own budget (no per-account limit), the limit is defeated by
  a VPN. A correct system limits **per account** (and/or per session) in addition to the edge's per-IP.
- **CGNAT caveat (Brazil / Global South = the norm):** the server sees the **carrier's shared public
  IP**, not the device — and the `/10` shared range (RFC 6598) is CPE-side, never visible server-side.
  A per-IP penalty box here is both **bypassable** (VPN) and **harmful** (RFC 6269 §13.1: one bad user
  blocks all neighbors). So: detect shared IPs before punishing by IP (traceroute hop in
  `100.64.0.0/10`, PTR/WHOIS `cgnat`/`cgn`/`lsn`, behavioral **diversity** per IP and per `/24`), keep
  the enforcement **per account/session**, treat IP as **one weak risk signal**, log the **source
  port** for traceability, and prefer IPv6/device signals where available. Full detail: playbook §4.5.
- **The correct model limits the PAIR (account × IP × session), not one axis.** Concrete reference: a
  cooldown keyed **per account** survives IP rotation (rotating the IP does **not** reset), and a
  limit keyed **per IP** catches a **different account on the same IP** — so resetting requires changing
  **both**, and session/device fingerprint can still catch it. Check both directions: **N accounts on
  one IP** (account farming / credential stuffing) and **1 account across N IPs** (VPN rotation) should
  each raise/limit. IP-only (falls to VPN) and account-only (falls to farming) are both the finding.
- **Impossible travel / multi-location:** same account authenticating from distinct countries/ASNs in a
  short window → step-up (MFA/captcha), notify, or reauth. Absent = no account-compromise detection.
- **Session/risk binding:** is IP/ASN/country/UA change **mid-session** flagged? Is there a device
  fingerprint / risk score feeding step-up?
- **Automation signals:** `navigator.webdriver`, TLS fingerprint (JA3/JA4), header order, uniform timing,
  sequential resource GETs (scrape pattern), datacenter-ASN reputation.
- **Is each control actually consumed** (like the CPF oracle note below)? A 429 header nobody counts,
  or a "risk score" with no step-up, is theater.

Report a row **per control with its axis** (IP/account/session/device) + evidence + the bypass. Never
exercise this with a third party's account — own account only, even across IPs.

## How to verify
6. **Confirme o provedor na instância, nunca pela doc genérica:** o método de auth do token endpoint
   (Basic × Post), o algoritmo de assinatura do ID token (EC/P-256 × RSA) e a exigência de PKCE. Probe
   um token e leia o `alg` do JWT — verificação hard-falha se você assumir o default. (fonte: fabber/docs/dev/prompts/LESSONS-LEARNED.md:1794-1856)

```bash
# One shared failure constant, or per-case copy?
grep -rn "invalid-credentials\|E-mail ou senha" apps/web/src apps/id/src
# Every sink that consumes a caller-supplied redirect target
grep -rn "redirect(\|Redirect(\|router.push(\|location.href\s*=" apps/web/src apps/id/src | grep -i "next\|redirect\|return"
# Where `next` comes from
grep -rn "next" apps/web/src/lib/themes/auth-actions.ts apps/web/src/lib/themes/login-payload.ts
# Where the raw identifier could reach a log
grep -rn "console\.\(log\|info\)\|logger\." apps/id/src | grep -i "identifier\|email\|cpf"
# The CPF oracle's response shape
sed -n '1,80p' apps/id/src/app/api/checkout/cpf-check/route.ts
# abuse controls as code
grep -rn "rate_limit\|turnstile\|bot_fight\|leaked_credential" infra/pulumi/
# ...and the half that makes them real: is each one *consumed* by the app?
grep -rni "turnstile" apps/id/src            # HIGH-4: zero matches = decorative widget
grep -rniE "ratelimit|rate_limit|lockout|throttle" apps/id/src   # HIGH-4: docstring only
# Which paths the one free-tier edge rule actually covers
sed -n '140,165p' infra/pulumi/modules/identity_edge_controls.py
# Is the CPF oracle reachable from the internet at all?
sed -n '250,260p' infra/docker/Caddyfile      # no path allowlist on the id block
```

Then, live and read-only, against our own hosts, using **identifiers you create
yourself** (never a real customer's, never a value from a leaked list):

1. Request a sign-in / PIN / e-mail-check for an identifier that exists and one that does
   not. Compare **status, body and copy** — and compare the response time over several
   repetitions before claiming a timing difference.
2. Request a password reset for both. The answer must be identical.
3. Call the CPF oracle with a valid-format CPF that is not in the base, and confirm the
   response contains no e-mail, no unmasked value, and no difference that distinguishes
   it from a hit.
4. Take the `next` parameter by hand, on both a GET-rendered and a POST-submitted path,
   with: an absolute URL, `//host`, `/\host`, a percent-encoded form of each, and a
   `javascript:` value. Confirm every one lands on our own domain.
5. Check the session cookie's attributes on a real login response (`HttpOnly`, `Secure`,
   `SameSite`, `Domain`, `Path`) — and confirm the domain scope is what
   `identity-auth/SKILL.md`'s three-tier model says it is.

## What "covered" means (with evidence)

- **A table of existing vs. non-existing identifier responses**, with status, body and
  timing, showing they are indistinguishable — or a finding where they are not.
- **`next` proven constrained at every sink**, with the bypass spellings listed and each
  one's real result. A validator without the `//host` and `/\host` cases tested is not
  tested.
- **The CPF oracle's response proven to contain no unmasked identifier**, by inspecting
  a real response body, not by reading the route's comment.
- **OIDC `state` shown to be single-use** — the mechanism named in code, plus a replayed
  callback observed to be rejected.
- **Abuse controls confirmed reachable-as-declared**: the Pulumi resource exists *and*
  the origin is not directly reachable from the internet. Both halves; the second is the
  one that makes the first real.
- **No unfixed timing claim.** "Looks faster" is not evidence; state the repetitions, the
  spread, and whether the miss path's dummy work exists in code.

## Known false positives

- **Different copy in *different* screens is fine** if a single constant backs them.
  Check for the constant before reporting an enumeration leak.
- **A `400` on a malformed CPF is not an oracle** — it answers a question about the
  *format*, which the caller already knew. The oracle is a *valid-format* value that
  resolves to a real account.
- **Lockout/Turnstile making a probe slow is not a finding** — but a probe that *always*
  succeeds with no throttle, repeated, is the actual finding (absence of control).
- **Timing measurements on a proxied host are noisy.** Cloudflare adds variance; a
  single-shot difference means nothing. Prefer the code-side mechanism (does the miss
  path run the dummy verify?) and treat timing only as a confirmation.
- **A redirect that ends on our own login page is correct behaviour**, even when the
  input looked hostile — what matters is where it lands, not what was submitted.
- **`/conta` reaching a login redirect is not the same finding as `/conta` rendering.**
  The 2026-09-21 MEDIUM-4 was "renders with no server-side authentication check"; a route
  that redirects unauthenticated visitors is fine, and a route that renders a shell whose
  data all arrives from an authenticated API is a different, smaller finding — check
  which one you are looking at before assigning severity.
