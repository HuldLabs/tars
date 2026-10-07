---
name: frontend-css-ux-patterns
description: Modern CSS (container queries, fluid type, dvh units), View Transitions, dark mode/reduced-motion, and official Google-documented checkout/sign-up form UX patterns for Fabber's Tailwind v4/Base UI frontend. Load this BEFORE building a responsive component, a checkout/sign-up form, or a theme/motion-sensitive interaction.
---

# CSS and UX patterns (companion to frontend-performance, seo-html-semantics)

Research pass completed 2026-09-12, live-verified against web.dev (`web.dev/articles/llms.txt`
as index, fetched `.md.txt` per article; some entries via WebSearch where the index didn't
cover the topic — flagged explicitly below where that's the case).

## Breakpoints are determined by content, never by device category

**Core principle**: a breakpoint exists because a specific layout/content genuinely breaks
at that width — not because "that's where tablets are." Standard values (640/768/1024/1280)
are reasonable starting points, not a fixed contract — if a specific layout breaks at 713px,
the breakpoint is 720px, regardless of what device that resembles. Test at real intermediate
widths (not just the standard set) to find a "layout cliff" — a range where the layout looks
fine, breaks at some specific width, then looks fine again once past a threshold — which is
the concrete symptom of a breakpoint chosen for the wrong reason.

**Practical checklist**: test at least at 320, 360, 390, 430, 600, 768, 900, 1024, 1280,
1440, 1920px — but treat these as **test points to probe for breaks**, not as the
breakpoint set itself. Prefer, in this order: (1) fluid sizing (`clamp()`, `min()`, `max()`)
so no breakpoint is needed at all; (2) container queries when the component's own available
space is what should drive its layout, independent of the viewport; (3) a media query only
when a genuine structural change is needed at the page level. Avoid device-specific
breakpoints, duplicated desktop/mobile DOM for the same content (a real anti-pattern — see
`frontend-architecture-review`), and more than a handful of breakpoints per component —
each one is a maintenance liability, not a free customization.

## Container queries vs. media queries — a real per-component decision

Use **container queries** when a component's layout should respond to the space it's
actually given (a product card rendered in a grid, a sidebar, a carousel — all different
widths, independent of the viewport). Use **media queries** for page-level layout decisions
tied to the viewport itself. `container-type: inline-size` on the parent + `@container
(inline-size > 40ch) {...}` on the child; the `cqi` unit (1% of the container's inline-size)
for proportional sizing. **Direct application**: Fabber's product card should use
`@container`, not a media query, since the same card renders in grids of different widths —
Tailwind v4 already supports this natively.
Source: [web.dev/articles/baseline-in-action-container-queries](https://web.dev/articles/baseline-in-action-container-queries).

## Fluid typography

`clamp(min, preferred, max)` for font sizes that scale continuously with the viewport
instead of jumping at discrete breakpoints — removes the abrupt size jump between
breakpoints on checkout/PDP text.
Source: [web.dev/articles/min-max-clamp](https://web.dev/articles/min-max-clamp).

**Not found**: a dedicated web.dev article on the `:has()` selector — the normative
reference for it is MDN, not web.dev, for this specific feature.

## Subgrid

Aligns nested grids without duplicating `grid-template` in the child — useful for aligning
price/name/CTA rows across product cards of varying content height.
Source: [web.dev/articles/css-subgrid](https://web.dev/articles/css-subgrid).

## View Transitions — native API is production-ready same-document, not yet cross-document

Two distinct things, don't conflate them:
1. A **manual CSS+JS technique** (`transform: translateX()`, `will-change`, cubic-bezier
   easing, with an iOS Safari caveat needing `-webkit-overflow-scrolling: touch`) — the most
   concretely proven pattern for a list→detail slide transition today.
   Source: [web.dev/articles/animating-between-views](https://web.dev/articles/animating-between-views).
2. The **native View Transitions API** (`document.startViewTransition`) — confirmed
   Baseline "Newly available" for **same-document** transitions (Firefox 144 adopting in
   2026). **Cross-document** view transitions (the real case for a Next.js listing→PDP
   navigation across separate routes/full page loads) are still explicitly called
   "actively evolving" by Google's own Interop 2026 tracking — don't rely on it as the sole
   mechanism for a production listing→PDP transition yet; the manual technique in (1)
   remains the safer default for that specific case.
   Sources: [web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available), [web.dev/blog/interop-2026](https://web.dev/blog/interop-2026).

## Checkout and sign-up forms — official Google codelabs, directly actionable

These are the **strongest, most specific source** found in this entire research pass —
concrete attribute-level rules, not general principles.

**Sign-up form** ([codelab-sign-up-form-best-practices](https://web.dev/articles/codelab-sign-up-form-best-practices)):
`autocomplete="name"`, `autocomplete="username"` (yes, even for an email field),
`autocomplete="new-password"` on signup vs. `current-password` on login,
`type="password"`/`type="email"`, `<label for>` mandatory, `required` + `minlength="8"`,
`pattern="[\p{L}\.\- ]+"` for a name field, a show/hide password toggle with `aria-label`,
and checking a new password against known-breached-password lists.

**Payment form** ([codelab-payment-form-best-practices](https://web.dev/articles/codelab-payment-form-best-practices))
— directly applicable to Fabber's custom Next.js checkout (`INV-SEG-12`):
`autocomplete="cc-number"`/`cc-name`/`cc-exp`/`cc-csc`; `inputmode="numeric"` + `pattern` +
`maxlength` on numeric fields; each input inside a `<section>` with `<label for>`; **never
disable the submit button until the form is actually complete** — validate inline during
typing AND on submit; disable the button only *after* the click (prevents double-submit,
not before); mobile-first breakpoints around 400px/500px.

A `codelab-sign-in-form-best-practices` also exists but wasn't detailed here — sign-in
isn't this project's conversion bottleneck the way checkout is.

**Not confirmed**: a dedicated, current "UI Patterns library" on web.dev for
navigation/filter/cart patterns — only the three form codelabs above were confirmed live.
Don't cite a filter/cart pattern as "from web.dev" without re-verifying it exists first.

## Dark mode without FOUC

Exact recommended order ([web.dev/articles/color-scheme](https://web.dev/articles/color-scheme)):
1. `<meta name="color-scheme" content="dark light">` in `<head>`, **before CSS loads** —
   lets the user agent paint the correct background immediately.
2. `:root { color-scheme: dark light; }` in CSS as reinforcement.
3. `@media (prefers-color-scheme: dark)` rules last, for author-controlled styling.

`color-scheme` controls the UA's **default** rendering (scrollbars, native form controls);
`prefers-color-scheme` controls what the **author styles** — they work together, neither
replaces the other. Complementary: `light-dark()` CSS function
([web.dev/articles/light-dark](https://web.dev/articles/light-dark)) for a single
declaration that picks a color based on the active `color-scheme`.

## Reduced motion

`prefers-reduced-motion: reduce` means removing **all non-essential motion**, not just
slowing it down. Explicitly required for: page-transition animations (the list→PDP slide
above needs a no-transform fallback under `reduce`) and any autoplay
carousel/video — autoplay is named explicitly as a disable candidate.
Source: [web.dev/articles/prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion).

## Dynamic viewport units — fixes the classic mobile `100vh` bug

`svh` (small viewport, address bar expanded), `lvh` (large viewport, address bar
retracted), `dvh` (dynamic — live-adjusts as the address bar shows/hides). Shipped Chrome
108+, supported in Safari/Firefox. **Direct application**: any full-height section of
Fabber's mobile checkout/PDP should use `dvh` instead of `vh` to avoid content being
clipped or overflowing as the mobile browser's address bar animates.
Source: [web.dev/blog/viewport-units](https://web.dev/blog/viewport-units).

## Known gaps — deliberately not filled from memory

`:has()` selector (MDN, not web.dev), a dedicated UI-patterns library for
filter/navigation/cart beyond the 3 form codelabs above — neither was found live in this
pass. Re-verify before citing either as sourced from web.dev.
