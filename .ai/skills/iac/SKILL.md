---
name: iac
description: How to write infrastructure as a declaration — the ficha/host file is the single source of what exists, each recipe ends with a check that fails LOUD, what is manual is written down as manual, and bootstrap (provision the machine) is separated from reconciliation (keep it in the declared state). Covers FQDN over IP, aliases as versioned code, and receipts that prove instead of just run. Load BEFORE writing any deploy recipe, host manifest, provisioning script or GitOps loop.
---

# IaC — infrastructure by declaration

> **Origem (R1):** portada de `homelab-infra/README.md` + `docs/decisoes.md` +
> `.../gitops-docker.md`; a escolha pyinfra+Pulumi vem do **Fabber** (a ideia, nunca
> credenciais/hosts). Nenhuma skill equivalente existia em `/projects/*/.ai/skills`,
> `/projects/*/.claude/skills` ou `/projects/fabber*`. Registro em `docs/CURATION.md` §3.

**A declaration is the single source of what exists.** Everything below follows from
taking that sentence seriously: the machine, the deploy and the check all read from the
declaration, and nothing lives only in someone's head or in a web panel.

## 1. The ficha/manifest is the single source

- The declared set (a host file, a manifest, a config) is **what exists**. What is not
  declared is treated as drift or as garbage — never as "oh, that one we set up by hand".
- Each host/context has its **own ficha**, and the ficha is both **inventory and manifest**:
  it lists what is there *and* drives the recipe that puts it there. One artifact, two
  readings — so they cannot disagree.
- The declaration is **versioned**. "What the infra looks like" is a decision with a history
  and a reason; a change to it shows up in review like any other change.
- **Reconciliation** compares the world to the declaration and reports both directions:
  declared-but-missing (a regression) and present-but-undeclared (a discovery — declare it or
  remove it). This is what keeps the declaration honest as the world changes underneath it.

## 2. FQDN, never IP

- Refer to a service by its **name** (FQDN), not its address. The address is where it
  happens to be today; the name is what it *is*. Hard-coding an address bakes a snapshot of
  the network into every dependency.
- Internal DNS is its **own single source** — the resolver config declares the names, and
  everything else consumes them. Nobody re-types the list in a second place (that second
  place is the one that goes stale).
- A UI/panel alias is **versioned code**, not state living in the panel's database. What is
  clicked into a web form cannot be reviewed, diffed or restored; what is in the repo can.

## 3.1 The release channel decides which tag is served

Production serves the **stable tag**; a pre-release needs an explicit guard to be served
at all. The failure mode is not a bad build — it is a bad build reaching the consumers
on its own, because the channel that should hold it back is the same knob the new tag
moves.

- The stable channel stays on the stable tag. A pre-release ships only with a deliberate
  opt-in that names it, and the opt-in is per deploy, not a default that changed once.
- A pre-release tag that becomes "the latest" without that opt-in is a defect in the
  publisher, not a judgment call for the operator noticing it late.
- Say which channel a recipe targets: a small install and a production rollout are different
  recipes — the second one's check must also assert the tag served, not only that the
  service answers.

## 3.2 A PoC with a fixed tag and a named volume survives the bump

A PoC exists to compare versions; if the bump destroys the setup, every iteration starts
from zero and the comparison is between two hand-built environments instead of two
versions.

- The PoC pins a **fixed tag** (not `latest`) for the old version and keeps its **named
  volume**, so the new version can be measured against the same data without rebuilding it.
- The volume is **named on purpose**, so the next bump does not silently inherit the
  previous run's state and read as "the new version behaves identically".
- The setup is rebuildable from the declaration (bootstrap above); the pinned tag and volume
  make the *comparison* repeatable, not the install.

## 3. A recipe ends with a check that fails loud

**"It ran" is not "it worked".** Every recipe closes with a check that **fails** if the
declared state was not reached — connection established, service answering, resource
present. Exit 0 from the last command in a script is not a proof.

- The check asserts the **outcome the ficha declares**, not that the steps executed. A
  recipe that ran all its steps and left the service down must exit non-zero, naming what
  is missing.
- Checks are **cheap and local** to the recipe — the point is that the recipe cannot lie
  about its own result.
- A recipe without a check is a plan, not a delivery. (R4: fail fast and loud.)
- **`--version` is not a healthcheck (ported from `coleta-homelab` #12).** A binary
  answering its own version proves the file is on disk and the interpreter starts — it
  passes identically on a crash-looping service, a service stuck on a bad config, or one
  listening on the wrong port. The check that counts **exercises the function**: a
  `GET /healthz` from **inside** the container (asking from the host proves the publisher,
  not the workload), and the post-apply step **asserts** the answer, exiting non-zero
  naming what was missing.
- **The assertion lives in the post-apply, not in the operator's eyes.** "I watched the
  apply finish and it looked fine" is the manual version of a check that never runs again.
  The recipe's last step is the assertion, so a drift the next apply introduces fails on
  its own, without anyone re-reading a log.

## 4. Bootstrap ≠ reconciliation

Two different jobs, two different tools — do not merge them.

- **Bootstrap** provisions the machine: the base OS state, the packages, the things that
  exist *before* the workload can run. It runs rarely, on a fresh host.
- **Reconciliation** keeps the workload in the declared state, continuously — it is the
  loop, not the install. It assumes a bootstrapped machine and converges from there.
- They fail differently and are debugged differently: a bootstrap failure means the machine
  is not ready; a reconciliation failure means the machine drifted. Merging them makes a
  drift look like a fresh install and re-runs bootstrap on a running host.

## 5. What is manual is written down as manual

- Anything a human must do (a one-time approval, a DNS record at a registrar, a physical
  action) is **explicit in the doc**, with the reason it cannot be automated. Hidden manual
  steps are the ones that surprise the person doing the recovery at 3am.
- The doc distinguishes **automated** (the recipe does it) from **manual** (a human does it)
  for every step — a reader must be able to tell without running anything.
- Manual steps that recur are automation that has not been written yet; name them, so the
  debt is visible.

## 6. Secrets never enter the declaration

- The ficha declares **which** secret is needed and **where** it comes from (the port to the
  secrets layer), never the value. The declaration is versioned; a secret in it is a leak
  with a commit history.
- A recipe reads the secret at run time from the secrets layer, same as any other process —
  it does not template it into a config file that then sits in the repo.

## 7. The barrier is mechanical, not memory — fix the mechanism before the recipes

- **The mechanism comes first.** When a class of failure shows up (a recipe that skipped a
  contract, an apply that left the host wrong), build the **mechanical barrier** before
  writing more recipes: the ficha's schema, contract tests on every recipe, a gate that
  refuses commit/push/apply with a red suite, and a **post-apply proof**. Fixing the recipes
  one by one while the mechanism stays weak reproduces the same class on the next host.
- **Post-apply proof, not pre-apply intention.** The recipe asserts the declared state
  *after* applying, in the same run that applied it (§3) — a later human check is not the
  barrier.
- **Periodic rebuild rehearsal.** A recipe exercised only when a host is born has rotted
  without saying so. Rehearse the rebuild on a schedule, so the drift between "what the
  ficha declares" and "what actually rebuilds" is measured, not assumed.
- **Reopening trigger.** An adoption decision carries its **explicit reopening trigger**
  written next to it — the condition that would make it wrong again. Without it, the decision
  outlives the reason it was taken.
- **Measure on the ruler of the adopted tool.** A study that measures the stack by another
  tool's unit is on the wrong ruler, and its comparison decides nothing.

## 8. Exposing a service: tunnel + edge access, credential per project, two layers of auth

- **Exposure is a pattern, not an improvisation:** the service is published through an
  **outbound tunnel** terminated by an **edge access layer** (an identity-aware proxy in front
  of it), never by opening the port on the host. The tunnel is outbound, so the host keeps no
  inbound surface.
- **Credential per project, never the neighbour's.** Each exposed service gets its **own** edge
  token/identity — reusing another project's credential is the same cross-project coupling the
  catalogue forbids everywhere else, with a worse blast radius.
- **Two auth layers: workload identity + task identity.** A credential that proves *which
  class of runner/service is calling* is not the same as one that proves *which unit of work
  it is allowed to run*. Name both; a single token doing both is a single token to steal.
- **Isolated runner: pull, own clone, immediate push.** A distributed runner **pulls** its
  work, works on its **own clone and branch**, and pushes immediately (commit-per-step POP) —
  no shared checkout, no shared credential file, and no "the coordinator's tree" as an implicit
  dependency. If the runner needs the coordinator's disk to finish, it is not isolated.

## Checklist before delivering a recipe

- [ ] The ficha/host file is the declaration: inventory and manifest in one, versioned.
- [ ] Services are referenced by FQDN; the DNS name list has one source.
- [ ] Panel aliases are versioned code, not state in the panel.
- [ ] The recipe **ends with a check that fails loud** if the declared state is not reached.
- [ ] Bootstrap and reconciliation are separated (different jobs, different failure modes).
- [ ] Every manual step is written as manual, with why it is not automated.
- [ ] Secrets are referenced by name/location, never inlined.
- [ ] Reconciliation covers both drift directions (missing and undeclared).
