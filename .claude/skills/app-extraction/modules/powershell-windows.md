# Module — Windows / PowerShell gotchas

> **Related:** `node-local-server` (running processes), everything else (these break steps silently).

## What it covers

The environment traps that quietly break extraction steps on this machine (win32 + PowerShell 7).

## Why (the incident)

Recurring, and each one wasted real time (`docs/METHODOLOGY.md` §7): a path with an accent (`ã`,
`ç`) is not written by PowerShell; inline `node -e` scripts with backticks/quotes get mangled;
and a hidden `Start-Process` can kill the server.

## How to work

1. **Accents**: keep repo paths accent-free (`D:\onedrive\segtools`); when a path has one, write
   files via the editor tool/Node, never via a PowerShell here-string.
2. **No inline `node -e` for anything non-trivial**: quoting (`"`, backtick, `$`) breaks. Write a
   temp `.js` under `%TEMP%\opencode\` and run it — this was the fix for every scraping/probe script.
3. **`$PID` is read-only** in PowerShell — rename your variable.
4. **Restart by port**: `Get-NetTCPConnection -LocalPort 8081 -State Listen | Stop-Process -Id (…)`.
5. **Don't hide servers**: `Start-Process node -WorkingDirectory …` (hidden window can die silently);
   prefer a visible window or a Taskfile.

## What "done" means

- Steps are re-runnable scripts, not interactive one-liners that depend on paste-time quoting.

## Known pitfalls

- `curl` in PowerShell aliases to `Invoke-WebRequest` — use `curl.exe` or Node `fetch`.
- Backtick is PS's escape char; avoid it in command strings.
- Long inline scripts truncate/parse-fail — always a file.
