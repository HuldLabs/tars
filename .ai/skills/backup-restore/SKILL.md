---
name: backup-restore
description: How to design backup and restore for anything that matters — one repository per context, complete self-contained snapshots, declared retention, restore ALONGSIDE never on top, and a scheduled restore proof (the backup is only real once it restores). Covers snapshots vs. chains, the single source of truth for what exists, and the difference between "the job ran" and "the data comes back". Load BEFORE writing any backup recipe, restore procedure or retention policy.
---

# Backup / restore

The rule this skill exists to enforce: **a backup is real only when it restores.** A job
that exits 0 proves the copy ran; it proves nothing about whether the data comes back. Every
section below is a consequence of that one sentence.

## 1. One repository per context

A backup repository belongs to **one context** — a project, a machine, a tenant, a
domain. Never one repository holding everyone's data.

- Mixed contexts make restore **all-or-nothing**: recovering the small thing means mounting
  the big thing. Separation keeps the blast radius of a restore equal to the thing restored.
- Separation also keeps **retention honest**: a hot context with a 24-hour retention and a
  cold archive with a 6-month retention are different policies, and mixing them in one
  repository forces the aggressive one on both.
- The context boundary is the same boundary you already have for access — if two things
  should not be readable by the same credential, they should not share a repository.

## 2. Complete, self-contained, deduplicated snapshots

Prefer **snapshots that restore alone** over **chains that restore in order**.

- A snapshot that needs its parents is a chain: break one link and the tail is unreadable.
  The storage layer may deduplicate underneath — that is an implementation detail as long as
  **any single snapshot restores without its neighbours**.
- **Restore the whole thing, then subtract.** A "restore only what changed" design pushes the
  correctness burden onto the human at the worst moment (the incident). A full snapshot that
  can be restored to a scratch location beats a clever differential you must reason about.
- **What is not in the snapshot is config, not data** — and config belongs in git. The
  snapshot carries the state; the recipe to rebuild the machine is a committed file. Do not
  back up what version control already holds: it doubles the surface and hides drift.

## 3. Declared retention — the number is part of the design

Retention is **declared explicitly** (e.g. hourly/daily/weekly/monthly tiers), not left to a
default. The *policy* is method; the *numbers* are the project's, and they live with the
project.

- Say **how long** each tier is kept and **why** that horizon: it is the answer to "how far
  back must we be able to go when we notice the damage?" — which is always later than the
  damage.
- Retention and the **proof** (§5) travel together: a policy you never test is a policy you
  do not have.
- An undeclared retention is a silent one: when the old snapshots vanish nobody knows if it
  was the policy or a failure.

## 4. Restore ALONGSIDE, never on top

The single most expensive mistake in restore is **overwriting the thing you are trying to
recover**.

- Restore to a **new/parallel location** first, inspect it, then promote. Restoring on top of
  a running system can destroy the very evidence that told you something was wrong — and the
  "corrupt" copy you were replacing is sometimes the good one.
- The procedure **states its target explicitly** and refuses to run against a live path
  without a deliberate override. Fail loud when the target is not the scratch location.
- Restoring alongside makes the operation **reversible**: if the restored copy is wrong, you
  still have everything you had before you started.

## 5. Scheduled proof of restore

The backup job is not the proof. The **restore** is, and it must be **scheduled**, not
remembered.

- A periodic job restores a known sentinel (a small, recognisable slice) to a scratch
  location and **verifies it** — then discards it. If the restore fails, that is the alert.
- Prove the **whole path**: read the snapshot, decrypt it, apply it, check the sentinel's
  content. A CI that only checks "the file exists" proves nothing.
- The proof runs **on a schedule**, so a break is found in a day, not in the incident.
- Treat "backup ran, restore never proven" as a **known unknown** and say so out loud —
  never as "we have backups".

## 6. Single source of truth for what exists

The set of things to back up has **one declaration**, and **reconciliation** compares the
world against it.

- The declaration (a manifest, a ficha, a config) is the single source: what is not declared
  is **not** silently kept — a reconciler treats the undeclared as garbage. This is what keeps
  the declaration honest over time.
- Reconciliation runs so that **both** directions are caught: declared-but-missing (a
  regression to fix) and present-but-undeclared (a discovery to declare or delete).
- The declaration is **versioned**. "What we back up" is a decision that should show up in
  history, with the reason.
- A restore drill starts by checking the declaration is current: restoring yesterday's
  declared set to a machine that changed today restores the wrong shape.

## Interaction with a guard that deletes

If a reconciler can **delete** undeclared resources, the same guard that protects productive
data must protect **the procedure itself** — the automation must not be able to erase the
documentation of how to recover from its own mistake. Declare the recovery procedure as a
resource the reconciler may not touch.

## Checklist before delivering

- [ ] One repository (or one clearly separated set) per context; no mixed tenants.
- [ ] Each snapshot restores **alone**; no hidden chain dependency.
- [ ] Config is in git, not in the backup; only state is backed up.
- [ ] Retention tiers are declared, with the horizon's reason.
- [ ] The restore procedure restores **alongside**; on-top requires a deliberate override.
- [ ] A **scheduled** restore of a sentinel proves the whole path, and alerts on failure.
- [ ] What exists has one versioned declaration; reconciliation covers both directions.
- [ ] The recovery procedure is protected from the automation it describes.
