# Module — injected UI, gate patches, feature flags & browser extensions

> **Related:** `stubs-and-mocks`, `auth-bypass`, `vanilla-static`, `nextjs-ssr`, `e2e-verification`.
> Covers the **artifacts we build and inject** into a mirrored or live page, and the client-side
> gates/flags we flip to explore the app.

## What it covers

Four techniques that recur across the extractions, all "we change the page from outside the app":

1. **Chrome extension as an engagement artifact** — a re-loadable unlock/overlay extension.
2. **Injected UI/script** via CDP or a userscript (widgets, toggles, gate patches).
3. **Feature flags / betas** — force every flag to explore UI that is off by default.
4. **Profile/role selector** — a multi-portal shim for apps with several roles in one bundle.

## Why (the incidents)

- **The paid endpoint / gate is what matters, not the UI.** A client-side entitlement gate whose
  **endpoint answers anon** is a real bypass; the extension only reveals it. The extension/mock is
  **cosmetic** when authz is server-side (`security-testing/defensive-posture`). Record the control,
  not the trick.
- **Flags are not routes.** In one app we injected a duplicated "Beta" menu before realizing the
  betas are **feature flags**, not routes — forcing the flag is the correct move, and the effect
  often only appears **with data**.
- **Gates can be client-side *and* mirror-only.** One Next.js admin link appears when the client gate
  passes, but the **route HTML is server-rendered and 302s** for a non-admin → not capturable by
  emulation (`clerk-auth`/`nextjs-ssr`); the fix is a real (admin) session, and document it as a dead end.

## How to do it (and what bites)

**Extension (MV3):** `manifest.json` (v3), a content script registered at **`document_start`** with
`"world": "MAIN"` when you must patch the page's own JS. `options_page` with a **per-domain** match
(`*://*.example.com/*`) so the same extension works when the mirror URL changes; ship a card in the
hub and a `.zip`. **Chrome ≥137 stopped honoring `--load-extension`** in many builds — load the
unpacked folder explicitly or use the pairing flag; test with a throwaway profile.

**Injected script gotchas (all seen live):**
- **Regex in a template literal**: `\s`/`\.` must be escaped (`\\s`/`\\.`) or the injected JS is invalid.
- **`MutationObserver` loop**: re-injecting on every mutation re-triggers itself — add a `busy` guard
  and make the injection **idempotent** (a sentinel attribute/`data-` marker).
- **Invalid DOM nesting is silently dropped**: a `<td>` written into `<thead>` disappears.
- **React re-render removes your node** — reinject on route change, or hook the framework's render,
  not a one-shot.
- **`location.hostname` is unforgeable** — if the app enables a dev-mode by hostname, an extension
  cannot override it (a prototype trick fails); patch the **gate in the bundle**, not the location.
- **Patch the gate, not just the mock**: a route guard may pass (`is_admin`/`isAdmin` true) while the
  **page itself** checks a profile field (`role`) or a permission module list — patch both the guard
  input **and** the profile shape the page reads.

**Feature flags:** grep the bundle for the flag names; force them **all** true in the mock/storage and
re-render. A flag that only affects a route that also needs a **permission** module needs both.

**Profile/role selector — MANDATORY when the app has more than one role (automatic, see `SKILL.md`
§7.2).** For multi-portal SPA/vanilla apps, reimplement the boot to read a role key
(`localStorage.<role>`/cookie) and render a **top selector** (Visitante / Membro / Parceiro / Admin;
or customer / merchant / admin). One click switches menu + data, no re-login. Enumerate the roles
from the bundle (role literals, menu conditions, `is_admin`/`plan`/`user_access`). Fallback when the
role is server-bound: a dedicated session/port per role. This makes one mirror testable across every
role — and it is exactly the client-side gate the security side tests for absence
(`security-testing/client-supplied-identity`).

## What "done" means

- The artifact (extension / injected script / selector) is **reproducible**: source in the repo, a
  README, and the load command.
- Gate/flags forced are **named** (which field/flag, which input the page reads) — not "we made it show".
- The mirror documents which gates are **client-side (emulable)** vs **server-side (need a session)**.
- When the trick is on the **live** target, the corresponding security claim (cosmetic vs real bypass)
  is recorded in the report, not just the demo.

## Known pitfalls

- **A visible admin/gate is not a bypass** — check the server response before claiming one
  (`security-testing/defensive-posture`).
- **Flags forced ≠ data present** — an unlocked screen can render empty; that is not a broken mirror.
- **`--load-extension` may be ignored on recent Chrome** — verify the extension actually loaded (SW
  present) before debugging the injected logic.
- **Referrer/cookie scope**: injected code runs in the page's origin; a cross-origin fetch needs CORS
  or the page's own session — prefer in-page `fetch` with `credentials:'same-origin'`.
- **Do not ship a raw secret in the extension** — a key/token in the artifact is a leak
  (`security-testing/secrets`).
