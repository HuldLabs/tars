---
name: nextjs-rendering-architecture
description: >-
  Next.js Server/Client Component boundary, caching model (including the opt-in
  Cache Components feature), streaming/Suspense, and official metadata/JSON-LD
  APIs for Fabber's apps/web. Load this BEFORE deciding where a "use client"
  boundary goes, how a page's data should be cached, or how to emit
  metadata/JSON-LD.
---
# Next.js rendering architecture (companion to frontend-architecture-review)

Live-verified against nextjs.org/docs, 2026-09-12 (doc build 16.3.5, current stable
Next.js **16.3**, released 2026-08-03) — not from a generic LLM summary. This is the
project-specific mechanism layer under
[`frontend-architecture-review`](../frontend-architecture-review/SKILL.md)'s Server/Client
boundary rule.

## Scope note — this skill bundle assumes a public, indexable frontend

Confirmed by contrast against a sibling project (`nexus`, an admin-panel-only Next.js app,
2026-09-12): that project chose Next.js/SSR for **server-driven rendering + cache**, not
SEO — its own planning doc states this explicitly (*"no farmega o motivo extra é SEO-first;
no nosso dashboard interno o ganho é o rendering server-driven + cache, não SEO"*). Fabber's
`apps/web` is the public, SEO-facing storefront — every rule in this skill bundle
(`seo-*`, `frontend-performance`, this skill) applies at full strength here. **If Fabber
ever builds a separate Next.js admin panel** (distinct from today's `wp-admin`), that
codebase would inherit `nextjs-rendering-architecture`'s Server/Client/caching mechanics
but **not** the SEO-driven rules in `seo-url-taxonomy`/`seo-structured-data`/
`seo-html-semantics`'s content-facing sections — Core Web Vitals discipline still matters
for a good admin UX, but LCP/crawlability/schema.org concerns don't apply to a
non-indexable, authenticated surface. This distinction isn't built as a formal rule
anywhere yet (checked — neither Fabber nor Nexus has one) — worth writing explicitly if
that admin panel ever gets scoped.

## Server vs. Client Components — the confirmed official rule

**Server Component is the default.** The official docs are explicit: *"reduce client JS
bundle... add `'use client'` to specific interactive components instead of marking large
parts of your UI as Client Components."* The boundary belongs at the **leaves** of the
component tree, not the top.

- Client Component only when the component genuinely needs: state, event handlers,
  lifecycle effects, browser-only APIs, or a custom hook depending on any of those.
- **MUST NOT** (per `frontend-architecture-review`): mark a whole page/layout Client
  Component to reach one small interactive piece — isolate that piece instead.
Source: https://nextjs.org/docs/app/getting-started/server-and-client-components

## Caching — two models coexist right now, this matters for a real decision

**Correction to a common overstatement** (including in an external LLM-generated
brainstorm reviewed alongside this research): Cache Components is **real** and **is** the
direction Next.js's own docs point new projects toward, but it is **opt-in**
(`cacheComponents: true` in `next.config.ts`), not Next.js 16's automatic default behavior.
A separate "Caching and Revalidating (Previous Model)" guide still exists, actively
documented, for apps that haven't opted in. **Fabber has not made this decision yet** —
treat adopting Cache Components as an architecture decision worth its own ADR (it changes
RSC payload shape, App Shell behavior, ISR semantics, and prerendering behavior app-wide),
not a routine config flag to flip casually.
Source: https://nextjs.org/docs/app/getting-started/caching

### The old model (still valid, still documented)

`fetch()` has cache semantics built in since Next.js 13.0.0, unchanged by Cache Components:
- `cache: 'force-cache' | 'no-store'` — default is **"auto no cache"**, not simply
  `no-store` (a common misstatement — verify this specifically before writing code that
  assumes a default).
- `next: { revalidate: false | 0 | number }` — time-based revalidation.
- `next: { tags: [...] }` — paired with `revalidateTag()` for on-demand invalidation (this
  is the mechanism that plugs into this project's own Valkey→`revalidateTag`→Cloudflare
  purge chain, `CLAUDE.md`'s cache-invalidation diagram).
Source: https://nextjs.org/docs/app/api-reference/functions/fetch

### The Cache Components model (opt-in, not yet adopted here)

`'use cache'` directive marks a function/component/page as cacheable (paired with
`cacheLife` for TTL control), and `<Suspense>` isolates whatever's genuinely dynamic
(cookies, headers, `searchParams`, randomness/timestamps) — the rest becomes a static
shell servable directly from CDN, and only the `<Suspense>`-wrapped content runs per
request. This is officially Partial Prerendering (PPR) — the mechanism behind what an
external brainstorm called "dynamic islands, not dynamic pages" (not Next.js's own
terminology, but an accurate description of the effect).

**Practical implication for a product page**: under this model, name/description/images
could be `'use cache'`-marked (long TTL), while stock/price sit inside a `<Suspense>`
boundary — genuinely per-request-fresh without making the whole page dynamic. This is the
concrete mechanism behind the "don't make the whole page dynamic because one field is
volatile" principle in `frontend-architecture-review`'s anti-pattern catalog — **available
today only if Fabber opts into the flag**, which hasn't happened.

## Streaming and Suspense — a prioritization technique, not a fallback-UI checkbox

`<Suspense>` lets the server send the static/ready parts of a page immediately and stream
in slower parts (e.g. reviews, recommendations) after — the user sees the important content
without waiting on the slow part. Per `frontend-architecture-review`'s evidence-based
discipline: a `<Suspense>` boundary needs a real reason (something genuinely slow/dynamic
being isolated), and its fallback should preserve the final layout's geometry (avoid CLS)
without being an expensive, over-animated skeleton that costs more DOM than the content it
stands in for.

## Metadata and JSON-LD — both are official APIs, not just community convention

- `metadata` (static object export) and `generateMetadata` (function, for
  data-dependent metadata) are the current official APIs for
  title/description/canonical/OG/etc.
  Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- **JSON-LD has an official Next.js guide**, not just a community pattern: render a
  `<script type="application/ld+json">` via `dangerouslySetInnerHTML` inside
  `page.js`/`layout.js`, with an explicit XSS-sanitization requirement — replace `<` with
  `<` in the serialized JSON before injecting it. `schema-dts` (a community package
  for TypeScript typing only) is mentioned as optional — the rendering mechanism itself is
  official, the type-safety package is not.
  Source: https://nextjs.org/docs/app/guides/json-ld

This is the concrete implementation detail behind `seo-structured-data`'s schema-per-page
rules — that skill says *what* JSON-LD each page type needs; this skill says *how* it gets
rendered and sanitized in this specific framework.

## Contract architecture — cross-validated, one nuance to add

Fabber's own `CLAUDE.md` already states the core rule (*"codegen-generated types from the
WPGraphQL schema — never hand-written"*). A sibling project's **accepted** ADR
(`farmega.v2`, `ADR-FV2-008`, Pydantic↔OpenAPI↔TS↔Zod, reviewed 2026-09-12) formalizes the
identical pattern one layer more precisely and is worth citing as cross-validation, not a
new decision:

- The canonical schema (WPGraphQL for Fabber, Pydantic for that project) is the one
  source of truth; generated TS types are a **build artifact**, never hand-edited (a CI
  lint should catch manual edits to a generated file, same spirit as this project's own
  `INV-CON-1`/`INV-CON-2`-equivalent rule).
- **Zod validates only user input at the boundary** (forms, URL/search params, React Hook
  Form) — it never mirrors the whole contract, and is never treated as a second source of
  truth alongside the generated types.
- **New nuance for Fabber, not yet stated anywhere in this project's docs**: the public
  contract (what `apps/web` actually queries/receives) must not leak internal or
  source-prefixed fields that exist only for operational/logistics reasons — the sibling
  ADR's own example is a persistence-layer column with a source prefix (`anvisa_codigo_*`)
  that never reaches the public API contract, mapped explicitly at a serialization layer
  instead of an automatic pass-through. **Direct Fabber application**: the internal SKU's
  logistics-encoded segments (Supplier/Fulfillment mode, per
  `sku-naming-convention.md`) are exactly this kind of internal-only data — confirm the
  WPGraphQL public schema/DTO layer (`INV-SEG-3`) doesn't expose the raw SKU string where a
  customer-facing field is what's actually needed, the same discipline this project's own
  DTO rule already implies but hasn't stated this specifically before.

## Official AI-agent tooling — bundled docs, MCP server, Skills (added 2026-09-13)

Read from `nextjs.org/docs/app/guides/ai-agents` and `github.com/vercel/next.js/tree/canary/skills`
(the successor to the now-archived `vercel-labs/next-skills` repo) — confirms mechanisms
already present in this project, and flags a real gap in how one of them applies here.

- **`AGENTS.md`/`CLAUDE.md` auto-generation is official, not a quirk**: since Next.js 16.3,
  `next dev` upserts a managed block in `AGENTS.md` (and a `CLAUDE.md` that just
  `@`-imports it) pointing at version-matched docs bundled at
  `node_modules/next/dist/docs/` — exactly the file already present at
  `apps/web/AGENTS.md`. Content outside the `<!-- BEGIN/END:nextjs-agent-rules -->`
  markers is preserved across regenerations — that's where any Fabber-specific frontend
  note should go if one is ever added directly to that file instead of this skill bundle.
  **Read the bundled docs before writing framework-version-specific code** — they're
  guaranteed to match the installed Next.js version, unlike training data or this skill's
  own live-verified-on-one-date snapshot.
- **`next-dev-loop` skill + `/_next/mcp` + `agent-browser`** — an edit/verify loop that
  cross-checks a code change against the running dev server's framework state
  (`get_compilation_issues`, route map) and the browser's real DOM/console/React-fiber
  state. **Confirmed gap for this project**: `next-dev-loop` explicitly requires
  Turbopack (*"Verify Next.js 16.3+ with Turbopack (not webpack)"*) — this project runs
  `next dev --turbopack` in BOTH apps (`apps/web`, `apps/account`) — **corrected
  2026-09-23**, after this skill was found asserting the opposite and a coordinator
  acted on it, flipping both apps to `--webpack` and undoing a decision already made.
  The real history: `--webpack` was tried and ABANDONED 2026-09-16 for a worse problem —
  `next dev` never unloads a visited route's modules (2.28GB → 3.65GB after 6 pages,
  Next's own documented by-design behavior), killing the dev stack with
  `ERR_EMPTY_RESPONSE`. Turbopack wins on memory by ~90% (420MB → 1003MB, same test).
  Its in-container watcher IS still broken here (`vercel/next.js#80665`/`#68255`), and
  that is solved by a HOST-side substitute — `infra/scripts/dev-watch-restart-next.ps1`,
  restarting the container per source change (~2-12s warm) — **not** by going back to
  webpack. `next-dev-loop` requires Turbopack, so it is no longer blocked by bundler
  choice; whether the substitute watcher satisfies it is untested.
- **Cache Components adoption mechanics** (from `next-cache-components-adoption`'s own
  skill content, useful reference for *when* Fabber eventually opts in, not a decision to
  do so now): three blocker classes — request-time reads (`cookies()`, `headers()`,
  `params`/`searchParams`, the last one "blocks silently" since it doesn't look like
  request data) need a `<Suspense>` boundary; sync-IO at module/render time
  (`Date.now()`, `Math.random()`, `crypto.randomUUID()`) fails even with opt-outs and
  needs manual fixes, never a codemod; a file with top-level `"use cache"` can't also
  export the `instant` opt-out flag. A shared root-layout sync-IO call or a
  `usePathname()` in a root-layout nav blocks **every** route, not just one — audit
  layouts first, not just pages, before ever flipping the flag.
- **Partial Prefetching** (`next-partial-prefetching-adoption`) explicitly requires
  Cache Components already adopted first — not independently relevant until that
  decision is made.

## Still open for this project

- Whether/when to adopt Cache Components (`cacheComponents: true`) — real architectural
  decision, not yet made, deserves its own ADR given the scope of what it changes. See the
  adoption-mechanics summary above for what that migration would concretely involve.
- Whether to resolve the Turbopack/Docker-WSL2 watcher blocker so `next-dev-loop` (and any
  other Turbopack-dependent official tooling) becomes usable — currently blocked, not
  evaluated recently; re-check the upstream issues before assuming it's still broken.
- This skill reflects Next.js 16.3 as of 2026-09-12 — re-verify against nextjs.org/docs
  before relying on version-specific details in a future session; Next.js's caching model
  has changed significantly release-to-release recently, don't assume stability without
  checking.

## Rebuild-from-zero — the SSD question, applied here

Rendering and cache decisions are configuration, and configuration is what a rebuild
loses first. Ask the mantra in `worker-prompt-template.md` §8: if the SSD burns and the environment is
rebuilt from zero with only the initial secret, does this come back on its own, by
which task/deploy/start? An ISR cache directory, a runtime env var read by a Server
Component, a `next.config` flag toggled only on the running box — each has to be
produced by the build or by the deploy that starts the container. A page that renders
correctly only because the old `.next/` survived is not a verified page.
