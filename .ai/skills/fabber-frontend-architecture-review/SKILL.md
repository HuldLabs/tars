---
name: frontend-architecture-review
description: Operational review layer for Fabber's frontend — MUST/SHOULD/MUST-NOT invariants, an anti-pattern catalog, evidence-based-optimization discipline, and a Definition of Done checklist. Load this BEFORE marking any frontend page/component task complete, and BEFORE adding any performance "optimization" (preload, fetchpriority, use client, Suspense, lazy, prefetch) to justify why it's needed.
---

# Frontend architecture review (companion to the full SEO/frontend skill bundle)

This skill is different in kind from its siblings
([`seo-url-taxonomy`](../seo-url-taxonomy/SKILL.md),
[`seo-structured-data`](../seo-structured-data/SKILL.md),
[`seo-html-semantics`](../seo-html-semantics/SKILL.md),
[`frontend-performance`](../frontend-performance/SKILL.md),
[`frontend-security-headers`](../frontend-security-headers/SKILL.md),
[`frontend-css-ux-patterns`](../frontend-css-ux-patterns/SKILL.md)) — those teach *what the
correct mechanism is*; this one is the **gate**: how to decide whether a given piece of
work actually followed them, and how to reject work that didn't, before calling it done.
Distilled from a live design-review pass (2026-09-12) cross-checked against this project's
own existing rules — nothing here duplicates the sibling skills' content, it operationalizes
applying them.

## Two route classes inside the SAME `apps/web` app — not two separate apps

**Adaptation specific to this project, confirmed 2026-09-12**: neither sibling benchmark
project maps directly onto Fabber's real shape. `farmega.v2` designs a 100%-SEO-facing
public frontend; `nexus` designs a 100%-non-SEO admin panel — each is a *separate app*
built for one purpose. Fabber has **one single `apps/web` app that must serve both**: the
SEO-critical storefront (pillars, PDP, blog, guides, comparisons — every route in
`docs/seo/url-map.md`'s main table) **and** the non-SEO transactional flow (`/carrinho`,
`/checkout`, `/conta`) in the same codebase, same Server/Client Component conventions, same
design system. Per-route, not per-app, decide which discipline applies:

| Concern | SEO-critical routes (pillar, PDP, blog, marca, etc.) | Non-SEO routes (`/carrinho`, `/checkout`, `/conta`) |
|---|---|---|
| SSR/crawlability | Mandatory — `seo-html-semantics`/`seo-structured-data` apply in full | Not needed for crawling (route is `noindex`), but SSR may still help TTFB/UX |
| LCP/CWV discipline | Mandatory — this is the whole point of `frontend-performance` | Still matters for **real user experience**, just not for ranking — a slow checkout is a conversion problem, not an SEO one |
| JSON-LD | Required per `seo-structured-data`'s table | Not applicable — nothing here should be indexed |
| Accessibility (WCAG, focus, keyboard) | Full `seo-html-semantics` discipline | **Equally mandatory, arguably higher-stakes** — a checkout a screen-reader user can't complete is a conversion failure and a compliance risk, not a lesser concern than a public page's a11y |
| Security headers | `frontend-security-headers` applies everywhere | **Higher stakes here specifically** — this is where payment/PII actually flows (`INV-SEG-8`, `INV-SEG-12`) |
| `"use client"` / Next.js rendering discipline | Same `nextjs-rendering-architecture` rules apply — Server Components by default, Client Components as leaves | Same rules — a checkout naturally needs more interactivity/client state, but the same leaf-node discipline still minimizes hydration cost |

**The mistake to avoid**: treating "this route is `noindex`" as license to relax
performance, accessibility, or architecture discipline generally — only the
SEO-specific concerns (schema.org, crawlability, canonical) actually don't apply. Every
other skill in this bundle still governs a `/checkout` component exactly as much as a
pillar page.

**Decided 2026-09-12: one `apps/web` app, differentiated by route, not two separate apps
(a public-SEO app + a cart/checkout app).** Considered and rejected explicitly. Neither
sibling benchmark is actually analogous: `farmega.v2`'s `apps/web`/`apps/admin` split and
Nexus's admin-only app both separate by **user type** (public visitor vs. internal
curator/staff), each with its own auth model — Fabber's cart/checkout is **the same
customer, same session, same domain, one step further in one continuous journey**, not a
different user. Splitting would cut that journey at its highest-conversion-sensitivity
point (session/cart handoff across an app boundary, an extra cold-start/hydration cost,
duplicated design-system/Server-Action wiring) to solve a problem this project doesn't
have — `CLAUDE.md` already committed to one self-hosted container at MEI-scale cost, and
Next.js's own route-level segmentation (per-route `metadata`/cache headers, Cloudflare's
own per-path cache rules) already gives the differentiated treatment the table above
describes, with zero extra infrastructure. Revisit only with real evidence a shared
codebase is causing a specific, measured problem (e.g. proven bundle bleed from public
pages into checkout's hydration cost) — never speculatively.

## WordPress/WooCommerce headless — an adaptation the sibling projects don't need

Both `farmega.v2` (Pydantic-owned semantic core) and Nexus assume the project *owns* its
canonical backend data model. **Fabber does not** — WooCommerce/WordPress own their own
schema (per `CLAUDE.md`'s "WordPress structure vs. content" rule: no project-owned MySQL
table exists, WordPress/WooCommerce manage their own upgrade mechanism). This changes how
`nextjs-rendering-architecture`'s contract-architecture section applies:

- The canonical contract source is **WPGraphQL's own schema**, not a Pydantic/project-owned
  model — Fabber's "generated types, never hand-written" rule (`CLAUDE.md`) already reflects
  this, generating from WPGraphQL instead of an OpenAPI spec Fabber itself produces.
- The "don't leak internal/source-prefixed fields into the public contract" nuance still
  applies, but the boundary is different: it's WooCommerce/WordPress **meta fields** (raw
  internal SKU with its logistics-encoded segments, internal-only post meta, source-of-truth
  fields not meant for the storefront) vs. the DTO the Next.js BFF actually exposes to the
  client (`INV-SEG-3`) — the mapping layer is the GraphQL query/resolver boundary, not a
  separate serialization layer Fabber writes itself the way `farmega.v2`'s FastAPI layer
  does.
- Cart/checkout state itself flows through WooCommerce's own Store API (`INV-SEG-12`), not
  a project-owned domain model either — the BFF's Server Actions are the equivalent of
  `farmega.v2`'s API layer, but proxying to WooCommerce's REST surface rather than to a
  FastAPI service Fabber wrote.

## Real e-commerce functionality patterns — imported from a production system, filtered

New reference, 2026-09-12, from a real Wake-platform e-commerce migration's functional
spec (Consulta Remédios). Most of that system's specifics are pharma-regulated (PMC/PF
regulated pricing, prescription upload, generic/reference drug cross-linking) and **don't
apply to Fabber** — filtered out deliberately, not overlooked. What generalizes:

- **Price/fee must be computed once, from one component, everywhere it's displayed** — the
  source system built a single "calculate fee" component reused across PDP, listing cards,
  cart, checkout summary, and order-confirmation email, specifically to prevent the
  real bug class of one surface showing a different price than another for the same
  product. **Direct application to Fabber**: any price transformation (tax, discount,
  currency formatting) must live in one shared function/component, never re-implemented
  per page — the same discipline `INV-SEG-8` already mandates for server-side price
  computation, extended to also govern client-side *display* consistency.
- **Cart-level fulfillment constraints are a real, recurring e-commerce pattern** — the
  source system blocks mixing refrigerated and non-refrigerated products in one cart
  (different shipping handling). **Open question worth flagging for Fabber, not yet
  decided**: this project's own SKU spec already distinguishes fulfillment mode
  (`FBF`=Fabber-fulfilled vs. `FBD`=delegated/dropship, `sku-naming-convention.md`) —
  if a cart ever mixes an FBF item (ships from Fabber's own stock) with an FBD item (ships
  from a third party), that's two different shipping origins needing either split shipments
  or a UX decision (block mixing, like the source system does, or quote/ship separately).
  Not urgent while marketplace/dropship fulfillment is out of launch scope, but worth
  designing for before it becomes a real bug.
- **DataLayer/GA4 with hashed PII for logged-in users** — the source system pushes
  `user_id`/`user_email` as **SHA-256 hashes** when a customer is logged in, `null` when
  logged out — the real mechanism behind Google's "enhanced conversions" feature, and a
  concrete privacy-conscious pattern (never push raw PII into `dataLayer`, which is
  readable by every script with page access, including third-party tags).
  **Applicable to Fabber's future analytics/GTM work** — adopt this pattern rather than
  pushing raw customer data when instrumenting logged-in-state events.
- **A selected-variant/offer's displayed price must match its own real price consistently**
  — a real bug found in the source system: before a customer entered their postal code, a
  product page showed a "starting from" (lowest offer) price even when a specific variant
  was already selected via URL query param, instead of that variant's own actual price.
  **Direct application**: when Fabber's `?variacao=` query param selects a specific
  variation, every price shown on that page load (PDP, structured data, any recommendation
  widget) must reflect that specific variation's price — never silently fall back to a
  different (e.g. cheapest) variation's price. A concrete instance of the
  "JSON-LD/UI must share one source of truth" rule in `seo-structured-data`, extended to
  the case of query-param-selected state specifically.

## The core discipline: evidence-based optimization, never cargo-cult

**Never add a performance/architecture mechanism because it's "a best practice." Add it
because a specific, named problem exists, this mechanism is the fix, and there's a way to
prove it worked.** This applies to every one of: `preload`, `fetchpriority`, `"use client"`,
`Suspense`, `loading="lazy"`, `prefetch`, a new Client Component boundary, a new third-party
script, a new `content-visibility`, a new skeleton loader.

Before adding any of these, answer in the PR/commit description (or in your own reasoning
if unreviewed):
1. What specific metric or problem does this address (LCP? INP? bundle size? a real UX
   gap)?
2. What's the before/after evidence (measured, not assumed)?
3. What trade-off does it introduce (e.g. `fetchpriority="high"` on more than 1-2 resources
   dilutes the signal; a `Suspense` boundary with a heavy skeleton can cost more DOM than it
   saves)?
4. Did anything else regress as a side effect?

**A Lighthouse score going up is not evidence the architecture improved** — identify which
specific resource/mechanism changed and why, not just that a number moved.

## Server/Client Component boundary — the one MUST that governs this project's Next.js code

**Default to Server Components. Every `"use client"` boundary needs a concrete, stated
reason** — a real requirement for browser APIs, state, event handlers, or effects. "The
hook needed it" is not a reason if the actual need could be isolated to a smaller leaf
component instead of the whole subtree.

- **MUST**: Client Components should be leaf nodes of the tree wherever possible —
  `Server → Server → Server → Client`, not `Client → Client → Client → Server`.
- **MUST NOT**: mark a page or layout Client Component only to access static data,
  metadata, or simple server-fetched content that could render as a Server Component with
  a small client island for the truly interactive part.
- **Decision order before introducing a Client Component**: (1) can native HTML/CSS solve
  it (`<details>`, `<dialog>`, `:hover`, `<a>`)? (2) can it be a Server Component with the
  interactive part isolated to a small child? (3) can URL/search-param state replace
  `useState` for something that's genuinely navigable/shareable state (a filter, a sort
  order)? Only after ruling these out does a real Client Component boundary get introduced.

This is the single most consequential architectural lever in a Next.js codebase for both
INP (less client JS = less hydration cost) and maintainability — treat it as a real
constraint, not a style preference. Cross-check against the actual current Next.js
Server/Client and caching docs (verify live, don't assume from a general LLM-generated
summary — see this skill's own discipline above) before writing project-specific rules
that depend on the exact current caching API shape.

## Waterfall elimination

Whenever you see `A → B → C → D` (a chain of sequential fetches/renders each depending on
the previous one's result), ask: is this dependency real? Data that's independently
fetchable should be parallelized; data that's only needed after user interaction should be
deferred, not fetched eagerly. But don't swing to the opposite extreme either — a blind
`Promise.all([hugeA, hugeB, hugeC])` can delay first paint if only `hugeA` is needed for the
initial render. **Parallelize what's genuinely needed together; defer what isn't.**

## Faceted-content-hidden-by-CSS is a real anti-pattern

`display: none` used to solve a mobile-layout problem, where the "hidden" content is a
**different** copy of desktop content (not just a reflow of the same DOM), produces two
copies of the same content — duplicate content risk and wasted bytes. The fix is one
semantic DOM responding via CSS/container queries, never `MobileProductCard` +
`DesktopProductCard` as separate components rendering different content for the same data.

## DOM order must remain valid without CSS

A concrete, testable rule: **the DOM's actual order (not the visual order created by CSS
`order`/grid placement) must make sense read top-to-bottom with CSS disabled.** Screen
readers and keyboard tab order follow DOM order, not visual order — a CTA visually
positioned before the `<h1>` via CSS `order` while sitting after it in the DOM breaks both.
Test: disable CSS entirely and read the page — heading hierarchy, links, and the entity the
page is about should still make sense.

## Anti-pattern catalog

Reject on sight, unless a documented exception applies:

- `"use client"` with no stated reason, or applied to a whole page/layout instead of a leaf.
- Client-side `fetch` for content that's SEO-critical (should be SSR'd).
- `loading="lazy"` on the LCP image or any above-the-fold critical image.
- Indiscriminate `<link rel="preload">` on more than the 1-2 genuinely critical resources.
- `<div role="button">` where `<button>` would work natively.
- SEO-critical content injected only via CSS `::before`/`::after` `content:` (invisible to
  crawlers and screen readers as real content — see `seo-html-semantics`).
- Duplicated desktop/mobile DOM for the same content (see above).
- Importing an entire library for one function where a granular import exists.
- A new third-party script added with no documented purpose/owner/cost.
- A heavy, animated skeleton loader for genuinely simple content — the skeleton itself can
  cost more DOM/CPU than the content it's standing in for.
- A cascading fetch waterfall with no attempt to parallelize independent requests.
- An entire page rendered dynamically because one small piece of it (e.g. stock count) is
  volatile — prefer isolating the volatile piece ("dynamic islands, not dynamic pages").
- A privileged Server Action/Route Handler/RPC that relies on "it's not linked from the UI"
  or "it's `noindex`" as its only protection, with no explicit server-side authorization
  check inside itself — see `frontend-security-headers`'s LetraMaker incident: this exact
  pattern (an admin RPC reachable by anyone with the public anon key, no auth check inside
  the function) leaked 9,729 real user emails on a sibling project. `apps/web/src/app/
  status/page.tsx` is a live, lower-severity instance of the same shape today.
- Structured data (JSON-LD) authored from a different value than what's rendered in the
  visible UI for the same fact (price, availability) — both must derive from the same
  source of truth, never hand-duplicated (this is exactly the class of bug the Consulta
  Remédios case in `pillar-content-strategy.md` documents as a real production incident).
- `useState` holding data that was already fetched server-side — fetch it in the Server
  Component and pass it down; a `useState`+`useEffect` pair re-fetching client-side for
  data the server already had defeats SSR for no reason (added 2026-09-13, cross-checked
  against `wsimmonds/claude-nextjs-skills`' anti-pattern catalog).
- `useState` holding a value that's purely derived from other state/props (a cart total
  from line items, a formatted label) — compute it directly in the render body, or
  `useMemo` if the computation is genuinely expensive; a derived value in its own
  `useState` is a sync bug waiting to happen (the two can drift) for zero benefit.
- `useRouter()` called inside a Server Component — the hook is client-only and doesn't
  exist server-side; a Server Component that needs to redirect uses the `redirect()`
  function instead.

## Definition of Done — for any page/component task

A task is not complete until each of these has been checked, not merely believed:

- [ ] Semantic HTML confirmed (right landmark/heading/list/link/button choices, one `<h1>`).
- [ ] Metadata generated correctly (title, description, canonical) per the page's real
      route type in `docs/seo/url-map.md`.
- [ ] JSON-LD present and valid for the page's schema type, sourced from the same data the
      UI renders (see `seo-structured-data`).
- [ ] LCP element identified, not lazy-loaded, discoverable in the initial SSR HTML.
- [ ] Every image has explicit dimensions/`aspect-ratio` — no known CLS source.
- [ ] No unnecessary Client Component boundary — checked against the decision order above.
- [ ] Keyboard-only navigation works through the whole new flow (Tab/Shift+Tab/Enter/Esc).
- [ ] Focus is visible and managed correctly (see `seo-html-semantics`'s focus-management
      section) for any new modal/drawer/dynamic content.
- [ ] Responsive behavior tested at real intermediate widths, not just the standard
      breakpoint set (see `frontend-css-ux-patterns`) — look for a "layout cliff" the
      standard breakpoints don't reveal.
- [ ] No new third-party script without a stated purpose/cost.
- [ ] Content makes sense with CSS disabled (DOM order test above).
- [ ] Content makes sense with JavaScript disabled (a real signal of over-reliance on
      client-side rendering for content that should be server-rendered).

## Rule convention — MUST / SHOULD / MAY

Where a rule in this skill bundle uses **MUST**, it's a hard invariant — violating it is a
defect, not a style disagreement. **SHOULD** is a strong default, overridable with a stated
reason (see the evidence-based-optimization discipline above). **MAY** is a legitimate
option among several, not a directive. This bundle doesn't retroactively re-tag every
existing sentence in its sibling skills with these words — read a rule's own phrasing
("never", "always", "default to") as the equivalent signal where the explicit tag isn't
used; this convention governs new rules added going forward.

## Agent operating procedure — the order of operations for any real frontend task

Not a bureaucratic checklist to rush through — a sequence that front-loads the decisions
that are expensive to reverse later, and defers the ones that are cheap to change:

1. Identify the route's real type against `docs/seo/url-map.md` (pillar? PDP? entity
   index? non-SEO transactional route?) — this determines which rules in this bundle
   apply at all (see the SEO-critical vs. non-SEO route table above).
2. Identify what data the page needs, and classify each piece by volatility: static
   (rarely changes), revalidatable (changes but tolerates some staleness), per-request
   dynamic (price, stock, session-specific) — this drives the Server/Client and caching
   decisions in `nextjs-rendering-architecture`, not the other way around.
3. Design the Server/Client boundary using that skill's decision order — native HTML first,
   then Server Component with an isolated interactive child, then a real Client Component
   only if neither solves it.
4. Design the critical rendering path: what's needed for first paint (LCP element,
   critical CSS, essential fonts) vs. what's deferred.
5. Implement semantic HTML per `seo-html-semantics` — landmarks, headings, the Semantic
   HTML Decision Matrix below.
6. Implement responsive behavior per `frontend-css-ux-patterns` — content-driven
   breakpoints, container queries where appropriate.
7. Add client-side behavior only where step 3 concluded it's genuinely needed.
8. Add metadata (`generateMetadata`) and JSON-LD per `seo-structured-data`, sourced from
   the same data call the page renders from (never a second, hand-duplicated source).
9. Optimize images/fonts per `frontend-performance`.
10. Audit any third-party dependency added, using the procurement template in
    `frontend-performance`.
11. Run the Definition of Done checklist below.
12. Run the adversarial review questions below.
13. Fix what the review found; re-run both checklists before calling the task complete.

## Semantic HTML decision matrix

| Need | Prefer |
|---|---|
| Navigation to another URL | `<a>` |
| Triggering an action | `<button>` |
| Text input | `<input>` |
| Choosing from options | `<select>`, or a Base UI primitive when native `<select>`'s styling limits are a real constraint |
| A list of items | `<ul>`/`<ol>` |
| Content that could stand alone (product, post, review) | `<article>` |
| A thematic grouping within a page | `<section>` (only if you can name its heading) |
| Primary navigation | `<nav>` |
| The page's main content | `<main>` (one per page) |
| Complementary content | `<aside>` |
| Introductory region | `<header>` |
| Closing region | `<footer>` |
| Progressive disclosure (expand/collapse) | `<details>`/`<summary>` |
| A modal dialog | `<dialog>`, or Base UI's dialog primitive |
| No semantic meaning to express | `<div>` — the honest fallback, not a failure |

Only after exhausting this table does ARIA enter (per `seo-html-semantics`'s 5 real ARIA
use cases), and only after that does custom JavaScript behavior.

## Adversarial review — questions to ask before calling anything finished

What happens with JavaScript disabled? With CSS disabled? On a slow 3G connection? On a
low-end Android CPU? If the image CDN fails? If the third-party analytics script fails to
load? If the API is slow? What does Googlebot actually see in the rendered HTML? What does
a screen reader announce? What's in the accessibility tree for this component? What
resource is actually blocking LCP right now? What's the actual cause of any layout shift
observed? What's hydrated that didn't need to be? What could be removed entirely without
losing real value?

**Concrete manual passes, not just questions to ponder**:
- **Keyboard-only walkthrough** of the entire new flow: Tab, Shift+Tab, Enter, Space, Esc,
  arrow keys where relevant — complete a real task (browse → add to cart → checkout) using
  only the keyboard.
- **200% browser zoom** — content must reflow without horizontal scrolling or clipped/
  overlapping elements; this is a distinct test from "responsive at a narrow viewport,"
  since zoom changes the effective CSS pixel size, not just available width.
- **Screen reader pass** on anything new/complex (a modal, a custom dropdown, a dynamic
  cart update) — does the announced content match what a sighted user experiences?

## Related

This skill assumes the mechanisms taught by its siblings are already understood — it
doesn't re-teach LCP thresholds, JSON-LD shapes, or ARIA rules, it enforces that they were
actually applied and that nothing was added without justification.
