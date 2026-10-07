---
name: frontend-performance
description: Core Web Vitals thresholds and concrete optimization mechanisms (LCP/INP/CLS), JavaScript execution/loading patterns, and responsive image/font optimization for Fabber's Next.js frontend. Load this BEFORE writing or reviewing any component that renders above-the-fold content, loads a third-party script, or ships an image/font.
---

# Frontend performance (companion to seo-html-semantics, seo-structured-data)

Research pass completed 2026-09-12, live-verified against web.dev (`web.dev/articles/llms.txt`
as index, fetched `.md.txt` per article — never from memory). Companion to
[`seo-html-semantics`](../seo-html-semantics/SKILL.md) (the markup) and
[`docs/dev/frontend/seo-performance-spec.md`](../../docs/dev/frontend/seo-performance-spec.md)
(this project's own normative spec — read that first for project-specific decisions; this
skill is the general web.dev mechanism reference underneath it).

## Core Web Vitals — exact thresholds (p75, mobile+desktop)

| Metric | Good | Needs improvement | Poor |
|---|---|---|---|
| **LCP** | ≤2.5s | 2.5–4.0s | >4.0s |
| **INP** | ≤200ms | 200–500ms | >500ms |
| **CLS** | ≤0.1 | 0.1–0.25 | >0.25 |

Sources: [web.dev/articles/lcp](https://web.dev/articles/lcp), [web.dev/articles/inp](https://web.dev/articles/inp), [web.dev/articles/cls](https://web.dev/articles/cls).

## LCP — mechanism and breakdown

LCP element candidates: `<img>`, `<image>` inside SVG, `<video>` (poster/first frame),
elements with a CSS `background-image`, block-level text nodes. Excluded: zero-opacity,
full-viewport-covering elements, low-entropy placeholder images.

Target breakdown ([optimize-lcp](https://web.dev/articles/optimize-lcp)): TTFB ~40%,
Resource Load Delay <10%, Resource Load Duration ~40%, Element Render Delay <10%.

- `fetchpriority="high"` on the actual LCP image (1-2 images per page max — overuse dilutes
  the signal; a real case cut LCP 2.6s→1.9s with this alone).
- `<link rel="preload" as="image" fetchpriority="high">` when the resource isn't
  discoverable by the browser's preload scanner (referenced via CSS `background-image` or
  injected by JS) — CSS-referenced images need this even with `fetchpriority` set.
- **Never `loading="lazy"` on the LCP image** — lazy-loading defers priority until layout
  visibility is confirmed, which is the opposite of what LCP needs.
- SSR makes the LCP image discoverable directly in the initial HTML — no JS round-trip
  needed to render it (already this project's architecture).
- No render-blocking CSS/JS in `<head>`; `font-display` never `auto`/`block` for text LCP
  candidates; eliminate redirects; unique per-request query params on cacheable URLs can
  break CDN cache (relevant to this project's Valkey→revalidateTag→Cloudflare-purge chain).

## INP — mechanism and breakdown

Composition: input delay + processing duration + presentation delay (until next frame is
shown). One outlier per 50 interactions is discounted.

Optimization ([optimize-inp](https://web.dev/articles/optimize-inp)):
- Break long tasks into `setTimeout`-scheduled chunks so they don't block the main thread.
- "Yield" pattern: do only what's essential for the next frame inside
  `requestAnimationFrame`, defer the rest.
- Avoid layout thrashing — never read a layout property immediately after writing a style
  change (forces synchronous reflow).
- Reduce DOM size — directly ties to this project's own minimal-DOM rule (style
  recalculation cost scales with element count).
- `content-visibility` to lazily render off-screen elements.

Not confirmed in this research pass (don't assume): a specific "50ms long task" threshold
or Web Worker/Partytown offloading as an *official* web.dev INP recommendation — treat
Partytown-for-third-party-scripts as a community pattern this project has already adopted
elsewhere, not an official web.dev citation for INP specifically.

## CLS — mechanism and breakdown

Formula: impact fraction × distance fraction, grouped into session windows (shifts <1s
apart, 5s max window) — CLS = the largest session window, not a running sum.

Fixes ([optimize-cls](https://web.dev/articles/optimize-cls)):
- `width`/`height` or `aspect-ratio` on every `<img>`/`<video>`; `srcset` variants must
  share the same aspect ratio (art-direction variants use `width`/`height` on `<source>`
  instead).
- Reserve space for ads/embeds via `min-height`/`aspect-ratio`; prefer "Load More" over
  auto-injecting content (a shift near the viewport top costs more CLS than one further
  down).
- Fonts: `font-display: optional` for zero layout-shift risk (the web font may just never
  render if slow); `size-adjust`/`ascent-override`/`descent-override`/`line-gap-override`
  tuned to match the fallback font's metrics to the real font's, eliminating the swap-shift;
  preload critical fonts.
- Animate only `transform`, never `top`/`left`/`box-shadow`.
- Shifts within 500ms of a user input don't count toward CLS.

## Field data vs. lab data

Use **field data (CrUX)** to prioritize effort — reflects real users, real cache, real
platform optimizations. Use **lab data (Lighthouse)** to diagnose and test pre-production —
controlled, reproducible, catches issues on worse-than-average networks/devices before
they reach real users. TBT (lab-only) helps diagnose potential INP issues.
Source: [lab-and-field-data-differences](https://web.dev/articles/lab-and-field-data-differences).

**Not confirmed in this pass** (gap, don't invent): dedicated web.dev pages for the
`web-vitals` JS library (RUM), PageSpeed Insights API, or CrUX API/BigQuery — fetch those
specific pages before writing a RUM/monitoring implementation instead of assuming API
shape from memory.

## JavaScript — loading and execution

**Code splitting** ([code-splitting-with-dynamic-imports-in-nextjs](https://web.dev/articles/code-splitting-with-dynamic-imports-in-nextjs)):
`next/dynamic` for large, non-critical, or conditional components — can cut hundreds of KB
from the initial payload. `ssr: false` only for genuinely client-only components (a chat
widget), never as a default.

**Third-party scripts** ([efficiently-load-third-party-javascript](https://web.dev/articles/efficiently-load-third-party-javascript)):
`defer` (executes after full HTML parse, never blocks the parser) over `async` (can
interrupt DOM construction) for scripts that don't need to run immediately. `preconnect`
saves 100-500ms on critical third-party origins; `dns-prefetch` for less-critical ones.
Lazy-load below-the-fold third-party content via Intersection Observer (a documented case:
+200% improvement from lazy-loading below-fold ads). Self-hosting a third-party script
reduces DNS lookups and lets this project control its own HTTP cache headers.

**Execution optimization** ([optimize-javascript-execution](https://web.dev/articles/optimize-javascript-execution)):
segment unavoidable heavy main-thread work into few-millisecond chunks inside
`requestAnimationFrame`, one per frame — target ~3-4ms of JS execution during
animation/scroll to hold 60fps. Measure with Chrome DevTools' Performance panel (JS call
flame chart).

**Not confirmed in this pass**: `scheduler.yield()`, `isInputPending()`,
`requestIdleCallback()` — fetch their dedicated web.dev pages before using them as the
basis for a real implementation decision.

## Images and fonts

- **`srcset`/`sizes`**: width descriptors (`img.jpg 480w, img.jpg 800w`) + `sizes` with
  media conditions and a slot width, last entry unconditional (default). Valid units: `px`,
  `vw`, `em`, `calc()` — **`%` is invalid** in `sizes`.
  Source: [codelab-specifying-multiple-slot-widths](https://web.dev/articles/codelab-specifying-multiple-slot-widths).
- **AVIF**: >50% smaller than JPEG at comparable quality, supports HDR/wide-gamut/film
  grain; libaom 3.1.0 made encoding 6.5× less CPU / 5× less memory — speed setting 6 is the
  documented speed/quality balance. Source:
  [compress-images-avif](https://web.dev/articles/compress-images-avif). Web.dev does not
  directly compare AVIF vs. WebP — `next/image`+`sharp` already generates both
  automatically, treat AVIF-first-WebP-fallback as market practice, not a direct citation.
- **`<picture>` for art direction**: contains zero-or-more `<source>` + exactly one `<img>`
  last as fallback; the browser uses the **first** matching `<source>`, order matters (most
  specific first). Art direction swaps different crops/images, not just sizes — it's an
  editorial decision, not a performance win by itself.
  Source: [codelab-art-direction](https://web.dev/articles/codelab-art-direction).
- **Fonts** ([font-best-practices](https://web.dev/articles/font-best-practices)):
  self-hosting only beats a third-party CDN when paired with the project's own CDN+HTTP/2
  and the same subsetting/WOFF2 compression a provider like Google Fonts already does —
  `next/font/google` already automates this. `font-display`: `optional` (best performance,
  zero shift risk, font may never appear if slow), `swap` (fast render + fallback, risk of
  visible swap/FOUT), `block` (delays text render to avoid a visible swap/FOIT) — pick per
  priority. Subsetting via `unicode-range` (100-1,000 glyphs typical for Latin) — always
  confirm the font's license permits subsetting/self-hosting.
- **Font preload**: `<link rel="preload" href="..." as="font" type="font/woff2" crossorigin>`
  — `crossorigin` is required even for same-origin fonts, or the browser silently ignores
  the preload. Only for above-the-fold/immediately-needed fonts — preloading a font used
  only below the fold competes for priority against what actually needs it.
  Source: [codelab-preload-web-fonts](https://web.dev/articles/codelab-preload-web-fonts).

## Performance budgets — starting numbers, not universal truths

No number here is a citation from web.dev — these are **starting budgets for this
project**, to be measured against and revised with real data, not treated as authoritative
externally-sourced thresholds (unlike the CWV thresholds above, which are). Enforce via a
CI bundle-size check (e.g. `next build`'s own output size report, or a dedicated
size-limit-style tool) once `apps/web` has real routes to measure — not yet wired.

| Budget | Target | Notes |
|---|---|---|
| Initial HTML (pillar/PDP) | <80KB | Before compression |
| Critical CSS | <50KB | What's needed for first paint |
| Initial JS — public routes (pillar, PDP, blog) | <150KB | Should be small — mostly Server Components |
| Initial JS — checkout | <250KB | Naturally higher — more real interactivity, still budgeted, not unlimited |
| Third-party JS, total | <80KB | Across all scripts combined, not per-script |
| Font payload | <100KB | Subsetted, WOFL2 only |
| Critical-path requests | <60 | Before interactive |

**A budget being exceeded is a finding, not an automatic block** at this project's current
scale (no CI enforcement built yet) — but it should trigger the same evidence-based
question as any other optimization: what changed, why, and is the trade-off justified.

## Third-party script procurement — a script needs to earn its place

Before adding any third-party script (analytics, pixel, chat widget, review widget, A/B
testing, embed), fill this out — in the PR description or commit message, not just in your
head:

```
name:              (e.g. "Google Tag Manager")
purpose:           (what business function this serves)
owner:             (who asked for it / who's accountable for it)
business_value:    (what it's worth — if "unknown," that's the finding)
bytes:             (measured, not estimated)
requests:          (how many additional HTTP requests it adds)
main_thread_cost:  (measured via DevTools Performance panel, not assumed)
privacy_impact:    (what data it collects, third-party cookie use)
failure_mode:      (what happens to the page if this script fails/is blocked)
loading_strategy:  (defer / async / lazy-on-interaction / idle)
```

If `business_value` is genuinely "we don't know," that's a real signal to question whether
it belongs at all — not a reason to skip the exercise. A Tag Manager is not "free" just
because it's one script tag — everything loaded through it (GA, Meta Pixel, Hotjar, ads)
counts toward the third-party budget above.

## Additional mechanisms — established practice, not independently re-verified live this session

The following are well-established, uncontroversial web performance practices (cross-check
MDN if a specific implementation detail is needed) — included for completeness, not
re-verified against a live web.dev fetch the way the sections above were:

- **`content-visibility: auto`** on large off-screen sections defers their layout/paint
  work until they're near the viewport — use deliberately, and verify it doesn't break a
  component whose geometry or accessibility depends on being fully rendered (e.g. anchor
  links to content inside it, `Ctrl+F` find-in-page).
- **`will-change`** should be scoped to the specific element that's about to animate, set
  shortly before the animation and removed after — never applied broadly (`* { will-change:
  transform }`), which increases memory usage for no benefit.
- **SVG over icon fonts** for icons/logos — smaller, no extra font request, no FOUT-style
  flash of missing glyph, better accessibility (a `<title>` inside the SVG vs. an icon
  font's opaque Unicode codepoint). This project already uses Phosphor as React components,
  which are SVG-based — this preference is already satisfied, not an action item.
- **Video**: never autoplay a large video in the first fold without a real reason: a
  `poster` attribute (a real static image, not a blank frame), `preload="none"` or
  `"metadata"` (never `"auto"` for a below-the-fold video), modern codec/compression,
  responsive sizing matching the container.
- **Facade pattern for heavy embeds** (YouTube, a heavy chat widget, a Maps embed): render
  a lightweight placeholder (a static thumbnail + play button for video) and load the real
  embed only on user interaction or `requestIdleCallback` — this project's own `CLAUDE.md`
  already names Partytown for GTM/third-party scripts specifically; the facade pattern is
  the analogous technique for a heavy *embed* rather than a script.
- **HTTP compression (Brotli)**: ensure Brotli (not just gzip) is enabled for
  HTML/CSS/JS/SVG/JSON responses — Caddy supports this; confirm it's actually configured,
  don't assume a default.
- **HTTP/2 or HTTP/3, CDN**: already covered by this project's Cloudflare-in-front
  architecture — a CDN does not fix a slow application, it reduces the network-latency
  portion of the chain specifically (relevant to the TTFB breakdown in the LCP section
  above).

## Real-world case study — SSR vs. CSR, measured, not theoretical

From a sibling project's real production CWV incident (Consulta Remédios, 2026, post-
migration regression) — concrete evidence, not a hypothetical, for why this project's own
SSR-first architecture decision matters:

- **Measured on the same page, two rendering paths**: the CSR (client-rendered) version
  delivered to real users measured **LCP >4,900ms and FCP similarly poor**; the SSR version
  (what was served to Googlebot) measured **FCP 790ms and LCP 1,690ms** — both comfortably
  "good." Same page, same content, the only difference was rendering strategy. This is the
  concrete, measured version of the abstract "SSR helps LCP" principle in this skill's LCP
  section above.
- **Root causes found for the CSR path's poor CWV**: four render-blocking external CSS
  files in `<head>` (fixed by inlining critical CSS instead), a heavy YouTube embed
  measured at **5,108ms total CPU time** just for the player script (the concrete number
  behind this skill's facade-pattern recommendation), GTM+Google Ads+Funding Choices
  consent + several ad-tech third parties collectively costing **several seconds of CPU**
  across the page's third-party scripts (measured, not estimated — the same discipline
  this skill's procurement template above asks for).
- **CLS root causes found**: font swap without `font-display: swap` (browser hid text
  until the custom font loaded, then shifted), and a hamburger-menu icon loading without
  reserved space — both fixed by the standard mechanisms already in this skill (explicit
  `font-display`, and reserving space for any element whose final size is known ahead of
  load).
- **A skeleton-loader anti-pattern found**: the loading skeleton for mobile was rendering
  the **desktop 3-column layout's shape**, not mobile's actual 1-column shape — meaning the
  loading state didn't match the real final layout, causing its own layout shift once real
  content replaced it. Reinforces this skill's own principle that a loading state should
  mirror the final state's geometry, per breakpoint, not just per component.

## Speculative loading — an advanced, optional technique, not a substitute for correct architecture

`prefetch` (loading a likely-next-page's resources ahead of navigation, e.g. on link hover)
and the newer **Speculation Rules API** (declarative prerendering of probable next
navigations) can reduce perceived navigation latency for a **probable** next action (e.g.
hovering "finalizar compra"). Both should be based on real probability, not applied
indiscriminately — prefetching a page the user was never going to visit wastes bandwidth
for no benefit. Treat as an advanced optimization to consider once the core architecture
(SSR, correct Server/Client boundary, real caching) is already solid — never as a
substitute for fixing an actually slow page.

## Checklist before shipping a page/component

1. Identify the actual LCP element — confirm it isn't lazy-loaded, has `fetchpriority="high"`
   if it's an image, and is discoverable in the initial SSR HTML (not injected by client JS).
2. Every `<img>`/`<video>` has explicit dimensions or `aspect-ratio` — no CLS from
   late-arriving media.
3. Any new client-side interaction (filter, add-to-cart, form submit) — check it isn't doing
   synchronous heavy work on the main thread; break it up if it is.
4. Any new third-party script (analytics, pixel, chat widget) — `defer` by default, lazy-load
   if below the fold, `preconnect` its origin if it's render-critical.
5. New font weight/family — subsetted, self-hosted via `next/font`, preloaded only if
   above-the-fold, `font-display` chosen deliberately (not left at browser default).
