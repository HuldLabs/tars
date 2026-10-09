# Platform lessons (Windows, WSL, containers)

Pitfalls that are not a bug of any one project: they come from the platform and come back in every
repo that touches Windows, WSL or containers. Each item states the **symptom** (how it looks), the
**cause**, the **fix** and the **prevention** (what makes it not come back). It comes from a real
incident; a fix without prevention guarantees the next one.

## 1. SSH key with CRLF: `error in libcrypto`

- **Symptom.** `ssh-keygen -y`, `ssh-add`, `ssh` or the signing of a commit (`gpg.format=ssh`) fails
  with `Load key "...": error in libcrypto`, even though the file starts with
  `-----BEGIN OPENSSH PRIVATE KEY-----` and ends with the `END` line.
- **Cause.** The key was saved with **CRLF** line endings (Windows): pasted or edited on Windows,
  stored that way in the vault (1Password) and copied to Linux as is. OpenSSH does not accept the `\r`.
  The OpenSSH-versus-PKCS#8 format is **not** the cause; check the header before suspecting it.
- **Fix.** Normalize before use, into a 0600 file:
  `tr -d '\r' < key > key.n && printf '\n' >> key.n && mv key.n key && chmod 600 key`
  (the dotfiles bootstrap already installs `dos2unix` for this same symptom).
- **Prevention.** Every tool that materializes a key from the vault (`tars identity`, `Bulq`, signing
  helpers) normalizes the line endings on write and validates with `ssh-keygen -y` before use,
  failing loudly with the cause. Never print the content while diagnosing: the header line,
  the line count and "has CR" are enough.
- **Incident.** 08/10/2026: re-signing the Tars commits with the `daneel-bot` key read from
  `op://secrets/daneel-bot/github/signing-ssh-private-key` (3 lines with CR).

## 2. 1Password: `?ssh-format=openssh` only on an SSH Key field, and ed25519 in PKCS#8

- **Symptom.** `op read 'op://<vault>/<item>/<field>?ssh-format=openssh'` fails with
  `the ssh-format query parameter can only be used on SSH private key fields`.
- **Cause.** The conversion only exists on the **native** private key field of an item of type
  "SSH Key". A key copied into a text/concealed field (e.g. `github/signing-ssh-private-key`) does not
  accept the parameter. Separately: 1Password exports an ed25519 private key in **PKCS#8** by default,
  a format that OpenSSH **does not read** for ed25519. That is why the native field needs the conversion.
- **Fix.** Look at the **header** before guessing (`-----BEGIN OPENSSH PRIVATE KEY-----` vs
  `-----BEGIN PRIVATE KEY-----`, the latter PKCS#8):
  - native field of an SSH Key item, use `?ssh-format=openssh`;
  - text field already in OpenSSH, read without the parameter and normalize the line endings (item 1).
- **Prevention.** A key's ref points to the item's native SSH Key field (single source). A copy
  in a text field is a second source that diverges: format, CRLF, rotation.
- **Incident.** 08/10/2026: the first hypothesis (PKCS#8) was **discarded** by the header; the real
  cause was CRLF (item 1). Each hypothesis tested a single variable and was recorded with its result.

## 3. `wsl.exe` expands `$VAR` on the Windows side

- **Symptom.** A command passed as `wsl.exe -d <distro> -- bash -c '... $VAR ...'` runs with the
  value empty or the Windows one (`$HOME`, `$PATH`, a token that becomes an empty password), with no error.
- **Cause.** `wsl.exe` expands the variable before Linux bash sees the line, even in single quotes.
- **Fix and prevention.** The command goes in a **script file** (`wsl.exe -d <distro> -- bash <file>`).
  The `block-destructive-commands` guard blocks `wsl.exe ... -c` with `$` inline.
- **Incident.** 08/10/2026: hit 4 times in the same day.

## 4. Windows worktree seen from WSL

- **Symptom.** `git -C <worktree>` from WSL answers `not a git repository: .../C:/Users/.../.git/worktrees/<n>`.
- **Cause.** A worktree created by Windows git writes in its `.git` file a Windows path
  (`gitdir: C:/...`), which Linux git does not resolve.
- **Fix.** Convert (`C:/x` → `/mnt/c/x`) and call git with explicit `--git-dir`/`--work-tree`, or
  operate on that worktree from Windows git itself.
