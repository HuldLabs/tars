---
name: telemetria
description: How telemetry works in the framework — it is a CORE capability exposed as hooks (before/after/failure) and a neutral port ctx.telemetria (evento/medir/span) that is a no-op by default; the implementation (OTel) is a PLUGIN that subscribes to those hooks. Covers the naming scheme, the off-by-default budget, the collector as the only place for dedup/sampling/alerting, the no-secret/no-PII allowlist, and the acceptance test (off emits nothing; behavior identical on/off). Load BEFORE instrumenting a route, job, CLI, event or module action.
---

# Telemetry

**Telemetry is a capability of the CORE framework — not a library the core knows.** The
framework does not import OTel; it offers **hooks** and a **neutral port**, and the
implementation arrives as a **plugin** that subscribes. This is the pluggability doctrine
(R1) applied to observability: the seams exist everywhere, the vendor lives nowhere in the
core.

## 1. Emit through the neutral port — `ctx.telemetria`

Every surface the framework registers exposes the port on its context:

```js
ctx.telemetria.evento('<modulo>.<coisa>', { /* atributos */ })   // an event happened
ctx.telemetria.medir('<modulo>.<coisa>', valor)                  // a measurement
ctx.telemetria.span('<modulo>.<coisa>', async () => { /* ... */ }) // a unit of work, timed
```

- **The port is a no-op by default.** With nothing plugged in, `evento`/`medir`/`span`
  return immediately and `span` just runs the callback. No side effect, no allocation worth
  naming, no branching in the caller.
- **The caller never learns who is listening.** Core, modules and plugins call the port and
  stop there — they do not know OTel, a vendor, an exporter or a collector exists.
- **Nothing to emit, nothing to pay.** With telemetry off, the cost is ~zero and the
  behavior is **identical** — this is a budget rule, not a courtesy (see §6).

## 2. The hooks are the seam: before · after · failure

The framework **registers** everything through a hook bus; telemetry subscribes to the
same bus as any other extension. Every registered surface fires all three:

| hook | fires | carries |
|---|---|---|
| **antes** | before the action runs | the action id, the input shape (never raw secrets) |
| **depois** | after it returns | the action id, outcome, duration, result shape |
| **falha** | when it throws | the action id, the error class, duration |

- The surfaces are the framework's own: **rota, job, CLI, evento, ação de módulo** — and the
  naming is uniform, `<modulo>.<acao>` (§3).
- The hook contract is **symmetric**: an extension that adds telemetry is indistinguishable
  from one that adds logging or an audit trail. The core gains a subscriber, not a codepath.
- A failed action **always** fires `falha` before the error propagates — telemetry never
  swallows the error, and never hides one it caused.

## 3. Naming: `<modulo>.<coisa>`, official semconv

- Every event, measure and span is named **`<modulo>.<coisa>`** — `<modulo>` is the owning
  module, `<coisa>` is the thing (`pedido.criado`, `job.executado`, `cli.rodou`,
  `evento.recebido`). The name is **stable** and the contract, not the payload.
- Standard attributes use the **official semantic conventions** of the ecosystem where they
  exist (`service.*`, `http.*`, `db.*`, …) — do not invent a private name for a concept the
  convention already names. Custom attributes are namespaced under the module.
- **Dots, lowercase, stable.** No spaces, no free prose, no timestamp or id embedded in the
  name — those are attributes. A name that encodes data cannot be aggregated.

## 4. No secret, no PII — allowlist in the plugin

Attributes cross a boundary; treat them as output.

- **Never** emit a secret, a token, a credential, a raw request body or PII. The rule is not
  "be careful" — it is **structural**: the plugin holds an **allowlist** of attribute keys it
  accepts; anything not on the list is **dropped**, not passed.
- Identifiers (a user id, a tenant id) go in only if a decision needs them **and** they are
  declared — otherwise they are a leak with a nice name.
- The core and the modules **do not sanitise**; they call the port with the shape the
  allowlist understands. Sanitising in the plugin (one place) beats remembering in every
  caller (SSOT).

## 5. The collector owns dedup, sampling and alerting

**The app emits. The collector decides.** Everything downstream of the port is the
collector's job — never the app's.

- **Dedup, sampling and alerting live in the collector**, not in the core, not in a module,
  not in the plugin's emit path. Putting them in the app means every app reimplements the
  policy and every change is a redeploy.
- **Third-party apps reach the collector only through the collector** — they do not write to
  the backend directly. One front door, one policy.
- **The collector is outside and its failure does not take the app down.** Telemetry is
  best-effort: if the collector is unreachable, the app behaves exactly as if telemetry were
  off. An observability outage must never become a product outage.
- Alerting is keyed to the **service's own failure signal** (the framework's failure hook),
  not to someone remembering to add an alert for each new surface.

## 6. Acceptance criterion (falsifiable)

Two tests, both required, both cheap:

1. **Off emits nothing.** With telemetry not plugged in (the default), the port produces no
   event, no measure, no span and no I/O — instrument the surface, assert nothing is emitted.
2. **Behavior is identical on and off.** The same action, run with and without the plugin
   plugged in, has the **same observable outcome** — same result, same error, same order of
   side effects. Instrumentation is not allowed to change what the app does.

A telemetry change that cannot pass both is a behavior change wearing a telemetry label.

## 7. Toggle: per app, per module, per plugin — on the ficha

Telemetry is enabled **by declaration on the ficha** — at the **app** level, the **module**
level and the **plugin** level — and off is the default everywhere.

- Turning it **off** must be a real zero: ~zero cost and **identical behavior** (§6). If
  disabling it changes what the app does, it was never a plugin.
- Turning it **on** for one module and not another is expected: the ficha declares the
  scope, the plugin obeys.
- The toggle is **data**, not a code branch scattered through the app. One declaration, one
  reader (SSOT).

## 8. The implementation is a plugin — the core never imports an SDK

- **Core, modules and plugins never import an OTel SDK.** The SDK lives **only** in the
  telemetry plugin, which subscribes to the hooks and calls the port's underlying transport.
- Replacing OTel with anything else replaces **the plugin**, not the framework: this is the
  test that the seam is real.
- The plugin is a **subscriber**, like any other extension — it does not get a special
  codepath in the core, and the core has no compile-time or runtime dependency on it.

## Checklist before instrumenting

- [ ] Emitting through `ctx.telemetria` (`evento`/`medir`/`span`), never a vendor SDK.
- [ ] Name is `<modulo>.<coisa>`; conventional attributes use the official semconv.
- [ ] Attributes pass the plugin's **allowlist** — no secret, no PII, no raw body.
- [ ] Failure path fires the failure hook; the error still propagates.
- [ ] Toggle is declared on the ficha (app/module/plugin); off = ~zero cost, identical behavior.
- [ ] Test 1: off emits nothing. Test 2: behavior identical on/off. Both green.
- [ ] Dedup/sampling/alerting are in the collector, not in the app.
- [ ] The app keeps working when the collector is down.
