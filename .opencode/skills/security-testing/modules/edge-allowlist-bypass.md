# Module — edge path-allowlist bypass

## What it tests

Whether a **path allowlist** at the edge survives every alternate spelling of the same
resource. The property is not "the blocked path returns 403" — it is "**no reachable
spelling of the blocked resource returns 200**".

Our instance is `INV-SEG-1` (`api.fabber.com.br`): `/graphql`, `/wp-json/**` and
`/xmlrpc.php` are meant to be unreachable, with a small, enumerated set of exemptions.

## Why

**Six live-verified bypasses, found on our own production host on 2026-09-21**
(commit `145e1c7`):

| Request | Result before the fix |
|---|---|
| `/graphql/` (trailing slash) | `200` — served WPGraphQL |
| `GET /wp-json` (bare, no trailing slash) | `200` — 1.3 MB, the complete REST route index |
| `GET /?rest_route=/wc/store/v1/cart` | `200` — the real Store API cart, via the alternate REST entrypoint |
| `POST /xmlrpc.php/` | `200` — full XML-RPC, `system.listMethods` |
| `GET /index.php/wp-json` | `200` — 1.28 MB route index |
| `GET /index.php/graphql` | `301` → `/graphql/` |

Rows 1–3 are the audit's `CRITICAL-1`, `CRITICAL-2` and `CRITICAL-3`, which also record
what each one exposed: `CRITICAL-1` an anonymous GraphQL query returning real data,
`CRITICAL-2` the Store API cart callable from the open internet (a two-invariant breach —
`INV-SEG-1` **and** `INV-SEG-12`), `CRITICAL-3` the full 740-route index including
`wp-graphql-login/v1`, a plugin the docs claimed was removed. Row 6 is the audit's `LOW-2`;
rows 4 and 5 are forms the audit did not report, found by the repo's own fix pass
(`docs/dev/security/external-benchmark-audit-2026-09-21.md`; commit `145e1c7`).
(On the first row, the two sources disagreed on the HTTP method: the Caddyfile's own
comment recorded `POST /graphql/` while the audit recorded a `GET`. Both are true — the
audit's evidence is a `-X POST` GraphQL query returning data **and** a plain `GET`
returning `200`; `infra/docker/Caddyfile:305` now says so, which is the corrected form.
The trailing-slash spelling is what every source agrees is the bypass.)

Root cause, in three parts:

1. **`path /graphql` and `path /wp-json/*` are exact/wildcard matches** — any form
   differing by a trailing slash, an `index.php/` prefix, or living in the query string
   instead of the path never matched.
2. **`php_fastcgi`'s PATH_INFO handling** made `/xmlrpc.php/` reach `xmlrpc.php`, so the
   blocked script answered a real `POST`. WordPress registers `^index.php/wp-json` as a
   real rewrite alias — a second unguarded door onto the same surface.
3. **WordPress has a second REST entrypoint** (`?rest_route=<route>`) that works on any
   path, including `/`.

**And five of the six were invisible to the gate that existed.** The CI job
`invariant / INV-SEG-1` reported a **passing** check on every PR throughout — its four
`BLOCKED_PATHS` rows all already returned `403` (commit `43880fd`). This is the module
where "a written rule is not coverage" (`SKILL.md` §6) has its proof.

**One POST was the difference between finding and missing it:** a `GET` on `/xmlrpc.php`
returns `405` and would have hidden the bypass entirely; only the `POST` showed the
method list (`43880fd`). Probe the method the resource is *for*.

## The measured matcher semantics (Caddy v2.11.4)

Measured on a throwaway instance with probe matchers, not recalled — the fix depends on
these, so they are recorded here rather than re-derived (`145e1c7`, and the comment
block now in `infra/docker/Caddyfile`):

| Behaviour | Measured value |
|---|---|
| What `path` / `path_regexp` match | the **cleaned** path — duplicate slashes collapsed, dot-segments resolved, percent-escapes **decoded** |
| What `{http.request.uri.path}` returns | the **raw** path |
| `path` case sensitivity | **case-insensitive** |
| `path_regexp` case sensitivity | **case-sensitive** (hence the explicit `(?i)` in our matchers, to stay consistent with `path`) |
| WordPress's own routing case sensitivity | **case-sensitive** — `/GRAPHQL` and `/XMLRPC.PHP` both 404 straight from WordPress, measured. So `(?i)` is defence-in-depth, not the load-bearing match |
| `query` matcher: key decoding | **decodes** the query key — `?res%74_route=…` (live-confirmed to reach REST before the fix) is still caught |
| `query` matcher: key matching | requires an **exact** key — `?xrest_route=y` does not match |
| `query` matcher: case | **case-sensitive**, like `$_GET` — `?REST_ROUTE=/x` is answered with the front page by WordPress (measured), so it is correctly left alone |

The design rule this produced, and the one to reuse: **match the mechanism, not an
enumeration of spellings.** One `query rest_route=*` line covers a whole family that
route-by-route patching would have to enumerate forever — the same conclusion the
`/wp-json/**` carve-out reached earlier for a different reason ("route-by-route patching
doesn't scale", `infra/docker/Caddyfile`).

**Fix shape, for reference:** `path_regexp (?i)^/(index\.php/)?graphql/?$`,
**Antes de tocar a regra, enumere as rotas registradas e seu `permission_callback`** — a suspeita inicial
raramente é o conjunto real (de ~70 rotas, só 3 não tinham gate). E a exceção isenta o **caminho exato**:
um curinga da mesma família reabre a leitura pública que o bloco existe para impedir. (fonte: fabber/HANDOFF-HISTORY.md:11003,11018)
`path_regexp (?i)^/xmlrpc\.php(/.*)?$` (the `(/.*)?` tail closes the whole PATH_INFO
family, not just the one slash form observed), `query rest_route=*`, and the positive
matcher widened to cover bare `/wp-json` and the `/index.php/wp-json` prefix.

## How to verify

**Static (offline, runs at PR time)** — this is the primary check, because it asserts
semantics rather than spellings:

```bash
uv run pytest tests/contracts/test_caddy_inv_seg_1_matchers.py -q
```

It extracts each `path_regexp` from the real Caddyfile, evaluates it in Python against
the live-verified forms, and emulates Caddy's `path` matcher (case-insensitive, `*`
matches any run including none) to prove the widened matcher still exempts the Store API
cart, Yoast `get_head`, the health route, the Mercado Pago webhook and `wp-login.php`.

**Live (read-only, our own hosts only):**

```bash
uv run pytest tests/integration/inv_seg_1_test.py -q          # needs FABBER_API_URL
```

Its blocked rows must cover, per blocked path, the families above: trailing slash, bare
path, `/index.php/` prefix, `?rest_route=` on `/` and on a non-root path, and XML-RPC by
`POST` only.

For a manual spot check, one line per family — and remember `-I` (HEAD) can differ from
`GET`, and neither exercises a `POST`-only resource:

```bash
curl -s -o /dev/null -w '%{http_code} %{url_effective}\n' \
  https://api.fabber.com.br/graphql/ \
  https://api.fabber.com.br/graphql \
  https://api.fabber.com.br/wp-json \
  https://api.fabber.com.br/index.php/wp-json \
  'https://api.fabber.com.br/?rest_route=/'
```

**Negative controls — the exemptions that must still work.** A fix that blocks these is
a regression, not an improvement:

| Must answer | Why |
|---|---|
| `GET /wp-json/wc/store/v1/cart` | the BFF's guest-cart call on every checkout render (`apps/web/src/lib/store-api-client.ts`) |
| `POST /wp-json/wc/store/v1/cart/add-item`, checkout | the real purchase path |
| `GET /wp-json/yoast/v1/get_head` | Yoast's headless endpoint, deliberately public |
| `GET /wp-json/fabber/v1/health` | our own health route |
| `GET /wp-json/**` with a `wordpress_logged_in_*` cookie | the authenticated wp-admin carve-out |
| `?wc-api=fb_mercadopago_orders_webhook` and `/wc-api/fb_mercadopago_orders_webhook/` | the payment webhook, both forms |
| `/wp-login.php` | blocked by design at the WordPress layer / behind Access, and used as the negative control for "you are actually reaching Caddy" |

## What "covered" means (with evidence)

- **A per-blocked-path × per-spelling matrix**, each cell a real status code from the
  named target — not a statement that the matcher "should" catch it.
- **The offline contract test passing**, since it is what makes the matrix checkable on
  every future PR instead of once.
- **The negative controls re-verified after the change**, with output. `145e1c7` records
  exactly this list as verified unchanged — that is the standard, and the reason the fix
  did not silently break checkout.
- **`POST` probed wherever a `POST` is the resource's purpose.**
- Exemptions are by **exact path**, not wildcard — each one justified in a comment, with
  no `not path` mirror under the new `/index.php/` prefix (a mirror would reintroduce the
  bypass class under a second spelling; `145e1c7`'s own comment says this explicitly).

## Known false positives

- **A `403` proves the spelling you tested, nothing more.** This was the pre-existing
  test's exact failure mode: four rows, all `403`, all already correct, six bypasses live
  underneath.
- **A `403` on an *exempted* path is the mirror case, and the harder one to attribute.**
  The audit observed `GET /wp-json/wc/store/v1/cart` → `403` live and attributed it to the
  matcher (`Caddyfile`'s `not method POST PUT PATCH DELETE` line) — but the file's own
  matcher does **not** explain it: the `not path /wp-json/wc/store/v1/cart` exemption makes
  the matcher false for that request, so Caddy lets it through. Two causes fit the
  observation and the audit's evidence does not separate them: the running edge config is
  **older than the file on disk** (the same staleness HIGH-1 establishes independently), or
  the `403` is the application's own (WooCommerce's Store API rejects a cart read with no
  `Cart-Token`/`Nonce`). This is the module's own "confirm which layer answered" rule
  catching a real report. The related history is why the row is easy to get backwards:
  2026-09-16/17 saw a genuine `GET /wp-json/wc/store/v1/cart` → **bare Caddy 403** that
  silently showed an empty cart for a nontrivial period, fixed by the exact-path exception
  (`tests/contracts/test_caddy_wpjson_store_api_exceptions.py`'s own docstring; task 100).
  So a `403` on that path may be that old regression, a stale config, or the app — never
  score it from the status code alone.
- **`/wp-json/wc/store/v1/cart` → `200` is correct.** So is `/wp-json/yoast/v1/get_head`.
  `/wp-json/wc/store/v1/products` → `200` would be the real finding (public catalog read
  via REST is precisely what `INV-SEG-1` exists to deny).
- **A `301`/`302` is not a pass.** `/index.php/graphql` answered `301` to `/graphql/` —
  a redirect to a blocked path is still a reachable spelling, and a client that follows
  it reaches the resource. Never score a redirect as "blocked" without following it.
- **Cloudflare Access and Cloudflare itself answer `403`/`302` too.** Confirm the
  response came from Caddy before attributing it to the matcher — a challenge page
  proves nothing about `INV-SEG-1`.
- **`curl -I` vs `curl -X POST`:** HEAD is not GET is not POST. Pick the method the
  resource is designed to answer.
- **A cached response can hide a fix.** If a previously-blocked path still returns the
  old body after a fix, check whether Cloudflare served it from cache before declaring
  the fix ineffective (see `modules/deploy-drift.md`).
