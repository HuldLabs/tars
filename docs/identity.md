# `tars identity` — a identidade de automação do projeto

> Fatia P0 da release de 14/10 (TARS-BUG-5 / END-CLI-1). Fonte da spec:
> `endurance/docs/decisoes-20260808.md` §Sequence e §SSH. Portado, não reinventado: o
> `tars secrets` já tem a chave do bot no cofre e o `fingerprintDe`.

## O que é

A identidade de automação é **quem** a automação (agente, runner, bot) usa para falar com
os hosts, **de onde** a chave vem e **quem** a autoriza. A doutrina do Endurance (D3/R5) é
que as features `secrets`/`signing` são **finas**: instalam o `tars` e chamam
`tars secrets …` / `tars identity …` — lógica própria de identidade no consumidor é defeito.

O `tars identity` é essa porta única. Ele **lê** a chave do mesmo cofre que o
`tars secrets` (a ref `op://` mora em `[identity].bot`), **nunca** imprime valor de segredo
(só a impressão **pública**), e separa o que é do dono (provisionar/revogar) do que é do
agente (verificar).

## Subcomandos

| Comando | Quem | O que faz |
|---|---|---|
| `identity show [--json]` | livre | ator, ref do cofre, chave, impressão **pública**, hosts |
| `identity verify [--host H]` | agente (read-only) | confere chave (0600) × cofre × `known_hosts` (pinned) × autorização no host; exit ≠ 0 no que faltar |
| `identity provision` | **DONO (TTY)** | escreve a chave do bot (0600) a partir do cofre |
| `identity revoke` | **DONO** | apaga a chave local e **NOMEIA** os hosts a limpar |
| `identity sign-setup [--force]` | agente | assinatura de commit por SSH (`gpg.format`/`user.signingkey`/`gpg.ssh.allowedSignersFile`); idempotente; sem `--force` não sobrescreve config do dono |

## Manifesto (`[identity]` no `.ai/tars.toml`)

```toml
[identity]
actor = "daneel"
bot = "op://secrets/daneel-bot/homelab/auth-ssh-key"   # REF, nunca valor
key_file = "/home/daneel/.ssh/id_daneel"
hosts = ["hermes", "nuc"]
known_hosts = "/home/daneel/.ssh/known_hosts"
```

## Por que cada regra

- **Nunca o valor.** `show` só a impressão pública; o `fingerprintDe` (do `tars-secrets-ops`)
  deriva `SHA256:…` da pública. A saída inteira passa por `assertSemSegredo` — a mesma lista
  do pre-commit (R3).
- **`provision` e `revoke` são do dono (TTY).** Fora de TTY recusam: automação não gera
  identidade sozinha — é a feature **fina** quem chama, e há mão humana (ou o dono) no meio.
- **`verify` é read-only e honesto.** Campo ausente vira `(nao declarado)`; host que recusa
  a chave **falha nomeando o host e a saída do ssh**, nunca "ok" por vacuidade. Sem
  identidade nenhuma declarada, `verify` **falha alto** nomeando o comando do dono
  (`tars identity provision`, com TTY) — automação nunca se auto-provisiona.
- **`sign-setup` porta o `signing-git-config` do Endurance, sem o agente.** Escreve a tríade
  de assinatura SSH (`gpg.format=ssh`, `user.signingkey`, `gpg.ssh.allowedSignersFile`) no
  `git config` do projeto; a chave assinante é a `.pub` do `key_file` (não o socket do
  agente: assina sem agente vivo). O `allowed_signers` vem de `[secrets].allowed_signers`.
  **Idempotente** (valor já igual = não escreve) e **nunca** sobrescreve config divergente do
  dono sem `--force` — sem ele, conflito nomeado e exit ≠ 0.
- **`known_hosts` fixado.** O Endurance proíbe TOFU na LAN; sem fixação, `verify` acusa.
- **`revoke` não escreve no host de terceiro.** Apaga a chave local e **nomeia** os hosts
  pendentes — o Tars não muda produção/terceiro sem a ordem direta do dono (doutrina
  `operacao/nada-em-prod-sem-ordem`). Nunca promete revogação remota que não fez.

## Dívida nomeada (fora desta fatia)

- `identity rename` e a **rotação agendada** (a spec cita "Rotation and revocation through
  `tars identity`"): a revogação entrou; a rotação por calendário fica para a fatia seguinte.
- O `authorized_keys` do host: hoje o `verify` sonda por `ssh … true`; escrever a linha
  restrita (`from=`, sem forwarding) no host é do dono, com ordem.
