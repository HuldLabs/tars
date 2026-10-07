# Claude subagent / peer session transport mechanics

Appendix to `../SKILL.md` — read that first. Covers the `Agent` tool and peer Claude
sessions (`SendMessage`/`ListAgents`); the methodology is the same as any transport.

## Dispatch

- `Agent` tool for a bounded, one-shot task; a peer session (`SendMessage`) for
  something needing back-and-forth or that outlives one turn.
- Lowest reasoning effort by default, same rationale as the OpenCode transport's
  model-choice section — escalate only for genuinely security-sensitive
  implementation work (auth logic, crypto) if the project's current model policy
  carves that out.
- Full inline task text, same as any transport — never "read file X and follow it."

## Monitoring

- `ListAgents`/session status for what's running.
- A peer session is a capable coprocessor, not a trusted oracle — never treat its
  claim as ground truth without independently checking it (read the actual commit,
  run the actual command).
- When a peer session hits a decision it can't make alone, it escalates to you or
  directly to the operator — it never guesses and proceeds.

## Verification

Identical to the core skill: read the artifact, never the summary; `qa-ready`
(or the peer's own equivalent status) is its ceiling, never self-marked qa-done.
