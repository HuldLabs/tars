---
name: api-contract-conventions
description: How Fabber names API routes relative to page routes, and the server-driven "front burro" payload contract for any screen a component renders without owning its own copy/state. Load this BEFORE adding a new API route, or building/editing any server-driven component (LoginOrganism and siblings).
---

# API/route naming and front-burro contract conventions

Distilled 2026-09-16 during the login-organism build (task 108 §7.8), cross-checked
live against the real source of three sibling projects (`seo-expert`, `farmega`,
`farmega.v2` -- all reachable at `\\wsl.localhost\ubuntu-24.04\home\pablo\projects\`
on this machine; `X:\nexus` is a separate, less complete mirror). Nothing here is
paraphrased from a benchmark summary alone -- each rule below cites the real file it
came from, live-read this session, not assumed from `docs/dev/references/*-benchmark.md`.

## API path pairs with the page route it serves

**Operator's own stated rule (2026-09-16)**: whenever possible, pair an API route with
the page route it serves, so the relationship is readable/semantic/easy to maintain at
a glance. `/login` (the page) is served by `/api/login` (the endpoint) -- not
`/api/screens/login`, `/api/auth/login-screen`, or any other namespace with no
counterpart in the actual page-route hierarchy. Real bug this rule caught live: this
skill's own first draft of the login endpoint was named `/api/screens/login` --
renamed to `/api/login` the same session once this rule was stated explicitly.

This does not forbid a deeper API path when the PAGE route itself is deeper
(`/conta/pedidos` -> `/api/conta/pedidos` would be the same pattern) -- the rule is
"mirror the route", not "always one segment deep".

## Front burro / server-driven UI -- the real contract, not invented

**Adopted 2026-09-16** (operator, explicit -- see `frontend-design-system/SKILL.md`'s
own `⚠️ DECIDED 2026-09-16` note for the full history of this decision, previously
deferred to "Phase 3"). A component that follows this pattern owns **zero** copy, zero
enabled/disabled logic, zero button/field state as hardcoded defaults -- it declares
typed SLOTS (props) and renders whatever payload a real, network-reachable API endpoint
returns. The backend decides whether a button appears, whether it's enabled, its label,
why it's disabled, and its confirmation text -- never an `if` inside the component.

**Content origin, not just UI state — reinforced 2026-09-16**: the same
"never hardcode, always a real payload" rule applies to CONTENT, not only
interactive state/copy. Any textual/editorial content a page renders —
including an apparently-static legal page like `/privacidade` or
`/termos` — comes from WordPress (a real Page, or the native
role-assignment mechanism when one already exists, e.g. WordPress core's
own "Settings > Privacy" `wp_page_for_privacy_policy` selector, or
WooCommerce's own "Terms and conditions page" `woocommerce_terms_page_id`
selector) fetched via WPGraphQL — never typed directly into a `.tsx`
component, not even as "provisional placeholder" content. Check whether
WordPress/WooCommerce already has a native "which page fills this role"
setting before inventing a project-specific slug convention. **The only
exception**: the user explicitly asks, in that specific task, for
hardcoded content — never assume it as a default for "it's just a simple
static page."

**The two real, live-confirmed contract shapes**, both from `seo-expert`
(`apps/web/src/lib/types.ts`, `apps/web/src/components/content/
ContentOperationsIntakeFormScreen.tsx`) -- `farmega`/`farmega.v2` were checked and
found NOT transferable: both are server-rendered Python (Dash Mantine Components), so
they render components directly server-side and have no JSON contract to serialize at
all, unlike this project's React client consuming a separate Next.js backend surface.

### Actions (buttons/links) -- `ActionCapability`

```ts
type ActionCapability = {
  id: string;
  label: string;
  enabled: boolean;
  visible: boolean;
  disabled_reason: string;
  endpoint: string;
  method: string;              // "GET" = real navigation (render as next/link
                                // Link, client-side transition); anything else
                                // = a real action (render as a <button>,
                                // fetch endpoint with method on click/submit)
  payload: Record<string, unknown>;
  semantic_status: string;     // "primary" | "secondary" | "destructive" | "link"
  confirm_text: string;
};
```

The GET-vs-not-GET split for navigation-vs-action rendering mirrors
`seo-expert/apps/web/src/lib/server-driven-primitives.tsx`'s own
`isSelfNavigationAction`/`ServerActionButton` -- a GET action with a `target: "_self"`
that already matches the current path renders nothing at all (self-navigation is a
no-op); every other GET action is a real link.

### Form fields -- `IntakeField` / `IntakeFormUi`

```ts
type IntakeField = {
  name: string;
  label: string;
  kind: string;                // "text" | "select" | "multiselect" | "textarea" |
                                // "hidden" in the real source; this project adds
                                // "email"/"password" for auth forms, same pattern
  required: boolean;
  description?: string;
  placeholder?: string;
  value?: string | string[];
  data?: Array<{ value?: string; label?: string } | string>; // select/multiselect options
};

type IntakeFormUi = {
  endpoint: string;
  method: string;
  submit_label: string;
  fields: IntakeField[];
};
```

Fabber's own combined shape for the login journey specifically lives in
`packages/theme-engine/src/types/auth-screen.ts` (`LoginAction`/`LoginField`/
`LoginFormUi`/`LoginScreenPayload`) -- read that file's own header comment before
extending it; it documents exactly which parts are the real sibling-project contract
verbatim and which are this project's own extension.

## What "real" means here -- not a `.ts` function, a network-reachable endpoint

**Real mistake made and corrected live this same session**: an early draft of the
login organism's payload was built by a plain `"server-only"` TypeScript function
called directly inside one Server Component's render (`login-payload.ts`). That
satisfies the CONTRACT SHAPE but not the pattern's actual point -- in every sibling
project, the payload comes from a genuinely separate, independently-fetchable backend
surface (seo-expert's FastAPI `/read/...` family, farmega's own API layer), reachable
by ANY client, not hand-wired to one specific render path. Fixed by exposing a real
`GET /api/login` Route Handler in `apps/account` that both `apps/account`'s own page AND
`apps/web`'s Tier-1 storefront login can fetch (the latter over the internal Docker
network, the same pattern `apps/web/src/lib/themes/current-user-source.ts` already
uses for session reads) -- one real source, not a payload reinvented per consumer.

**A payload built this way is only as "server-driven" as the logic behind it is real.**
Marking every `enabled: true` unconditionally is the correct SHAPE with none of the
SUBSTANCE yet -- only becomes a genuine architectural win once the endpoint actually
has real state to condition on (Better Auth provider config, feature flags, A/B
assignment, maintenance mode). Don't claim the pattern is "done" just because the
types compile; the endpoint's own logic is the part that has to stay honest.

## Component naming -- prefix scope, confirmed against the real source

From `docs/dev/frontend/design-system/inherited-from-nexus/DESIGN-SYSTEM.md`
(read in full, not paraphrased):

- `nx_`/`fb_` prefix is for **wrappers of a single shadcn/Base UI primitive** (decision
  step 2: "Precisa de comportamento, visual ou API [Nexus] padronizada? -> criar
  wrapper `nx_`"). This project's own real instances: `FbEmpty`, `FbErrorState`,
  `FbPageFooter`, `FbPageHeader`, `FbPageSimple`, `FbStatusBadge` (`packages/ui/src/
  components/fb/`) -- all PascalCase `Fb` (this project's TypeScript adaptation of
  Nexus's own Python-style `nx_` snake_case), all in `@fabber/ui`.
- **Compositions of multiple primitives for a recurring domain need (molecules/
  organisms) do NOT take the `Fb`/`nx_` prefix** -- confirmed by this project's own
  existing precedent in `packages/theme-engine/src/components/` (`SocialLoginButton`,
  `AuthMenu`, neither prefixed), which predates this session and already established
  the real convention for that package: plain, descriptive PascalCase. The new
  `login-organism.tsx` and its own molecules (`FeedbackAlert`, `SocialProviderRow`,
  `PinCodeField`) follow the same, already-real pattern -- not a new decision, a
  consistency check against precedent that already existed.
- Decision order stays: (1) shadcn/Base UI primitive covers it -> use directly. (2)
  Need standardized behavior on ONE primitive -> `Fb`-wrap it, lives in `@fabber/ui`.
  (3) shadcn covers it only partially -> compose from existing primitives, lives in
  `packages/theme-engine` if the composition needs app/theme-level data injection
  (payloads, actions), plain descriptive name, no prefix. (4) No viable alternative at
  all -> build from scratch, same location/naming rule as (3).

## Related

- `frontend-design-system/SKILL.md` -- the broader component decision-order skill this
  one extends specifically for the server-driven/API-naming slice.
- `identity-auth/SKILL.md` -- the ADR-009 non-negotiables this contract's real
  first consumer (`LoginOrganism`) must respect (oracle discipline, generic PIN-
  request response, progressive sign-up).
- `packages/theme-engine/src/types/auth-screen.ts` -- the concrete TypeScript contract
  for the login journey specifically, with full sourcing in its own header comment.

## Rebuild-from-zero — the SSD question, applied here

A route is only real if the rebuilt system serves it. Ask the mantra in
`worker-prompt-template.md` §8: if the SSD burns and the environment is rebuilt from zero with only
the initial secret, does this come back on its own, by which task/deploy/start? For
this contract that means the Route Handler ships inside the app image and its upstream
is named in versioned config the deploy applies. A route that answers only because
someone registered a rewrite, a proxy entry, or a Caddy matcher by hand is a defect —
and so is a payload that depends on state only the current container holds.
