# Security testing — Fabber bindings

This project's own values for the base method in `SKILL.md`: what our targets are, what
the invariants are called, where the tests live, and what has already been found. Load
it alongside `SKILL.md` — never instead of it.

## 1. Targets

| Target | Role | Notes |
|---|---|---|
| `fabber.com.br`, `www.fabber.com.br` | production storefront (Next.js) | Cloudflare-proxied → VM `163.176.198.47`; Caddy at the edge |
| `api.fabber.com.br` | production WordPress/WooCommerce | Same VM. Carries `INV-SEG-1`'s allowlist |
| `id.fabber.com.br` | production Fabber Account (Better Auth) | Own container; Cloudflare 525s seen 2026-09-21 at the time of the audit |
| `stg.fabber.com.br`, `stg-api.fabber.com.br` | staging | Same VM; **Cloudflare Access (auth) before Caddy** (includes `wp-admin`) |
| `dev.fabber.com.br`, `dev-api.fabber.com.br`, `dev-id.fabber.com.br` | dev stack (local Docker) | From the internet: **CF Access before Caddy**; from the dev machine (`hosts`→container): **CF Access bypassed**, hits Caddy+containers. The only place an intrusive test may run |

**Edge, in the order it answers:** **Cloudflare (internet edge, incl. `Cloudflare Access`)** → **Caddy**
(our edge: TLS, routing, `INV-SEG-1` allowlist, security headers; see §2) → app. On a public hostname the
CF layer — and its `Access` gate — answers **before** Caddy; on dev **and** stg the `Access` gate requires
authentication before any traffic reaches Caddy. The local `hosts` entry points the dev hostnames at the
containers, **bypassing Cloudflare entirely** — so a probe from the dev machine measures Caddy+app, never
the `Access` gate. **Say which layer answered.** (Method in `SKILL.md` §4.)

DNS/proxy state is documented in `CLAUDE.md`'s Domain/DNS section, and that section's
own lesson applies to this file too: **verify live before trusting a doc about
production state.** All five records are proxied (orange cloud) as of 2026-09-09's
live reconfirmation — that is intentional, and reverting it to DNS-only is not a fix
(`CLAUDE.md`, "⚠️ CORRECTED 2026-09-09").

"Prod on a stale artifact" is a first-class state here, not a footnote: `prod` never
rebuilds, it deploys what `stg` built (`.claude/skills/git-workflow/SKILL.md`).

## 2. Stack, for the parts a test touches

- **Edge:** `caddy-router` (layer4 TCP passthrough) → `caddy-prod` (TLS, routing,
  `INV-SEG-1` allowlist, security headers). Config: `infra/docker/Caddyfile`,
  `Caddyfile.staging`, `Caddyfile.local`. TLS is **DNS-01 via Cloudflare**, which is
  why proxy status doesn't affect cert issuance.
- **Internet edge = Cloudflare (proxied + WAF + Cloudflare Access):** postura **default-deny** — quase
  tudo é protegido por **CF Access** (identidade); só endpoints **pontuais** ficam acessíveis a
  anon/máquina: **webhook do Mercado Livre** (assinatura verificada **no app**, fail-closed),
  **callback do Google OAuth** (`state`/nonce validados), health. **Toda exceção auto-autentica** —
  ela *pula* o gate do CF Access. E o matcher Caddy/CF tem de casar **exatamente** o path servido
  (`modules/edge-allowlist-bypass.md`): allowlist mais estreita que a superfície real = bypass. A
  allowlist é **superfície** (revisar; manter curtíssima). Ver `HARDENING-PLAYBOOK.md` §4.4.
  Além dessas exceções de máquina, a allowlist **anônima** contém **apenas as rotas públicas do
  storefront** de que o cliente precisa para **navegar e comprar** (catálogo/produto, carrinho,
  checkout, conta/login) — **nenhuma** rota admin/interna/operacional é anônima; o resto é CF Access.
  Cada rota pública é, por definição, **anônima**: não pode vazar dado/logica interna (o teste de
  `headers-cookies` + `hardening-baseline` roda nela) e o funil é a **fronteira** que o cliente vê.
- **Origin:** Oracle Always Free VM, single point of failure by accepted decision, with
  inbound 80/443 restricted to Cloudflare's ranges at the Oracle Security List
  (`infra/pulumi/modules/network.py`) — which is what makes `CF-Connecting-IP`
  trustworthy at the Caddy hop.
- **Backend:** headless WordPress + WooCommerce in Docker, MySQL 8 pinned (HPOS),
  Valkey cache. Public surface is a path allowlist (`INV-SEG-1`).
- **Frontend:** Next.js self-hosted (`apps/web`), plus `apps/id` (Better Auth) and a
  Python worker. `apps/web` is server-rendered/ISR; the browser never calls
  `/wp-json/**` (`INV-SEG-12`).
- **Identity:** `apps/id`, Better Auth, `fabber_identity` DB, own container; login must
  never be less available than the store (`.claude/skills/identity-auth/SKILL.md`).
- **Money:** Efí primary + Mercado Pago fallback, chosen as `payment_method` ids passed
  to the Store API; the gateway plugin is WooCommerce's own PHP
  (`docs/dev/store-operations/payment-gateway-study.md`).

## 3. The invariants — and what each one actually is

Full text: `docs/dev/security/security-spec.md`. This is the index, so a test can name
the invariant it defends.

| Invariant | One line | Where it lives |
|---|---|---|
| `INV-SEG-1` | WordPress's public surface is a **path allowlist**, not the whole host | `infra/docker/Caddyfile` (`@blocked_*` matchers) |
| `INV-SEG-2` | `NEXT_PUBLIC_*` only for a value that could be on a billboard | build-time inlining; `security-spec.md` §2.2 |
| `INV-SEG-3` | Nothing crosses server→client without a DTO | RSC payload; `security-spec.md` §2.3 |
| `INV-SEG-4` | Only the DAL reads `process.env` | `apps/web` DAL modules |
| `INV-SEG-5` | Every DAL module starts with `import 'server-only'` | same |
| `INV-SEG-6` | Every Server Action re-checks auth **inside itself** | `apps/web` Server Actions |
| `INV-SEG-7` | `serverActions.allowedOrigins` set for the real domains | Next config |
| `INV-SEG-8` | Price/discount/shipping/total computed server-side from an identifier | checkout path |
| `INV-SEG-9` | No client-held identifier is, by itself, an authorization | the RLS/RPC case study, `security-spec.md` §9 |
| `INV-SEG-10` | A `SECURITY DEFINER`-equivalent checks authorization first | `security-spec.md` §10 |
| `INV-SEG-11` | `/wp-admin`, `/wp-login.php` behind Cloudflare Access | `manual-setup-guide.md` Block 5-B |
| `INV-SEG-12` | The browser never calls the Store API or any `/wp-json/**` route directly | BFF over `localhost` |

`INV-CI-1` (every CI security gate is blocking) and `INV-CI-2` (the production artifact
carries no source, no secret, no map) come from
`docs/dev/security/ci-security-spec.md` and belong to the `ci-gates` module.

## 4. Where our tests live

| Path | Kind | What it proves |
|---|---|---|
| `tests/contracts/` | offline, runs at PR time | Structural/NLP-style assertions — e.g. `test_caddy_inv_seg_1_matchers.py` evaluates the real `path_regexp` values against the live-verified bypass forms, and emulates Caddy's `path` matcher to prove the widened allowlist still exempts the Store API cart, Yoast `get_head`, the health route, the Mercado Pago webhook and `wp-login.php` |
| `tests/integration/` | needs a live target | `inv_seg_1_test.py` (blocked paths, `POST`-only for XML-RPC), `test_migrate_route_blocked.py`, `health_check_test.py` |
| `tests/unit/` | pure | Python module behaviour |
| `apps/web/e2e/` | Playwright, live stack | `checkout/`, `id/`, `wp-admin-*` — the OIDC/session-boundary flows |

The `INV-SEG-1` gate is wired in `.github/workflows/security.yml`, which distinguishes
**skipped** (no target configured) from **passed** — a skipped job is GitHub's honest
"not verified", and the job skips itself via a job-level `if:` on
`vars.FABBER_API_URL` rather than exiting 0. Reaching the step without a target is a
loud `::error::`.

## 5. Findings log

One row per finding **as the audit ranked it** — its ID is the audit's ID, kept stable so
a re-test can cite it. Source of every row: `docs/dev/security/external-benchmark-audit-2026-09-21.md`
(commit `4f3e0eb`), cited by section; the audit's own `file:line` references were
re-verified in the tree on 2026-09-21, and where a row's content predates or exceeds the
audit (the two extra bypass forms, the repo work that produced a fix), the provenance is
named in the row itself rather than implied.

**One caveat on the `infra/docker/Caddyfile` line numbers**: the audit read the file
*before* PR #3's matcher fix, which added ~70 lines of explanatory comments above the
`api.fabber.com.br` block. Its citations of that file (`:301-302`, `:351-359`, `:354`) point
into that earlier state; the current locations are given alongside each below, and the
fixed matchers now live at `:324` (`@blocked_graphql`) and `:420-429` (`@blocked_wpjson`).
Every other file the audit cites was unaffected by that commit.

**Status is per target** (`SKILL.md` §3) — the same finding can be DOWN on dev and LIVE
in production, and below, three of them are.

### CRITICAL

| ID | Date | Finding | Class | Status |
|---|---|---|---|---|
| `CRITICAL-1` | 2026-09-21 | **WPGraphQL publicly queryable at `/graphql/`.** `infra/docker/Caddyfile:301-302` (pre-fix; now `:324`) blocked it with an **exact-path** matcher (`path /graphql`), so the trailing-slash form reached WordPress and answered an anonymous GraphQL query with real data — the audit's own evidence is an `-X POST` GraphQL query returning data **and** a plain `GET` returning `200`, which is the corrected form now in the file's comment. `INV-SEG-1`'s own text names this risk ("schema introspection and arbitrary queries by anyone"); `security-spec.md` §9 states the structural reason it is worse here than on Postgres — *"WPGraphQL has no RLS equivalent"* (audit §CRITICAL-1) | DOWN on dev / **LIVE in prod** | Fixed on `main` (PR #3, matcher → `path_regexp`); **still LIVE in production until promotion**. Regression gate: `tests/contracts/test_caddy_inv_seg_1_matchers.py`, `tests/integration/inv_seg_1_test.py` |
| `CRITICAL-2` | 2026-09-21 | **WordPress REST + WooCommerce Store API reachable via `?rest_route=`.** The blocker never inspected the query string, so any of the 740 advertised routes was reachable regardless of path — live: `/?rest_route=/wp/v2/posts` → 200 and `/?rest_route=/wc/store/v1/cart` → 200. A two-invariant breach: `INV-SEG-1` (allowlist) *and* `INV-SEG-12` (the money-handling Store API becoming callable from the open internet, bypassing the BFF and the guest-checkout gate). Also notes the cart exemption (`:355` pre-fix, now `:425`) is **dead code as written** — `not method POST PUT PATCH DELETE` (now `:426`) excludes the GET it was written for, so the exempted path returns `403`, not `200`. **That inference does not hold and the module corrects it**: the `not path` exemption makes the matcher false for that request, so Caddy lets the GET through; the observed `403` comes from somewhere else, and `modules/edge-allowlist-bypass.md`'s false positives record the two candidates (a running config older than the file, or the Store API's own rejection of a tokenless cart read). The observation is real; the stated cause is not (audit §CRITICAL-2) | DOWN on dev / **LIVE in prod** | Fixed on `main` (PR #3, `@blocked_rest_route query rest_route=*`); **still LIVE in production until promotion** |
| `CRITICAL-3` | 2026-09-21 | **Bare `/wp-json` discloses the full API surface** — `path /wp-json/*` does not match the bare path, so `/wp-json` returned **200, 1,301,935 bytes**: every namespace and route, including `wp-graphql-login/v1` (a plugin `CLAUDE.md` claims was removed via IaC) and `wc/private`. Free, complete attack-surface enumeration; combined with CRITICAL-2 every listed route was then callable (audit §CRITICAL-3) | DOWN on dev / **LIVE in prod** | Fixed on `main` (PR #3, positive matcher widened to cover bare `/wp-json` and the `/index.php/wp-json` prefix); **still LIVE in production until promotion** |
| `CRITICAL-4` | 2026-09-21 | **The `INV-SEG-1` gate was a no-op, and is why CRITICAL-1/2/3 survived to production.** Two compounding defects: (A) `.github/workflows/security.yml:334-336` exited **0** when `FABBER_API_URL` was unset, so the job reported a passing check without running `pytest`; (B) even when it ran, `tests/integration/inv_seg_1_test.py:67-72` asserted 403 only for the spellings the matchers already covered, never `/graphql/`, bare `/wp-json`, or `?rest_route=` (audit §CRITICAL-4) | DOWN *(commit `43880fd`)* | Job now **skips itself** when unarmed (job-level `if:` on `vars.FABBER_API_URL`, `.github/workflows/security.yml:343-346`) and reaching the step without a target is a loud `::error::` (`:374`, `:378`); blocking once armed (`INV-CI-1`). The test file gained the variant matrix. Contrast: `tests/contracts/test_caddy_wpjson_store_api_exceptions.py` was a real running gate the whole time — its `REQUIRED_GET_EXCEPTIONS` and `MUST_STAY_BLOCKED` assertions parse all three Caddyfiles and check which routes are *exempted*, a different property from the one that was broken |
| `INV-SEG-1` bypass family — remediation & regression gate | 2026-09-21 | The repo's own fix pass found **two forms the audit did not report**, on top of CRITICAL-1/2/3: `POST /xmlrpc.php/` (PATH_INFO made the blocked script answer a real POST — full XML-RPC method list) and `GET /index.php/wp-json` (1.28 MB route index, via WordPress's own `^index.php/wp-json` rewrite alias). A `GET` on `/xmlrpc.php` returns 405 and would have hidden this entirely *(commit `145e1c7`; `LOW-2` covers the `/index.php/graphql` form)* | DOWN on dev / **LIVE in prod** | Matcher fix on `main` (`path_regexp` + `query` matcher, measured against Caddy v2.11.4 rather than recalled); promotion to prod is operator-gated. Gate: `tests/integration/inv_seg_1_test.py` (9 blocked rows + `POST`-only XML-RPC), `tests/contracts/test_caddy_inv_seg_1_matchers.py` (mutation-tested — restoring `path /graphql` makes it red) |

### HIGH

| ID | Date | Finding | Class | Status |
|---|---|---|---|---|
| `HIGH-1` | 2026-09-21 | **Production was running a ~10-day-stale artifact**, so every security change merged since ~2026-09-11 was absent from what served traffic — including the CSP (`apps/web/next.config.ts:149-161` emits `Content-Security-Policy-Report-Only` unconditionally; production emitted none) and the automated `wp-graphql-headless-login` removal (`infra/pyinfra/deploy_wp_bootstrap.py:395-405`, added 2026-09-14 — later than the running artifact). Three independent evidence lines: the WP container's own public build metadata (`image_build_time: 2026-09-10T22:14:30-03:00`), a clean date boundary in live Next.js routes (2026-09-05/06 → 200; 2026-09-14+ → 404), and `apps/web/.next/app-path-routes-manifest.json`. The audit states the caveat honestly: read-only could not read the running image's build SHA, and Caddy `header{}` only *adds* (audit §HIGH-1) | **LIVE** | **Open** — this is the finding that makes every other `LATENT` classification in this log true. Owned by the promotion flow, not by a code fix (`modules/deploy-drift.md`) |
| `HIGH-2` | 2026-09-21 | **The unauthenticated `/status` surface leaks CI/CD internals, and its server side holds a repo-write token.** All six `status/api/*` handlers return no auth reference; live, `/status/api/github-actions` returned **private**-repo CI metadata (workflow name, `headBranch`, `headSha`, run URL). The amplification: `apps/web/src/features/status/data/get-build-info.ts:404,476,598` reads `GITHUB_ACTIONS_READONLY_TOKEN`, which `config/secrets.toml` registers as a **full-scope classic PAT** (repo write, `delete_repo`, `admin:org`). Only a boolean crosses to the client (`:393-400`), so the token is not exposed — but the handler will spend it for any anonymous caller, including burning the 5,000/hour rate budget. `frontend-security-headers/SKILL.md:82-90` already calls the follow-up *"due, not 'someday'"* (audit §HIGH-2) | **LIVE** | **Open** |
| `HIGH-3` | 2026-09-21 | **A public health endpoint discloses the exact deployed commit.** `Caddyfile:354` (pre-fix; now `:424`) deliberately exempts `/wp-json/fabber/v1/health` from the allowlist, and its payload carries build provenance: `git_sha`, `image_build_time`, `image_digest`, `workflow_run_url` — against a **public** repository, so an attacker resolves the exact commit, diffs it against current `main`, and reads the changelog of every fix landed since. On staging the same path is additionally a Cloudflare Access `bypass` / `everyone: True` policy (`infra/pulumi/modules/cloudflare_access_apps.py:237-256`). The exemption was audited and deliberate; the finding is that the payload carries provenance it does not need to be public (audit §HIGH-3) | **LIVE** | **Open** |
| `HIGH-4` | 2026-09-21 | **No bot/brute-force control on the login surface actually verifies anything.** Three stacked gaps: (1) Turnstile exists as a Cloudflare widget with **no server-side verification** — `grep -rni turnstile apps/id/src` → zero matches, so a script posts straight to the API; (2) **no** application-level rate limit or lockout in `apps/id` — no `rateLimit` option reaches `betterAuth({...})` (`apps/id/src/lib/auth.ts:111-715`), while WordPress has a working 15-minute lockout at `fabber-hardening.php:400-439`, proving the omission is specific; (3) the one edge rate-limit rule scopes to `/api/auth/` only (`identity_edge_controls.py:142-163`), leaving `/api/checkout/cpf-check` and `/api/checkout/email-check` covered by nothing — and the module documents that Cloudflare's free tier allows exactly one rule, so it is a budget constraint, not an oversight (audit §HIGH-4) | **DOWN** *(IdP 525)* — un-gates the moment the IdP is restored | **Open.** Once up: unbounded password guessing, and unbounded 6-digit e-mail-PIN guessing against `otp-verify` (10⁶ candidates). Keep the good half: the failure paths are well built — `resolve-sign-in`, `forgot-password/request`, `otp-request` and `magic-link-request` return one unconditional response with the miss folded into a dummy sentinel (`apps/id/src/lib/resolve-login-email.ts:21-30`), and `mask-email.ts:16-22` always emits exactly three stars |
| `HIGH-5` | 2026-09-21 | **A publicly reachable CPF-existence oracle, contrary to the identity rule.** `apps/id/src/app/api/checkout/cpf-check/route.ts:52-72` answers `{found:false}` or `{found:true, maskedEmail}`; the `id.fabber.com.br` Caddy block has **no path allowlist** (only `@migrate path /api/auth/migrate` → 404, `Caddyfile:254-255`, before `reverse_proxy id-prod:3100` at `:257`), so the route is internet-reachable despite its own docstring (`:22-23`) claiming *"Internal-only by architecture … never called from the browser directly"* — the internal hostname constrains the *caller*, not the route. CPF check digits are computable by definition, so the space is enumerable: one unauthenticated request answers whether a given person has an account, plus a masked e-mail. `identity-auth/SKILL.md:70-71` states the rule it breaks: *"Guest with an existing CPF → **never reveal**"* (audit §HIGH-5) | **DOWN** *(IdP 525)* — not exploitable this minute; live the moment the IdP is restored | **Open.** The e-mail half is **accepted by design**, not a bug (`email-check/route.ts:10-16`; `identity-auth/SKILL.md:68-69`) — the missing *rate limit* is the finding, and it is covered by `HIGH-4` |
| `HIGH-6` | 2026-09-21 | **Mercado Pago webhook: chargebacks bypass the signature check, and the check fails open.** The HMAC itself is **correct** — HMAC-SHA256 over `id:{id};request-id:{rid};ts:{ts};`, compared with `hash_equals` (timing-safe), called at `:65-70` with `status_header(401)` on failure. Two defects *around* it: **(A)** `:217-227` returns `true` when `webhook_secret` is unset — fail-open, logging only a warning; **(B)** `:41-50` handles the chargeback topic **before** the signature check and returns at `:44-47`, so chargeback notifications never pass through `verifySignature()`. The endpoint is reachable by design (`cloudflare_access_apps.py:287-307` creates `bypass`/`everyone: True` for the webhook path). Efí: **no webhook handler exists** in this repo — `deploy_wp_payment_gateways.py:166-167` registers its gateways as installed-but-disabled; nothing to report beyond confirming absence (audit §HIGH-6) | **LIVE** — the route is public by design, so the signature *is* the trust boundary | **Fix in PR #6 (open, not merged)**: reject on missing secret, verify before all topic dispatch, replay protection on `ts`. Until merged, an attacker who learns the public path can POST a forged chargeback for any order id |
| `HIGH-7` | 2026-09-21 | **Open redirect via unvalidated `next`, in both apps (5 sinks).** The GET path validates; the POST path does not — `apps/web`: validating twin `login-payload.ts:46` (`params.next.startsWith("/")`) vs. sink `auth-actions.ts:47` (raw `FormData`) → `redirect(next)` at `:189`, `:229`; `apps/id`: validating twin `app/api/login/route.ts:69` vs. sink `app/login/login-action.ts:123` → `redirect(next)` at `:257`, `:313`, `:390`. `startsWith("/")` does **not** reject a protocol-relative URL — `//evil.example` passes it — so a crafted link carries `next=//evil.example` through the rendered form field (`login-organism.tsx:295`) to the unvalidated POST side, sending the user off-site **after** a successful authentication. On `apps/id` it is worse: that is the IdP every relying party depends on (audit §HIGH-7) | **LATENT** — `/login` returns 404 in production today (`HIGH-1`) and the IdP is down; real the moment either is restored | **Fix in flight** on branch `fix/open-redirect-next-param` (**not merged**): one shared validator per app accepting only same-origin relative paths, rejecting absolute, protocol-relative, backslash and percent-encoded forms, falling back to the safe default |

### MEDIUM

| ID | Date | Finding | Class | Status |
|---|---|---|---|---|
| `MEDIUM-1` | 2026-09-21 | **`INV-SEG-7` (`serverActions.allowedOrigins`) is not implemented.** `apps/web/next.config.ts:70-244` has **no `serverActions` key at all**, and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` appears only in `security-spec.md:181` — no config, compose or env template sets it. `security-spec.md` §4.1 flags it as *required* in this exact topology (Cloudflare + Caddy in front); §4.2 says set the key now. Consequence: Server Actions can fail in production for the documented proxy/Origin-mismatch reason, and the likely repair is to loosen the check by trial and error. Also absent: `experimental.taint` (§3.2) (audit §MEDIUM-1) | **LATENT** | **Open** |
| `MEDIUM-2` | 2026-09-21 | **`INV-SEG-2` has no gate, and `config/secrets.toml` is unscanned by the secret scanner.** `NEXT_PUBLIC_*` itself is clean (exactly one name, `NEXT_PUBLIC_SITE_URL`, all call sites falling back to a literal URL), but the gate `security-spec.md:244` promises does not exist. Separately `.gitleaks.toml:19-27` excludes `config/secrets.toml` **by whole path** in both hooks and CI — the one file every rotation edits is never scanned, justified by a convention (`op://` paths only) that nothing enforces. The rest of the posture is strong and verified: gitleaks 8.30.1 in pre-commit, pre-push and CI, failing loud rather than skipping, with a full-history scan of **1,251 commits (14.54 MB)** finding no leaks (audit §MEDIUM-2) | **LATENT** | **Open** |
| `MEDIUM-3` | 2026-09-21 | **The registered full-scope PAT debt is worse than its entry describes.** Two `[secrets.*]` names point at the same `op://` path with opposite-sounding labels; the name `GITHUB_ACTIONS_READONLY_TOKEN` resolves to the **full-scope** token; the entry's `notes` still claims "scope `repo` only" while its own comment says "repo write, `delete_repo` and `admin:org`" (the entry contradicts itself); and a third consumer sits outside the file (`infra/compose/ci-runner.env.tpl:11-23` reuses it as `CI_RUNNER_GITHUB_PAT`, warning at `:25-28` that it is reachable from a root-on-host container). Operator-approved, registered debt with a **verified** replacement path, reachable only from server-side code that never returns it to a client — the finding is that the register is inaccurate and the token now also backs a **publicly reachable** endpoint (`HIGH-2`) (audit §MEDIUM-3) | **LATENT** | **Open** — deferred to post-v1.0.0 by the operator; correctness of the register itself is the actionable half |
| `MEDIUM-4` | 2026-09-21 | **`/conta` renders with no authentication check.** `apps/web/src/app/(checkout)/conta/[[...segments]]/page.tsx:11-18` calls `getActiveTheme()` + `getAccountPayload()` and renders — no `getCurrentUser()`, no redirect, no gate, on a catch-all matching `/conta` and every sub-path; the file's own comment (`:9-10`) admits it (*"A real implementation re-checks auth INSIDE this route (INV-SEG-6) — not built here"*). Impact currently bounded because the payload is a hardcoded fixture (`mock-bff.ts:648-657`). **A latent CRITICAL**: the moment `getAccountPayload()` reads real order history, the route serves it to anonymous callers (audit §MEDIUM-4) | **LATENT**, bounded by the fixture | **Fix in flight** on branch `fix/conta-auth-and-column-guard` (**not merged**): verify the session server-side and redirect using a **literal** `/conta` as `next`, never a request-derived value. That branch also carries SQLi hardening 1 below |
| `MEDIUM-5` | 2026-09-21 | **`payment_method` and `quantity` reach WooCommerce unvalidated.** `apps/web/src/lib/store-actions.ts:125` takes `payment_method` from `FormData` with no whitelist and forwards it at `:158` → `store-api-client.ts:258`, so a client can name any gateway id and select the payment path; `:39` `addToCart(slug, quantity)` accepts an unbounded `quantity`. WooCommerce recomputes line totals from the product record, so this is **not** a price-integrity break — it is unvalidated input reaching a security-relevant selector and a transactional API (audit §MEDIUM-5) | **LATENT** | **Open** |
| `MEDIUM-6` | 2026-09-21 | **Session cookie hardening relies on library defaults, and the app silently re-sets the cookie.** `apps/id/src/lib/auth.ts:140-145` configures only `crossSubDomainCookies` (`domain: ".fabber.com.br"`); `useSecureCookies`, `advanced.cookies` and a `session:` block are all **absent**, so expiry/rotation/`Secure`/`SameSite` come from Better Auth defaults — unverifiable here because `node_modules` is not installed. Where attributes *are* explicit they are correct (`login-action.ts:50-57`, `cart-session.ts:40-42`, `session-cookie.ts:20-22`), but that manual re-set hardcodes `maxAge` to 7 days and discards every other attribute the library emitted (audit §MEDIUM-6) | **LATENT** | **Open** |
| `MEDIUM-7` | 2026-09-21 | **`INV-SEG-3` violated: three status DALs pass raw upstream JSON into Client Components.** `features/status/data/get-build-info.ts:77`, `:134`, `:161` `as`-cast the upstream body instead of mapping fields, and those objects go whole to Client Components at `app/status/page.tsx:426,428,436` (`WordPressCard`, `CaddyCard`, `CleanupCard`) — everything upstream returned is serialized into the RSC payload and visible in page source. The contrast is in the same file: the GitHub Actions path **is** properly mapped (`:443-461`), and the product tree keeps the boundary correctly (`toProductPayload`/`toProductImages`) (audit §MEDIUM-7) | **LATENT** | **Open** |
| `MEDIUM-8` | 2026-09-21 | **Origin lock covers IPv4 only, and the WordPress host has no rate limit at all.** `infra/pulumi/modules/network.py:42-91` emits one OCI ingress rule per Cloudflare CIDR for 80/443, with ranges fetched live from `cloudflare.com/ips-v4` and raising rather than falling back to a stale list — real code, not prose. The module's own docstring (`:57-78`) records the deliberate gap: **IPv6 is excluded**, so an attacker reaching the VM over IPv6 directly bypasses Bot Fight Mode, Turnstile, Leaked Credentials and the rate limit in one step. The host firewall is *not* the lock (`deploy_os_base.py:87-92` allows 80/443 from anywhere). Separately, the storefront and WP host are covered by **no** rate limit of any kind (audit §MEDIUM-8) | **LATENT** | **Open** |
| `MEDIUM-9` | 2026-09-21 | **Staging Cloudflare Access `bypass` policies expose `wp-admin` paths.** `cloudflare_access_apps.py:341-363` creates `bypass`/`everyone: True` for `stg.fabber.com.br/wp-admin*` and `wp-login.php`, and `:392-427` for `wp-admin/css\|js\|images/*`, `load-styles.php`, `load-scripts.php`. Live: `/wp-admin/` → **308** while `/` → **302** (Access intercept) on the same host — i.e. the admin path is not Access-gated. Impact limited because native `wp-login.php` returns **404** on staging (the break-glass-only decision holds), but the bypass is broader than the static-asset intent and staging holds real anonymised data (audit §MEDIUM-9) | **LATENT** | **Open** |
| `MEDIUM-10` | 2026-09-21 | **`dangerouslyAllowLocalIP: isDev` disables next/image's SSRF guard in dev** (`apps/web/next.config.ts:103`, self-flagged at `:94-102`). The config comment's premise is **stale**: `infra/pulumi/modules/cloudflare_tunnel.py:235-270` now creates a `Fabber Dev tunnel` Access app (`allow`, 5 e-mails) covering `dev.fabber.com.br` and `dev-api.fabber.com.br`, so "dev is publicly reachable with no Cloudflare Access" no longer holds — which materially reduces the risk. The correct fix is to **correct the comment**, not necessarily the flag (audit §MEDIUM-10) | **LATENT** — premise reduced by a later change | **Open** (comment correction owed) |
| `MEDIUM-11` | 2026-09-21 | **2FA is optional and does not gate two sign-in methods.** `twoFactor()` is mounted (`auth.ts:711`) but the TOTP matcher covers only `/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number` — **passkey and `emailOTP` sign-in are not gated** (documented in-code at `:688-702` as a known library gap), and `identity-auth` does not require MFA for admin. Also `otp-verify/route.ts:59-64` and `resolve-sign-in/route.ts:108-113` return the **raw Better Auth response** with no DTO (`INV-SEG-3` tension) — whether the library's payload includes the whole `user` object is **unverified**, because that claim needs `node_modules` (audit §MEDIUM-11) | **LATENT** | **Open** |
| `MEDIUM-12` | 2026-09-21 | **A 1-year `s-maxage` on the storefront root.** `https://fabber.com.br/` returns `Cache-Control: s-maxage=31536000` with `x-nextjs-cache: HIT`, while Cloudflare reports `cf-cache-status: DYNAMIC` (not caching it today). `CLAUDE.md` names cache as risk #1 of this architecture, from a real incident at `consultaremedios.com.br` where updates got stuck in cache. Inert while Cloudflare does not cache HTML; a stale-content hazard of exactly the documented kind the day it does. The authenticated-route discipline is correct (`/api/me`, `/api/login-screen` → `private, no-cache, no-store, max-age=0, must-revalidate`). RSC cache (`?_rsc`) was **not tested** (audit §MEDIUM-12) | **LATENT** | **Open** |
| `MEDIUM-13` | 2026-09-21 | **The API host serves a full WordPress front-end, advertising its plugin set.** `https://api.fabber.com.br/` returns 200 with classic WordPress HTML (theme `fabber-headless`) advertising `melhor-envio-cotacao`, `woo-product-bundle`, `woocommerce` and `wp-includes/*`, plus a `link: …/wp-json/ … rel="https://api.w.org/"` header — advertising the very REST base the allowlist exists to withhold. `INV-SEG-1`'s design is that only webhook routes are reachable on that host; serving the front-end is broader than that. Low-severity recon aid, but the same information class (audit §MEDIUM-13) | **LATENT** | **Open** |

### LOW

| ID | Date | Finding | Class | Status |
|---|---|---|---|---|
| `LOW-1` | 2026-09-21 | **`/status/api/deploy-parity` compares branches belonging to the old GitHub owner** — the live response references `github.com/fabber2/fabber-ecommerce` (PRs #89, #87) while the migration moved the repo to `blopaaugusto`. A correctness bug in operator-facing tooling, not an exposure (audit §LOW-1) | **LATENT** | **Open** |
| `LOW-2` | 2026-09-21 | **The `/graphql` exact match also leaked via other path forms** — `/index.php/graphql` → **301**, which `path /graphql` matches neither, nor `/graphql/*`. Recorded for completeness; the trailing-slash case (`CRITICAL-1`) is the exploitable one (audit §LOW-2) | DOWN on dev / **LIVE in prod** until promotion | Covered by the same PR #3 matcher fix. **A `301` is not a pass** — a client that follows it reaches the resource (`modules/edge-allowlist-bypass.md`, false positives) |
| `LOW-3` | 2026-09-21 | **No production source-maps check was performed.** `security-spec.md:230` asserts no production source maps are published; left **unverified rather than assumed** (audit §LOW-3) | Untested | **Open** — an untested claim, not a clean result. The check is specified in `modules/secrets.md` |

### Pre-existing rows (not from the audit's ranked list)

| ID | Date | Finding | Class | Status |
|---|---|---|---|---|
| SQLi pass — clean | 2026-09-21 | White-box pass over every place the repo builds SQL (audit's **Addendum**): **no exploitable SQL injection on any request-reachable path.** All 5 `$wpdb` query sites go through `prepare` (`esc_like` for `LIKE`), the only unprepared call is a literal `SELECT 1` in `fabber-health-check.php:65`; every state-changing WP form handler checks a nonce plus a capability; `apps/id` binds values with `?`; the Python f-strings interpolate only config-derived prefixes/DB names and are not request-reachable, with the one id list int-cast (`anonymize.py:136`) | DOWN (clean) | Keep the pass reproducible — `modules/injection.md`. The enumeration is the evidence: no enumeration, no "clean" |
| SQLi hardening 1 | 2026-09-21 | `resolveCanonicalEmail` interpolates `${column}` into the query *identifier* position; safe today only because its TypeScript union type **does not exist at runtime** (`apps/id/src/lib/resolve-canonical-email.ts:39`, values from `identifier.ts:73,77,80`) (audit Addendum, hardening 1) | **LATENT** — un-gates the day a caller passes a request-derived string | **Fix in flight** on branch `fix/conta-auth-and-column-guard` (**not merged**): runtime allowlist throwing outside `username\|cpf\|email`, plus a unit test |
| SQLi hardening 2 | 2026-09-21 | `core/data/mysql.py`'s `dump_table_unaltered(where=...)` takes a raw `WHERE` fragment, and `sql_escape` is hand-rolled (backslash escaping, correct only while the restoring server's `sql_mode` lacks `NO_BACKSLASH_ESCAPES`) — offline backup/anonymization tooling, not request-reachable (audit Addendum, hardening 2) | **LATENT** | **Open** — document the contract or move to bound parameters when a new caller appears |
| `/api/auth/migrate` publicly reachable | 2026-09-18 | An unauthenticated POST endpoint running `execSync("npx @better-auth/cli migrate -y")` — trivial DoS against the IdP. Found by adversarial review while investigating a *different* bug (`CLAUDE.md`, "Never bypass automation manually"). Not one of the audit's findings; kept because it is this project's canonical evidence that a *recorded* rule (`INV-IAC-2`) is not a control | DOWN | Route deleted; edge block retained as defense-in-depth (`@migrate path /api/auth/migrate` → 404 in `infra/docker/Caddyfile`); `tests/contracts/test_no_migrate_route.py` + `tests/integration/test_migrate_route_blocked.py` |
| `id.fabber.com.br` HTTP 525 | 2026-09-21 | `id.fabber.com.br` and `stg-id` answered Cloudflare 525 (origin TLS handshake) while `fabber.com.br` answered 200 — the IdP down in both production and staging, contradicting `identity-auth` rule #2 ("login must never be less available than the store"), and blocking live exercise of every auth-side control in the audit (audit, Executive summary) | **DOWN** at audit time | **Diagnosed in PR #5** (open, not merged) |
| SQLi pass — clean | 2026-09-21 | White-box pass over every place the repo builds SQL: **no exploitable SQL injection on any request-reachable path.** All 5 `$wpdb` sites go through `prepare` (`esc_like` for `LIKE`), the only unprepared call is a literal `SELECT 1`; every state-changing WP form handler checks a nonce plus a capability; `apps/id` binds values with `?`; the Python f-string SQL interpolates only config-derived prefixes/DB names and is not request-reachable (`docs/dev/security/external-benchmark-audit-2026-09-21.md`) | DOWN (clean) | Keep the pass reproducible — see `modules/injection.md` |
| SQLi hardening 1 | 2026-09-21 | `resolveCanonicalEmail` interpolates `${column}` for the *identifier* column; safe today only because a TypeScript union type does not exist at runtime (`apps/id/src/lib/resolve-canonical-email.ts:39`, values from `identifier.ts:73,77,80`) | **LATENT** — un-gates the day a caller passes a request-derived string | Fix in flight: runtime allowlist throwing outside `username\|cpf\|email`, plus a unit test |
| SQLi hardening 2 | 2026-09-21 | `core/data/mysql.py`'s `dump_table_unaltered(where=...)` takes a raw `WHERE` fragment, and `sql_escape` is hand-rolled (backslash escaping, correct only while the restoring server's `sql_mode` lacks `NO_BACKSLASH_ESCAPES`) — offline backup/anonymization tooling, not request-reachable | **LATENT** | Document the contract or move to bound parameters when a new caller appears |
| `/api/auth/migrate` publicly reachable | 2026-09-18 | An unauthenticated POST endpoint running `execSync("npx @better-auth/cli migrate -y")` — trivial DoS against the IdP. Found by adversarial review while investigating a *different* bug (`CLAUDE.md`, "Never bypass automation manually") | DOWN | Route deleted; edge block retained as defense-in-depth (`@migrate path /api/auth/migrate` → 404 in `infra/docker/Caddyfile`); `tests/contracts/test_no_migrate_route.py` + `tests/integration/test_migrate_route_blocked.py` |
| `id.fabber.com.br` HTTP 525 | 2026-09-21 | `id.fabber.com.br` and `stg-id` answered Cloudflare 525 (origin TLS handshake) while `fabber.com.br` answered 200 | Observed at audit time; diagnosis-only task dispatched | Diagnosis in flight (read-only); fix to be expressed as IaC/CaC, not applied |

### Findings log — rules

- One row per finding, with the **ID the report used** (keep it stable so a re-test can
  cite it). One row per ranked finding, not one row per fix — a single commit that
  closes three findings gets three rows, each carrying its own evidence.
- "Class" is per target and must name them when they disagree.
- A status of "fixed" needs the artifact it was verified against, not the branch.
- **Every row cites its source section** (`audit §CRITICAL-2`) or names its own
  provenance when the content is not from that report. A row whose only provenance is
  someone's summary is marked as such — never dressed up as first-hand verification.
- When a finding is re-tested, **append the new evidence to the row** rather than
  replacing the old — the history of what was true when is the point.
- Clean results get rows too (`SQLi pass — clean`), otherwise "not tested" and "tested
  clean" become indistinguishable at the next audit. An untested claim (`LOW-3`) is
  labelled as untested, which is a third state, not a clean one.
- **This table is the per-finding status register** the 2026-09-21 audit named as
  missing ("a per-client fragility register with a status column — ⛔ open / ⏳ confirm
  / ✅ verified"; "what the benchmark has that we lack", item 4). The status column is
  what makes a re-test meaningful: it is the only place a closed finding can be flipped
  back open with evidence.

## 6. Project-specific false positives to expect

- **`X-Powered-By`-style fingerprinting** — not in play the way a generic scanner
  assumes; `api.fabber.com.br` is behind Caddy and the storefront behind Next.js with
  its own header set. Check the actual response, not the framework default.
- **Anything `403` from Caddy reads as "blocked"** — but that is exactly what made the
  pre-existing `INV-SEG-1` test rows useless. A `403` proves the *matcher you tested*
  matched; it says nothing about the spellings you did not test.
- **`/wp-json/wc/store/v1/cart` returning 200 is correct**, not a regression: it is the
  BFF's own guest-cart call, exempted by exact path. `/wp-json/wc/store/v1/products`
  returning 200 would be the real finding.
- **Nested WordPress entrypoints that answer 200 on a blocked path are worth more
  attention than they look** — the `/index.php/` prefix and `?rest_route=` forms were
  both live, and both looked like normal WordPress behaviour from the outside.
