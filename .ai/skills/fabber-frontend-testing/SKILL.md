---
name: frontend-testing
description: Playwright/E2E testing conventions for this store — locator priority, the data-testid naming convention actually decided for this project (not the inherited fb-* one), the centralized registry, and CI guards. Load this BEFORE writing any Playwright test, or any component that needs a data-testid.
---

# Frontend testing (Playwright)

**Source of truth, not paraphrased in full here** — read the actual files before
deciding anything non-trivial:

- `docs/dev/frontend/seo-performance-spec.md` §10 (Testability) — this project's OWN
  reasoning, written specifically for this store's constraints (minimal-DOM rule,
  accessibility-first). Normative for **naming** (see decision below).
- `docs/dev/frontend/testing-strategy.md` — the layered test architecture
  (smoke/journeys/edge-cases/api/templates/infra), payment/dataLayer/JSON-LD
  validation approach, and coverage gaps (a11y, LGPD banner, transactional
  email, IDOR, test-data isolation). Read this before deciding WHAT to test
  and in which category — this skill only covers naming/tooling for HOW.
- `docs/dev/frontend/design-system/inherited-from-fabber-main/TESTID-CONVENTION.md` —
  inherited from the sibling farm-management app (`FabberLabs/fabber`), not reasoned
  for this project specifically, but more complete on **tooling**: locator priority
  order, a centralized registry file, CI guard scripts. Normative for **structure**
  (see decision below), NOT for the `fb-{domain}-` prefix.

## The decision — synthesized 2026-09-10, not a straight pick of either doc

Two documented conventions conflicted (found while writing this project's first real
Playwright test). Compared: `seo-performance-spec.md` §10 is older but has actual
reasoning for THIS project (a single storefront, no multi-domain app to disambiguate
against); `TESTID-CONVENTION.md` is newer and more complete on tooling, but is a
direct copy from a sibling app with a different shape (many internal domains —
`auth`, `calc`, `mkt`, `dash` — that this single-storefront e-commerce doesn't have).

**Naming: follow `seo-performance-spec.md` §10, NOT the `fb-{domain}-{component}`
prefix.** Plain kebab-case, describing what the thing is, not where it lives:
`product-card`, `price`, `add-to-cart`, not `fb-catalog-product-card`. The domain
prefix exists in the inherited doc to disambiguate testids across many internal
tools sharing one app shell — this project is one storefront, so it adds a syllable
with no disambiguation value.

**Tooling: adopt `TESTID-CONVENTION.md`'s structure.** A centralized registry
(`apps/web/src/lib/testing/test-ids.ts`) — every `data-testid` used in a component OR
a test is declared there first, imported everywhere, never a bare string literal in
either a component or a spec file. This prevents drift (a renamed testid breaking
tests silently) and gives one grep-able audit trail. CI guards (data-testid never in
CSS, tests import from the registry instead of hardcoding) are worth keeping, adapted
to this project's actual `apps/web` path (the inherited doc's own script paths
reference a different repo layout).

## Locator priority — identical in both docs, matches Playwright's own docs

1. `getByRole()` — closest to how users/assistive tech perceive the page
2. `getByLabel()` — form controls
3. `getByPlaceholder()` / `getByAltText()` / `getByTitle()`
4. `getByText()` — non-interactive elements with stable text
5. `getByTestId()` — fallback, not the primary strategy
6. CSS/XPath — last resort, effectively forbidden (see below)

**`data-testid` only when**: the element is a repeated container (product card, order
line) with no stable distinguishing text, OR has dynamic/i18n-sensitive text (price,
counters). Business keys travel as their own data attribute (`data-sku`,
`data-order-id`), not baked into the testid string — lets you address a specific
entity via `[data-sku="..."]` without adding a testid to every scoped child.

**Forbidden, in both source docs**: CSS class, DOM order (`nth-child`), wrapper
structure. Exactly the coupling the minimal-DOM rule breaks the moment a wrapper is
removed for other reasons.

## Where things live

- `apps/web/playwright.config.ts` — Playwright config.
- `apps/web/e2e/` — spec files (`*.spec.ts`).
- `apps/web/src/lib/testing/test-ids.ts` — the centralized testid registry.
- `apps/web/e2e/README.md` (if one exists) — anything test-run-specific (how to run
  against a live environment vs. mocked, env vars needed) that doesn't belong in this
  skill.

## The first real test and why it looks the way it does

2026-09-10: the first Playwright spec in this repo tests a backend/infra regression
(`stg.fabber.com.br`'s WordPress incorrectly redirecting through the frontend domain
after Cloudflare Access login — `tests/contracts/test_infra_domains.py` fixes the
same root cause on the Python config side). It's an infra-facing test, not a
component test, and deliberately lives in `apps/web/e2e/` anyway — Playwright is this
project's E2E tool regardless of which layer a regression sits in, and the
`stg-api.fabber.com.br` domain-routing bug is exactly the kind of cross-cutting
failure a component-level unit test would never catch. Look at that spec for the
project's first real example of testing a live staging URL rather than a page
rendered by `apps/web` itself.
