---
name: frontend-design-system
description: >-
  Conventions for any Next.js/shadcn/Base UI frontend work in apps/web —
  component composition, icons, tokens, page templates, when to reuse vs. wrap
  vs. build. Load this BEFORE writing or editing any component in apps/web/src.
---
**Companion skill**: `frontend-testing` — Playwright/E2E conventions, the actual
`data-testid` naming decided for this project (not the inherited `fb-*` one), and
where specs live. Load it BEFORE writing a test or adding a `data-testid` to a
component built under this skill's own rules.

# Frontend scaffolding (apps/web)

**Source of truth, not paraphrased here** — read the actual files before deciding
anything non-trivial:

- `docs/dev/frontend/design-system/inherited-from-nexus/` — the **original**, most complete source
  (Nexus, same company). `DESIGN-SYSTEM.md` has the real decision tree (atomic-design
  layers, numbered steps, good/bad examples, golden rule). `COMPONENT-CATALOG.md` has a
  ~70-row per-component precedent table (use-as-is / wrap / compose / build-from-scratch)
  — check it before inventing a decision for a component that's already listed there.
- `docs/dev/frontend/design-system/inherited-from-fabber-main/` — the sibling app `FabberLabs/fabber`'s
  own copy of the same system (one hop closer to this project, `fb_` prefix instead of
  `nx_`), plus its `TESTID-CONVENTION.md` and 3 ADRs. Condensed vs. the Nexus originals —
  consult when you need the `fb_`-prefixed framing specifically.

**Real lineage**: Nexus → `FabberLabs/fabber` → this store. Confirmed 2026-09-05 by
reading the actual source chain (both repos), not assumed from a citation.

## The mistake this skill exists to prevent

While building `/status` (2026-09-05), a `DropdownMenuTrigger` was written with
`asChild` — the Radix/shadcn-default convention, wrong here. The real generated
component (`src/components/ui/dropdown-menu.tsx`) wraps `MenuPrimitive.Trigger` (Base
UI), which has no `asChild` prop at all. **Reading the actual generated component
before composing it would have caught this immediately.**

## Decision order for any new UI piece (from `inherited-from-nexus/DESIGN-SYSTEM.md`)

1. Does a shadcn/Base UI primitive already cover it? → use it directly.
2. Need Fabber-standardized behavior/visual/API on top? → wrap it (`fb_` prefix).
3. Does shadcn cover it partially? → compose the missing part from existing primitives.
4. No viable alternative at all? → only then build from scratch.

Mental model: átomo (simple wrapper of one shadcn primitive) → molécula (small,
single-purpose composition) → organismo (larger composition with real state/slots) →
template/page. Never build two components for the same intent — check
`COMPONENT-CATALOG.md` first.

## Hard rules, no exceptions

- **Base UI only. Radix is forbidden.** `@radix-ui/*` must never appear in an import.
- **Never `asChild` — always the `render` prop.**
  `<Trigger render={<Button variant="outline">...</Button>} />` merges the trigger's
  behavior into that exact element, no wrapper div — also the mechanism behind this
  project's minimal-DOM rule (`CLAUDE.md`). Check every new shadcn component's own
  source for `asChild` before using it; if it's there, the generated file is stale.
- **Icons: Phosphor (`@phosphor-icons/react`), never `lucide-react`.** Import from
  `@phosphor-icons/react/dist/ssr` in a Server Component, plain `@phosphor-icons/react`
  in a Client Component.
- **No hardcoded colors, no `text-[Npx]`.** Every color is a token
  (`apps/web/src/app/globals.css`). A new semantic color (this project already added
  `success`/`warning`/`info`, inherited from fabber-main) needs a CSS variable in
  `:root`/`.dark` plus the `@theme inline` mapping — never a literal hex/oklch inline.
- **Every internal/ops/admin page uses `FbPageSimple`** (or a real `Tabs`-based
  alternative if genuinely needed — `FbPageTabs` is deprecated upstream, "usar Tabs
  direto" per `inherited-from-fabber-main/DESIGN-SYSTEM.md") as its page shell, not a
  hand-rolled `<main><h1>` structure. `/status` is the reference example.
- **Global theme**: `next-themes` (`ThemeProvider` in `layout.tsx`, `attribute="class"`)
  — light/dark/system, toggled via `components/mode-toggle.tsx`. Don't scope dark mode
  to one page's own wrapper; it's global so every page shares the same toggle state.
  Exception: never let a global theme change silently restyle a page real visitors see
  (`page.tsx`/ComingSoon) as a side effect of an internal page's own preference —
  confirm the blast radius before flipping a default.
- **Font: Inter**, self-hosted via `next/font/google`, applied once at the root layout
  (`--font-sans` CSS variable) — never a per-component font override.

## Before copying anything else from `FabberLabs/fabber` or `Nexus`

Both repos have real bugs of their own (e.g. `FbPageHeader`'s `icon` prop was declared
but never rendered, `FbPageFooter` hardcoded fabber-main's own product name — both
fixed in this store's copy, 2026-09-05). Copying a component means reading it, not
blind-pasting: fix bugs in the copy, note it in a comment (this is a copy, not a shared
package — no upstream PR expected), and keep going.

**Not relevant to this store**: domain-specific components from either source
(`fb_calculator-*`, `fb_add-printer-dialog`, Nexus's chart wrappers/VTEX widgets,
anything under `core/domains/`).

**⚠️ DECIDED 2026-09-16 (operator, explicit, during the login-organism build) —
this note previously called Nexus's "front 100% burro / server-driven UI" principle
"not decided," deferred to Phase 3. That deferral is over: it IS adopted for this
project now, at minimum for any auth/identity screen (`LoginOrganism` and siblings).**
A component never owns copy, labels, button/screen state, or error strings as
hardcoded defaults — it declares SLOTS (typed props) and renders whatever payload
the backend/app layer supplies, the same "payload injection" discipline
`packages/theme-engine`'s other templates already use for DATA (`HeaderChromePayload`,
`ArchivePayload`, etc.), now extended to cover COPY and UI STATE too, not just data.
Concretely: no `title = "Entrar"` default, no inline `"Não foi possível continuar"`
string in a component — the caller (a Server Component reading real backend state, or
a Server Action's own typed response) supplies the exact string/state the component
renders. This does not (yet) extend to the rest of the storefront's SEO-critical
pages (catalog/product/pillar content) — revisit that separately, with its own
tradeoff analysis (this rule trades render simplicity for an SSR/ISR-friendliness
question a public indexable page has that an auth screen does not); this decision is
scoped to auth/identity UI for now.

**Separate but related rule, universal (not scoped to auth), reinforced
2026-09-16**: this scoping is about component COPY/UI-STATE defaults
specifically. It does not create an exception for page CONTENT — every
page's actual textual/editorial content (a product description, a blog
post, a legal page like `/privacidade`/`/termos`) always comes from
WordPress via WPGraphQL, never hardcoded in a `.tsx` file, even for an
apparently-simple static page and even as "provisional placeholder"
content. Check whether WordPress/WooCommerce already exposes a native
"which page fills this role" mechanism (e.g. WordPress core's own Settings
> Privacy page selector, WooCommerce's own Terms-and-conditions page
selector) before inventing a project-specific slug/route convention. Full
version of this rule: `.ai/skills/api-contract-conventions/SKILL.md`'s
"Content origin, not just UI state" section. The only exception is the
user explicitly asking for hardcoded content in that specific task.

## Rebuild-from-zero — the SSD question, applied here

Everything under `apps/web` is rebuilt by the image build, so the rule is mostly
automatic here — which is exactly why the exceptions hide. Ask the mantra in
`worker-prompt-template.md` §8: if the SSD burns and the environment is rebuilt from zero with only
the initial secret, does this come back on its own, by which task/deploy/start? A
component that renders only because of a locally built package, a generated asset, or
a value sitting in someone's local `.env` does not. Ship the generator or the
declaration in the repo, never the generated artifact.
