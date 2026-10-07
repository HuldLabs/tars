# Module — injection (SQL, command, template, path)

## What it tests

Whether any request-reachable path lets caller-controlled data change the *structure* of
a query, a command, a template, or a filesystem path — as opposed to travelling as a
value.

Four sub-classes, in the order they matter for this repo:

1. **SQL** — string-built queries, especially the parts that **cannot** be parameterised.
2. **Command** — `exec`/`spawn`/`execSync` with any caller-derived argument.
3. **Template** — user data rendered into a template/HTML with escaping turned off.
4. **Path** — a caller-derived filename reaching `open`, `readFile`, `include`, or an
   upload destination.

## Why

**SQL — the method, not a scare story.** The 2026-09-21 pass over this repo ended in a
*negative* result that is worth more than a positive one would have been, because of how
it was produced: it enumerated **every** place the repo builds SQL and classified each —
5 query sites in `fabber-cve-monitor.php` (588, 624, 882, 921) and
`fabber-sku-generator.php:225` all going through `$wpdb->prepare`, with `LIKE` going
through `$wpdb->esc_like`; the only unprepared call being the literal `SELECT 1` in
`fabber-health-check.php:65`; `apps/id` binding values with `?`; the Python f-strings
interpolating only config-derived table prefixes and DB names, with the one id list
int-cast (`modules/seed/anonymize.py:136`) (`docs/dev/security/external-benchmark-audit-2026-09-21.md`).

That exhaustive shape is the technique this module exists to preserve. "We reviewed the
queries" is not a result; "here are all nine sites and what each one does" is.

**The two hardening items it left behind are the reusable lessons:**

- **A TypeScript union type is not a runtime check.** `resolveCanonicalEmail`
  interpolates `${column}` into the query *identifier* position — the value is bound with
  `?` (`:39`), the column name is not. What actually constrains it today is narrower and
  worth stating precisely rather than hand-waving: `column` only ever comes from
  `normalizeIdentifier`'s **code literals** (`identifier.ts:73,77,80`) or string literals at
  the call sites. That is a real constraint, and it is still not one a runtime attacker has
  to respect, because a future caller passing a request-derived string would break it with
  no compile error to stop them. This is the general trap: **identifiers (column, table,
  direction, JSON path) cannot be bound as parameters**, so they are exactly where injection
  survives even in an otherwise parameterised codebase.
- **A hand-rolled escape is a dependency on someone else's config.**
  `core/data/mysql.py`'s `sql_escape` uses backslash escaping, which is correct *only*
  while the restoring server's `sql_mode` does not include `NO_BACKSLASH_ESCAPES`.
  Offline tooling, safe with today's callers — but correctness that depends on a remote
  server's configuration is a latent finding, not a fixed one.
- **In WordPress, the injection-adjacent gate is nonce + capability — check both.** The
  audit's clean table is explicit about this surface because it is where a WP plugin
  normally leaks: *every* state-changing handler in the custom plugins checks a nonce
  (`check_ajax_referer`/`check_admin_referer`) **plus** `current_user_can`, and inputs pass
  `sanitize_text_field`/`sanitize_key`/`absint`/`intval`. A nonce alone is CSRF protection
  against an anonymous caller, not authorization — `fabber-cve-monitor`'s
  `handle_review_submission` inherits `manage_options` from its only caller, `render_tab`
  (`:659`), which is exactly the inheritance pattern to verify rather than assume. Grep for
  handlers with a nonce and no capability check, not just for `prepare()`.

**Command injection, our own incident class.** The `/api/auth/migrate` route ran
`execSync("npx @better-auth/cli migrate -y")` and was publicly reachable with no auth —
a trivial DoS surface, found during an adversarial review of something else entirely
(`CLAUDE.md`, "Never bypass automation manually"). Any `execSync` in this repo is worth
the same question.

**Path traversal / upload.** `fabber-svg-uploads` accepts SVG uploads **without
sanitization** — an accepted, documented risk (`wordpress-customizations.md` §13, cited
in `infra/docker/Caddyfile`). The adjacent control in place is that no PHP executes
inside `wp-content/uploads/` (`@php_in_uploads` → 403), which closes the "renamed file
executes via `php_fastcgi`'s extension-global match" vector. Both halves belong in the
report: the accepted risk and the control that keeps it contained.

## How to verify

```bash
# Every place a query is constructed
grep -rn "\$wpdb->\|\bprepare(\|->query(\|mysqli_\|execute(\|text(" --include=*.php --include=*.ts --include=*.py .
# Identifier-position interpolation (the part parameters cannot cover)
grep -rn '\${\(column\|table\|order\|direction\|sort\)\|FROM {\|ORDER BY {\|LIMIT {' --include=*.ts --include=*.py .
# Command execution
grep -rn "execSync\|exec(\|spawn(\|shell_exec\|system(\|passthru\|popen" --include=*.php --include=*.ts --include=*.py .
# Escaping that assumes a sql_mode / charset
grep -rn "sql_escape\|addslashes\|NO_BACKSLASH_ESCAPES" .
# Unsanitized sinks
grep -rn "dangerouslySetInnerHTML\|innerHTML\s*=\|v-html\|\.raw(" apps/
# WordPress state-changing handlers: nonce WITHOUT a capability check is the gap
grep -rn "check_ajax_referer\|check_admin_referer\|current_user_can\|permission_callback" \
  --include=*.php infra/docker/wordpress/custom-plugins/
```

Then, for each hit, classify it as exactly one of: **bound** / **literal** /
**config-derived** / **caller-derived**. Only the last one is a finding; the middle two
are the evidence trail that makes the clean result credible.

Reachability is part of the classification: `modules/backup/`, `modules/seed/`,
`core/data/` and `infra/pyinfra/` are offline tooling — that lowers severity, it does
not make the interpolation acceptable, and it must be stated per site rather than
assumed for the whole directory.

## What "covered" means (with evidence)

- **Every SQL-building site enumerated with its classification**, including the clean
  ones, with `file:line` — the audit addendum's table is the template.
- **Every identifier-position interpolation has a runtime allowlist**, or a written
  statement of what constrains it. A comment saying "only ever called with literals" is
  a weaker answer than `if (!["a","b"].includes(x)) throw`, and should be recorded as
  such.
- **Every `exec`-family call accounted for**, with the argument's provenance stated.
- **For a negative result, the enumeration is the evidence.** No enumeration, no
  "clean" — a partial grep that found nothing only proves the pattern was wrong.

## Known false positives

- **f-string SQL that interpolates only config values** (table prefix, DB name) — not a
  finding on its own; a finding the moment a caller-supplied value joins that string.
- **`LIKE` with an escape helper in one branch and a bound parameter in another** — read
  both branches; the unescaped one is where the wildcard injection lives.
- **A driver that looks like concatenation.** Template-literal query builders that
  actually emit placeholders (many TS query builders do) read as string building in a
  grep and are not injection. Open the library call before writing the finding.
- **`sql_escape`-style helpers** are not automatically findings — the finding is the
  *dependency* (a server-side `sql_mode`, a connection charset), and its severity
  depends on whether anything request-reachable reaches it.
- **Escaping is not the only control:** a caller-derived path value that is validated
  against an allowlist by an earlier gate is covered at that gate, not here — say which
  layer holds the property so the next reader does not double-count it.
- **Command injection in our own tooling (secrets wrapper):** a wrapper that re-joins `argv`
  into a string and runs it with `shell: true` executes any metacharacter (`;`, `|`, `$( )`,
  backticks) in an argument — and in a secrets wrapper the injected command inherits the
  decrypted secrets in its environment. Control: spawn with `shell: false` and the argv array
  intact; prove with a test that `$(touch /tmp/pwn)` and `; id` arrive as literals. Sweep for
  every `shell: true` / `execSync(<built string>)` in the repo, not just the reported one.
