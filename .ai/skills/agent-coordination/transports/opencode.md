# OpenCode transport mechanics

Appendix to `../SKILL.md` — read that first. This covers only OpenCode-specific MCP
calls; the methodology (write-set isolation, evidence standard, escalation) is the
same regardless of transport.

## The polling loop, every cycle

1. `opencode_permission_list` first — every session blocked on a tool-permission wall,
   server-wide, in one call. Approve (`once`/`always`) or reject; a rejection always
   pairs with a reply saying what to do instead.
2. `opencode_question_list` — a separate channel from permissions: a worker can ask a
   real question instead of guessing. Also the periodic self-check-in channel (a
   timed, unconditional question every ~10min per the worker template) and the
   permission-pingback channel (a worker raises a question alongside any permission
   wall). Answer via `opencode_question_reply`/`opencode_question_reject`.
3. `opencode_check(sessionId, detailed: true)` per session — cheap (low hundreds of
   tokens), surfaces real status/todos/last message. This is the default signal.
4. Cross-check file mtimes when something feels off.

## Reading a real transcript, cheaply

- `opencode_message_list(sessionId, limit)` / `opencode_conversation` — full
  reasoning and tool calls, same depth as a subagent transcript. **Escalate to this
  ONLY when the cheap `opencode_check` signal looks wrong** (an out-of-scope
  file/path mentioned, a todo that doesn't match the task, a stall) — a small
  `message_list` call can cost ~9-10k tokens of context; pulling it every cycle for
  every worker defeats the point.
- On overflow to a `.txt` file: it's one minified-JSON line, so `Read`'s line-based
  limits don't help. Extract just the `text` field via `node -e` (Bash), not the
  file tool. Delete the scratch file after — not durable state.
- On a confirmed deviation, correct immediately via `opencode_reply` — quote the
  wrong claim/action, restate the correct scope/fact. Don't wait for delivery.

## Model choice — free tier, minimal reasoning effort, unless told otherwise

Use the project's currently-designated free model and its lowest reasoning
effort/variant. Minimal reasoning tends to outperform higher-reasoning configs on
routine dispatched work — higher effort produces analysis paralysis, unrequested
side actions, or premature disengagement more often than it produces correctness.
There's no way to swap a running session's model — if a wrong model/config is found
mid-flight, let an already-progressing uncommitted session finish or abort-and-retry
cleanly, then fix every subsequent dispatch.

## Dispatch mechanics

- Dispatch directly via the MCP tools (`opencode_run`/`opencode_fire`) rather than
  only handing text for a human to paste — full inline task text per the worker
  template, never "read file X."
- If a human will paste a prompt manually, always include the absolute repo root and
  the absolute prompt-file path.

## `qa-ready` is OpenCode's ceiling

Never let it self-mark `qa-done`/"approved." Revert the status and treat the claim
as unverified if it happens.

## Growing this file

Add a new project skill under `.ai/skills/` when a distinct, recurring workflow
solidifies — not for a single incidental finding (that belongs in the project's own
defect log instead).
