# Module — Next.js (App Router) mirrors

> **Related:** `clerk-auth` (the auth-state patch), `node-local-server` (own-port serving),
> `stubs-and-mocks`.

## What it covers

Next.js apps mirrored when there is **no source to rebuild** (so no `basePath`), typically
SSR + client hydration with `/_next/static/**` chunks.

## Why (the incident)

Primu3D (Next.js + Clerk): Next assumes it runs at `/`, so it can't be served under
`/apps/<slug>` without a rebuild. The mirror is served at the **root of its own port**
(:8083), and the hub embeds it via iframe. SSR HTML per route was captured into `_pages/*.html`;
all chunks came from the webpack runtime's chunk map, not from crawling alone
(`apps/primu3d/EXTRACTION.md`).

## How to extract

1. **Capture SSR HTML** for each route (`/`, `/dashboard`, …) → `_pages/<route>.html`.
2. **Mirror `_next/static/**`** — enumerate lazy chunks from the webpack runtime:
   `r.u = e => "static/chunks/" + (({…})[e]||e) + "." + ({…})[e] + ".js"` (`tools/clients/primu-chunkmap.js`).
3. **Strip external scripts** (auth/analytics) from the HTML; inject local stubs instead.
4. **Serve at the root of its own port** (`server/primu3d.js`, :8083); the hub iframes it.
5. **Hydration**: if the auth provider throws, patch the auth-state builder (see `clerk-auth`).

## What "done" means

- Every route renders; `_next` assets load with zero 404; no hydration "Invalid state".
- The hub embeds it (iframe) and it works from the hub nav.

## RSC & Server Actions (App Router — the part that quietly breaks routes)

Proven on PrintGest (`app.printgest.com.br`): serving only the SSR HTML makes **most dashboard
routes show the wrong content** (the landing/another page), because the App Router **navigates
client-side via RSC** — it fetches `GET /<route>?_rsc=<hash>` and swaps the tree.

- **Capture the RSC payload per route** and serve it: `GET /<route>?_rsc=<hash>` with header
  `RSC: 1` (+ the session cookie) → `text/x-component`. Save `_rsc/<rota>.txt`; serve it for any
  request whose query has `_rsc=`. The `_rsc` hash is a **build hash, route-agnostic** — one valid
  hash works for every route.
- **Server Actions**: pages whose data is **computed server-side** (`POST /<route>` with header
  `Next-Action`) render the shell but their data panel errors offline ("unexpected response") unless
  the action responses are captured (keyed by `Next-Action` + route) and replayed. Do **not** blindly
  answer POST-to-page with HTML/RSC — it breaks hydration (it must be the captured action response).
- **Chunk map**: Turbopack lazy chunks aren't all referenced in the HTML — capture the network 404s
  and download them, or you get `ChunkLoadError` + the error boundary.

## BFF apps (no client-side BaaS) — REIMPLEMENT the endpoint, don't stub it

If the browser never calls the BaaS (Supabase server-only, no anon key in the bundle), you can't stub
the BaaS — you must **emulate the Next route handlers / Server Actions** the client calls. Detect it
by watching the network: no `*.supabase.co` requests and a session cookie like
`sb-<ref>-auth-token` (Set-Cookie `@supabase/ssr`) is the tell.

**Prefer a REAL reimplemented endpoint over a dumb stub.** A stub that returns a fixed shape leaves
the offline copy hollow; a **real endpoint with the absorbed logic** makes the offline copy behave
like the original. Method, proven on a Next.js BFF (`/api/pricing/advanced`):
1. **Find the endpoint** in the bundle (`fetch("/api/<x>", {method:"POST"…})`).
2. **Probe it directly** (anon is often enough — see `defensive-posture`: if it answers to anon it's
   also a security finding) and **learn the schema** from its "missing field" errors.
3. **Sample systematically** — vary one input at a time (weight, time, margin, description…) and
   record the outputs; solve the formulas (they're usually linear/simple). Watch for **fixed
   defaults** (the endpoint may ignore client-supplied costs) and **keyword→category** branches
   (e.g. the item's *name* selects a market band/confidence).
4. **Port the formulas** into our server as a real handler (in `server/<slug>.js`), not a fixture.
5. **Validate** against fresh samples (our output vs live) before claiming parity.
This turns "offline copy" into "offline copy that computes". A real endpoint is also the right place
to hold every absorbed surface (pricing, plan resolution, marketplaces, insights), not just one.

**Then EXPAND the endpoint — be better than the original (proven on the 3DPricing insights).** Once
the real logic is absorbed, the endpoint is ours to improve. A decision/insights engine worth porting:
- **Metric-based insights** (not a placeholder): energy>material, time/weight ratio, failure share,
  price/gram, profit **per machine-hour**, market position — plus **data-entry error** checks (failure
  rate left at 0, energy price out of range, unit price out of range, power missing/absurd) and a
  **weight×dimensions density** consistency check.
- **Configurable viability bands** (`minMarginPct`, `minProfitPerHour`, `minTicket`, `gatewayPct`) →
  a **verdict** per condition (`viable` / `marginal` / `not-worth`). *"Is it worth producing at all?"*
- **Scenario comparison** (e.g. factory / popular / luxury positioning) returning all scenarios so the
  UI can compare, with price multipliers + target margins per positioning.
- **Model batch efficiency properly** — the original used coarse buckets (10→0%, 50→−5%, 100→−10%)
  applied to the **whole** unit cost, which overstates savings. Only the **fixed-per-batch** slice
  (setup/warmup/calibration/attention) amortizes; material/energy per unit do not. Use a continuous,
  asymptotic model: `eff(q) = fixedFrac·(1 − 1/q)`. Validate against the original's numbers before
  diverging, and make the config explicit.
- **Explain the *why*** in the insight ("compensa em escala por: setup amortizado, falha diluída,
  taxas fixas diluídas"), not just the number.
- Augmenting the client UI when it's server-rendered: a small **injected script** (toggle + DOM
  annotation with tooltips) adds capability without rebuilding the client bundle.

## Reimplementing Server Actions from SQLite (real screens, our backend) — proven on 2kmaker

When the app is a Next.js App Router where **most data is fetched via Server Actions** (the client calls
`POST /<route>` with header `Next-Action: <id>`), you keep the **real mirrored screens** (100% identical)
and reimplement only the backend so the real UI works — no look-alike SPA (`app-extraction` §golden rule).

Method:
1. **Find the action ids** the client calls. In the page chunk they appear as
   `var=(0,i.$)("<40-hex-id>")` (`i.$` is the minified `createServerReference`). Grep:
   `rg -o '[a-zA-Z_$]+=\(0,[a-zA-Z_$]+\.\$\)\("[0-9a-f]{40}"' page-<hash>.js`.
2. **Map id → operation** by finding how each var is used: grep the success/error toasts near the call
   (`await X(...)` then `toast.success("Marca adicionada!")`). That names the action and its **arg order**
   (e.g. add-brand `c(userId, name, logoUrl)`).
3. **Confirm the read ids** by capturing the live network (`POST /<route>` + `Next-Action`) — the reads
   fire on page load; the writes fire on submit.
4. **Reimplement** in `server/<slug>.js`:
   - reads: `SELECT` from SQLite → return the action's JSON shape inside the RSC envelope
     `0:["$@1",["<buildHash>",null]]\n1:<json>\n` (`text/x-component`);
   - writes: parse the args from the POST body (JSON array; if multipart, parse FormData), mutate SQLite,
     return the envelope with `1:null`. The client **re-calls the read** after a write (`await reload()`),
     so the real list reflects your SQLite change.
   Keep a `capturedAt` fallback: unknown action ids fall back to captured `_actions/<id>.txt`.
5. Serve the **real `_pages/*.html`** with a Supabase auth mock + a shim that redirects
   `*.supabase.co` → `/supa`. Session cookie for `@supabase/ssr` is `sb-<ref>-auth-token` = `base64-` +
   **base64url** (chunk at 3180; the client rejects standard base64 with `+/=`).

Verified: 2kmaker `/filamentos` renders the **original screen** with our SQLite data (Resumo do Estoque,
bobinas, marcas) and "Nova Marca" **persists** (created via the real modal → appears in the list).

## Known pitfalls

- **`basePath`**: sub-path serving needs a rebuild you don't have — use an own port.
- **Chunk map** is the source of lazy chunk names; crawling misses some.
- **Owning the port** keeps `<base>` and absolute `/_next/*` valid.
- **Buffer in a custom `send`**: serving assets with `JSON.stringify(Buffer)` emits
  `{"type":"Buffer","data":[…]}` with a JS content-type → `SyntaxError` in every chunk. Send
  `Buffer` raw.
- **RSC for client nav, HTML for direct load**: both are needed; a route must resolve to the closest
  captured page as fallback (`/dashboard/production/oee` → `dashboard.html`) so unknown sub-routes
  don't fall through to the landing page.
- **`@supabase/ssr` session is a cookie** (`sb-<ref>-auth-token.0/.1`, base64 chunked), not
  localStorage; offline, inject the cookie (re-encoded for the local host) so the client finds it.
