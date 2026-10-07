# Module — secrets exposure

> **Related:** `baas-direct-exposure` (what the public client key can *reach*), `ci-gates`
> (gitleaks/history), `headers-cookies` and `auth-identity` (a leaked value is only
> exploitable with a sink).

## What it tests

Whether a secret is reachable by someone it was not issued to. Five surfaces, in
descending order of how often they are the real one here:

1. **The transcript** — an agent's own tool output (`cat`, `env`, `wp config get`,
   `docker exec … printenv | grep`). This is where every real leak in this project has
   happened.
2. **The client bundle** — a key that was supposed to be server-only, inlined at build
   time.
3. **The artifact** — a `.map`, `.env`, `.pem`/`.key`, or `id_rsa` that reached the
   image or the served build.
4. **The repository** — a value committed, now or in history.
5. **The response** — a secret echoed in an error body, a debug page, or a header.
6. **The dataset** — a *product asset* (a catalog, pricing table, curated seed) shipped
   inside client JS. Not a secret, but downloadable with no auth and no API call, which
   is the same delivery channel a secret would use. See the bundle note below.

## Why

**The transcript class, from our own incident.** Every real secret exposure in this
project happened at the transcript level — an agent echoing a value through `cat`,
`wp config get`/`wp config list`, an unredirected `wp config set`, or
`docker exec … printenv | grep`. `FABBER_ACCOUNT_OIDC_CLIENT_SECRET` was rotated
**three times in one day** during the ADR-009 rollout for exactly this, one of them a
second time on the same day the mistake was first written up
(`.claude/skills/identity-auth/SKILL.md`, citing `docs/dev/prompts/LESSONS-LEARNED.md`
#52).

Two consequences, both structural:

- **gitleaks cannot see this class.** It only ever sees what is staged for a commit,
  and none of the above ever reaches a commit — `.claude/skills/git-workflow/SKILL.md`
  says it plainly: gitleaks is the **last** line of defense, not the first. What
  actually prevents the class is the discipline in `docs/dev/prompts/TEMPLATE.md` §3
  and the mechanical `PreToolUse` hook
  (`docs/dev/security/secret-leak-prevention-hook.md`).
- **A leaked value is a rotation, not a note.** "It was only dev" is not an exception
  (`identity-auth/SKILL.md`).

**The artifact class, with its own spec and gate.** `INV-CI-2` — *the production
artifact contains no source, no secret, and no map* — exists because of a real
incident elsewhere in the ecosystem: a 59.8 MB source map with ~512k lines of
proprietary TypeScript was accidentally published to npm (`ci-security-spec.md` §1).
The lesson is artifact hygiene: what ends up in the build/image/deploy. Our gate is the
`artifact-hygiene` job in `.github/workflows/security.yml` ("No secret/key material
tracked in git", "Production build checks (source maps, pinned image tags)").

**The bundle class, with a rule and a mechanism.** `INV-SEG-2` —
`NEXT_PUBLIC_*` only for a value that could be on a billboard; it is inlined at build
time, so once published it is published (`security-spec.md` §2.2). A client-side
database key is the sharpest form this takes: two audited SPAs shipped a Supabase anon
key in their bundles and an unauthenticated RPC behind it returned ~9,729 users'
e-mails (`FRAGILITIES-CATALOG.md`; `security-spec.md` §9 — "the public key wasn't the
hole; the missing authorization was"). The anon key alone was not the vulnerability —
it was the thing that made the missing authorization reachable.

**The response class.** A debug/error surface that echoes configuration is a finding
even when the value is expired.

**The dataset class — the bundle as a delivery channel for an asset, not a secret.** The
most recent audited SPA shipped its ~3,500-item filament catalog **inside a client chunk**
(1.8 MB), so the catalog was downloadable with no login and without ever touching its API —
the column-exposure product *was* the exposure (`FRAGILITIES-CATALOG.md`, PrintCal P8).
Whether this is a finding depends on the source, and the distinction is the whole module:
a catalog seeded from an open database is provenance, a curated proprietary one is an asset
leak. The check is cheap and belongs in the same pass as the secret grep: measure what a
chunk ships. (Note the shape, not the data: the count and the source field, never the rows.)

**A scanner's blind spots are part of the scanner.** `MEDIUM-2` found `.gitleaks.toml:19-27`
excluding `config/secrets.toml` **by whole path**, in both the hooks and CI — so the one
file every rotation edits is the one file never scanned. The comment justifies it as
"structurally incapable of holding a real secret" (a convention: `op://` locators only),
which nothing enforces; **a convention that only a comment enforces is exactly what a
A **variante pior** é uma allowlist de padrão **genérico** (ex.: shape de chave WooCommerce): ela passa
silenciosamente **toda** credencial futura daquele formato. Nunca silenciar a regra para o próprio valor
passar — remover o valor. (fonte: fabber/HANDOFF-HISTORY.md:7256,7258, fabber/DELIVERED.md:5,6)
scanner exists to backstop.** Read the allowlist and name what it covers, or the clean
full-history result below is a statement about a smaller repo than you think. The rest of
the posture is strong and verified: gitleaks 8.30.1 in `.githooks/pre-commit:15-36`,
`.githooks/pre-push:38-57` and `.github/workflows/security.yml:138-152` (`fetch-depth: 0`),
failing loud rather than skipping when the binary is missing; a full-history scan of
**1,251 commits (14.54 MB)** with no leaks; no `.env` git-tracked; and `apps/id/Dockerfile:97-104`'s
secret-shaped `ENV` values are explicit `build-time-placeholder…` strings verified absent
from layers.

**A credential whose name lies about its scope is its own class.** `MEDIUM-3`:
`GITHUB_ACTIONS_READONLY_TOKEN` resolves to a **full-scope classic PAT** (repo write,
`delete_repo`, `admin:org`), and its `notes` still claim "scope `repo` only" while its own
comment says the opposite — the entry contradicts itself, and two `[secrets.*]` names point
at the same `op://` path with opposite-sounding labels. Nothing here is a leaked value; the
finding is that **the register cannot be trusted to tell you what a credential can do**,
which is what makes least-privilege review impossible. `config/secrets.toml`'s own wording
for the mistake is "overloads the name's own honesty" — treat a name/scope mismatch as a
finding on its own, and never let a read-only-sounding name justify reusing a token on a new
consumer (the third consumer here, `infra/compose/ci-runner.env.tpl:11-23`, sits inside a
container that mounts the host Docker socket).

## How to verify

```bash
# 1. The transcript class — prevention, not detection. Check the mechanism exists:
grep -rn "PreToolUse\|secret" .claude/settings.json docs/dev/security/secret-leak-prevention-hook.md | head

# 2. Repository + history (the gate, and what it covers)
gitleaks git . --exit-code=1 --redact -v          # full history, not just the diff

# 3. The bundle — patterns worth grepping, on a LOCAL BUILD, never on a live chunk
#    (see "Known false positives": never print the match)
grep -rlE "sk_live_|service_role|DATABASE_URL|PGPASSWORD|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-" \
  apps/web/.next/static apps/id/.next/static 2>/dev/null

# 3b. The dataset surface — how much of a product asset ships in the client?
#     Count a record key; report the FILE + COUNT, never the records.
for f in apps/web/.next/static/**/*.js; do
  n=$(grep -o '"<record_key>":' "$f" | wc -l)
  [ "$n" -gt 100 ] && echo "$(basename "$f"): $n records"
done

# 4. The artifact
grep -rIl --include='*.map' . apps/web/.next apps/id/.next 2>/dev/null
find apps -name '.env*' -o -name '*.pem' -o -name '*.key' -o -name 'id_rsa' | grep -v node_modules

# 5. What the scanner is told to ignore (its blind spots are part of the scanner)
sed -n '1,40p' .gitleaks.toml            # MEDIUM-2: secrets.toml excluded by whole path
# 6. Does a credential's NAME match its SCOPE? (never print the value — read the register)
grep -n "op://\|notes = \|^\[secrets\." config/secrets.toml | head -40
```

Reading a secret **the safe way** is itself part of the test: filter to the single key
you need, compare `sha256` hashes rather than printing, and take the value through
`op run --env-file=…` so it never enters a command string
(`.claude/skills/stack-access-and-operation/SKILL.md`, "Reading secrets without leaking
them"). A verification step that leaks the value it was verifying is a worse outcome
than the finding.

**The technique worth stealing from the external kit, and the flaw to fix while
stealing it.** Its passive recon script greps chunks for a good pattern list
(`sk_live_`, `service_role`, a JWT-shaped key, `DATABASE_URL|POSTGRES_URL|PGPASSWORD`,
`AIza…`, `xox[baprs]-`) — and then prints `match.slice(0, 40)`, i.e. **the first 40
characters of the secret it just found**, into the report
(`tools/method/pentest/recon-passive.mjs`). Report the **file and line**, or a hash — never
the value. That script is a negative example for this module, not a template.

## What "covered" means (with evidence)

- **The `artifact-hygiene` and `secrets-gitleaks` CI jobs exist and are blocking**
  (`INV-CI-1`; `.github/workflows/security.yml`), with a run id showing them green on a
  commit you can name — and a demonstrated red run from a planted test value, because a
  gate nobody has seen fail is not evidence (see `modules/ci-gates.md`).
- **A local production build inspected for maps and key material**, with the command
  and its output — not an assumption that Next's defaults hold
  (`productionBrowserSourceMaps` is not currently set in `apps/web/next.config.ts` —
  checked 2026-09-21; relying on Next's default is not a control).
- **Every `NEXT_PUBLIC_*` in the tree has a one-line justification** of why it could be
  on a billboard (`INV-SEG-2`). This is the cheapest complete check in the module.
- **The transcript class has a named mechanism**, not a hope: the hook plus the
  contract, and a rotation path for when it fails anyway.
- **A clean report states the hash-comparison method used**, so the next reader knows
  the values were never printed.

## Known false positives
- **E-mail ofuscado (Cloudflare `data-cfemail`) não é privacidade** — a decodificação é trivial; e um
  **contato público não é vazamento**. Não reporte nenhum dos dois como exposição. (fonte: docs/security/ecommerce-pro-lessons.md:53)

- **A public-by-design key is not a leak** — the audited catalog's own note is
  "the publishable key is fine, the secret key is not". Our equivalent distinction:
  a `NEXT_PUBLIC_*` value on the allowlist is expected; anything else inlined is not.
- **An over-scoped credential that never reaches a client is debt, not a leak** — and the
  distinction decides both severity and who fixes it. `MEDIUM-3`'s full-scope PAT is
  reachable only from server-side code that never returns it, is operator-approved and
  registered, and has a **verified** replacement path deferred to post-v1.0.0. Filing it as
  an exposure would be wrong; filing it as "fine" would also be wrong, because it now backs
  a **publicly reachable** endpoint (`HIGH-2`). Say which half is which.
- **An unverified captcha is not a control** — `HIGH-4`'s Turnstile widget exists as IaC
  with no server-side verification anywhere in `apps/id`. A secret-scan-style checklist
  passes it; the check that fails it is "is this value *consumed*?" (see
  `modules/auth-identity.md`).
- **A grep hit is not a leak until you know what it is** — and you must find out
  *without printing it*. `sk_live_…` in a fixture, a doc, or a test is still a
  finding if the value is real; it is not if the value is a placeholder. Distinguish by
  hashing the known real value and comparing, or by checking the source of the string.
- **`wp-config-sample.php`** reads like an exposed config and is a template; it is
  blocked at the edge anyway (`@blocked_sensitive` in `infra/docker/Caddyfile`).
- **A `/.env` request answering `200`** is not necessarily a dump — in the audited
  catalog it returned the framework's own 404 page with a `200` status. Confirm the
  **content-type and body**, and note that it should still be a real `404`.
- **Source maps on a private dev/staging host** are a lower-severity finding than on
  production; classify per target (`SKILL.md` §3), and only if the artifact actually
  serves them.
- **An expired or rotated value is still a finding** in the report (it was exposed) —
  but its severity is "was live", not "is live". Say which, with the date.
- **A dataset in the bundle is only an asset leak if the source is not public.** A seed
  derived from an open database (e.g. a public filament/parts catalog) is provenance; a
  curated proprietary catalog, a pricing table, or customer-derived data is the asset.
  Record the file, the item count, and the record's `source` field; the finding is the
  proprietary ones, and the fix is to serve them from an authenticated, rate-limited
  endpoint instead of the bundle.
