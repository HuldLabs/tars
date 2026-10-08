# CHANGELOG — Tars

Toda versao `0.0.1-dev.N` traz as 4 subsecoes abaixo (formato parseavel por `tars
upgrade-notes`). O consumidor roda `tars upgrade-notes` depois de um `tars sync` que subiu a
versao: o comando imprime SO' as notas entre a versao do `.ai/tars.lock` e a atual.

## 0.0.1-dev.8

### O que mudou
- **Paridade Windows** (4ede873): a chave do lock e a geracao dos `.githooks/` normalizam o
  separador. No win32 o `readdirSync` devolve `gates\commit-msg` e um sync **correto** era
  reprovado (e o hook nascia com caminho quebrado).
- **Gate condicional por ator** (7b546a2): `[gates.params.<gate>].when` aceita
  `when = { actor = "agent" }` — o gate roda so' para quem escreve. Predicado desconhecido
  GRITA em vez de devolver `true`/`false`: `when` com nome errado sumiria com o gate, calado.
- `commit-msg` aceita **`lesson = "agent"`** (7b546a2): `Lesson:`/`Incident:` passa a ser
  cobrado so' do **agente**; commit de humano nao paga a licao. Emoji, tipo, sujeito de 72
  chars e a prova de teste vermelho do `fix` continuam valendo para os dois.
- `tars sync` declara **`TARS_ACTOR=agent`** no `env` do `.claude/settings.json` (59f0955):
  o harness diz quem escreve. Um `[env]` do consumidor **nao** rebaixa o ator.
- `block-destructive-commands.sh` **barra `TARS_ACTOR=human`** no comando (ec3c8f8) — o
  agente nao se declara humano para isentar o proprio commit da licao.
- `tars doctor` julga o hook "vivo" pelo **`hookVivo`** (o mesmo do `tars-sync.mjs`):
  bit de execucao no POSIX, `#!` no win32 — onde o NTFS nao guarda bit e o doctor acusava
  `HOOKS MORTOS` com o hook no lugar certo (paridade Windows com o `tars sync`).
- **AVISO — o dogfood do Tars nao acha mais o binario sozinho.** O hook gerado perdeu o
  `$root/dist/tars` (o caminho do clone deixou de ser adivinhado); o hook passa a depender
  do **`TARS_HOME`**, de um **`tars` no `PATH`** ou do **`node`** com o modulo do catalogo.
  Clone do Tars que use o proprio hook: exporte `TARS_HOME` (ou ponha `tars` no PATH) antes
  de commitar, senao o hook nao roda.

### Por que
- Gate que reprova o certo (Windows) ensina a desligar o gate; gate que some calado e' pior
  que gate nenhum.
- A licao obrigatoria existe para forcar o AGENTE a registrar o que aprendeu — quem escreve a
  mao ja' pensa antes de commitar, e cobrar o mesmo bloco do humano so' ensina a inventar
  licao. Sem ator isso viraria politica espalhada dentro de cada gate; com `when`, e' dado.
- Isencao por ator so' vale se o ator nao puder se autodeclarar: o mesmo buraco que o
  `No-Release`/`--no-verify` abrem, fechado na borda em que o ator se declara.

### Arquivos impactados no consumidor
- `.ai/base/guards/block-destructive-commands.sh` (nova regra do ator)
- `.ai/base/gates/commit-msg/` (`GATE.md` + validador: `when` e `lesson`)
- `.claude/settings.json` (novo `env.TARS_ACTOR=agent`, regravado pelo sync)
- `.ai/VERSION`, `CHANGELOG.md`, `tars.lock` (versao do catalogo)

### O que o consumidor faz
Para isentar o commit **humano** da licao, declare:
```toml
[gates.params.commit-msg]
lesson = "agent"
```
```
tars sync           # regrava o settings.json com TARS_ACTOR=agent
tars upgrade-notes  # le as notas entre a versao do lock e a atual
tars doctor         # deve passar; se acusar wiring, e' o conserto que o sync faz
```

## 0.0.1-dev.7

### O que mudou
- `tars sync` gera os hooks do GIT e, em modo `self`, os hooks do PROPRIO catalogo; falha
  alto quando `core.hooksPath` aponta pasta morta (de5ca60) e `tars doctor` acusa hook
  morto e exige os hooks do Tars vivos (cfd3315).
- `tars sync` **nao sobrescreve** hook do consumidor sem a marca de autoria (e170796):
  hook seu sem a marca: o sync RECUSA escrever; adote com `tars sync --adopt` ou declare
  o hook como local.
- `tars sync` **poda a saida gerada orfa** que saiu do manifesto (e979bd6): item removido
  do `.ai/tars.toml` some do disco no proximo sync, sem resto.
- `handoff check` aceita a branch `main` (be074ba).
- O binario roda os gates num **runtime JS de verdade** (2a7d387) e o modulo importado
  pelo binario nao roda o proprio `main` (2d9d70e): `dist/tars sync --check` nao morre mais com ENOENT em `/.ai/`.
- Consumidor que ja' tem `.ai/VERSION` nao vira catalogo por engano (5129820).
- `incident add` registra o incidente e acusa recorrencia (a2f7731); `tars doctor` acusa
  incidente recorrente sem guarda (cd860d1).
- `memory` valida vocabulario fechado de tags, ambiente e classe (7aec978).
- **NOVO: gate `release-guard`** (ccecf5e) — commit que toca o motor do Tars
  (`tools/framework/tars-*.mjs`, `.ai/gates/`, `.ai/guards/`, `.ai/governance/`) tem de
  subir `.ai/VERSION` E trazer entrada no `CHANGELOG.md`, salvo `No-Release: <motivo>`.

### Por que
- O consumidor precisa das notas de upgrade: commit que muda o motor sem subir a versao
  deixa quem consome sem saber o que mudou (o custo que o seo-brain pagou em 07/10).
- Rubrica de hook do consumidor nao pode ser sobrescrita calada pelo sync; e output orfao
  acumula lixo que o manifesto ja' nao declara.
- Gate que roda no runtime errado (ou duas vezes) reprova commit legitimo.

### Arquivos impactados no consumidor
- `.ai/gates/release-guard/` (novo gate) e `.ai/doctrines.toml`
- `.githooks/` (pre-commit do consumidor que ligar o gate)
- `.ai/VERSION`, `CHANGELOG.md`, `tars.lock` (versao do catalogo)
- `.ai/base/gates/`, `.ai/base/guards/`, `.ai/base/governance/` regenerados pelo sync

### O que o consumidor faz
```
tars sync           # se RECUSAR nomeando um hook seu: ele tem gates do projeto. NAO adote;
                    # declare o gate como local. So' `--adopt <hook>` se o hook era copia velha do Tars.
tars upgrade-notes  # le as notas entre a versao do lock e a atual
tars doctor         # deve passar; acusa hook morto e incidente recorrente sem guarda
```

## 0.0.1-dev.6

### O que mudou
- `tars sync` gera os hooks do GIT (`.githooks/pre-commit`, `commit-msg`, `pre-push`)
  chamando `tars hooks <hook>`, quando o consumidor ja' usa hooks proprios
  (`core.hooksPath` declarado ou `.githooks/` existente).
- `tars doctor` FALHA se `core.hooksPath` aponta pasta inexistente, hook ausente ou sem bit
  executavel; e se qualquer hook do `.claude/settings.json` cita um arquivo que nao existe —
  em TODOS os eventos.
- Hook da base (PreCompact/SessionStart) passa a citar o caminho REAL achado por
  `resolveGuardFile` (projeto ou `.ai/base/guards/`), nao mais `.ai/guards/` fixo.
- `lib-*.sh` (biblioteca `source`ada por guard) nunca vira hook.
- `tars --version`; o `tars.lock` grava a versao do catalogo; `tars upgrade-notes` imprime
  as notas entre a versao do lock e a atual.

### Por que
- O consumidor que so' usa a base copiada nao tem `.ai/guards/`: o hook apontava para o
  vazio e o harness rodava `bash: no such file` em toda sessao (seo-brain, 07/10).
- Sem gerar os hooks do git, um commit passava sem gate nenhum; e o doctor nao acusava.
- O agente do seo-brain gastou turnos decifrando o que mudou no Tars — faltavam notas.

### Arquivos impactados no consumidor
- `.githooks/` (novo, quando o consumidor ja' usa hooks proprios)
- `.claude/settings.json` (comandos dos hooks da base passam a citar o caminho real)
- `.ai/tars.lock` (campo `tars.version` passa a gravar a versao do catalogo)

### O que o consumidor faz
```
tars sync          # regera base, settings e os hooks do git
tars upgrade-notes # le as notas entre a versao do lock e a atual
tars doctor        # deve passar; se acusar wiring, e' o conserto que o sync faz
```

## 0.0.1-dev.5

### O que mudou
- `fix:`/`🐛` sem arquivo de TESTE REPROVA (TARS-RED-1), salvo `No-Test: <motivo>`.
- `catch {}` / `except: pass` (erro engolido) vira REPROVA no gate `lint-swallow`.
- A licao ganha o 5o campo `hipoteses` (o que foi testado e descartado) e o `origem` antes
  do sintoma; a classe de incidente que repete 2x vira FALHA no doctor.

### Por que
- Correcao sem teste vermelho regride; erro engolido esconde a causa; licao sem causa raiz
  ensina o sintoma.

### Arquivos impactados no consumidor
- `.ai/base/gates/commit-msg/`, `.ai/base/gates/lint-swallow/`, `.ai/base/governance/`

### O que o consumidor faz
```
tars sync
```

## 0.0.1-dev.4

### O que mudou
- `tars` ganha `memory audit` (cobra a fonte de cada fato), `check-refs` (a decisao citada
  no despacho tem de existir na arvore) e `handoff check` (o cursor do HANDOFF contra o git).

### Por que
- Fato sem fonte e decisao invisivel sao divida que so' aparece quando alguem confia nela.

### Arquivos impactados no consumidor
- `.ai/memory/`, `HANDOFF.md`

### O que o consumidor faz
```
tars sync && tars memory audit && tars handoff check
```

## 0.0.1-dev.3

### O que mudou
- Wiring do harness: `tars sync` gera `.claude/settings.json` com o ambiente NAO INTERATIVO
  (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GIT_SSH_COMMAND` com `BatchMode`) e
  omite hook cujo arquivo nao existe.
- `tars hook` local nao roda no `pre-push` (o portao caro).

### Por que
- Comando de agente que abre prompt bloqueia sem TTY ate' o timeout (o `git fetch` de 8 min).

### Arquivos impactados no consumidor
- `.claude/settings.json`

### O que o consumidor faz
```
tars sync
```

## 0.0.1-dev.2

### O que mudou
- `tars doctor`: a doutrina vira DADO (`.ai/doctrines.toml`) com `fonte`/`gate`/`prova`; a
  prova que PASSA denuncia PHANTOM e o doctor sai != 0.
- `tars verify` cobra a claim contra a arvore.

### Por que
- Regra que nao e' teste e' sugestao — o par doutrina->gate so' existia na cabeca de quem
  escreveu o hook.

### Arquivos impactados no consumidor
- `.ai/doctrines.toml` (catalogo), `.ai/tars.toml` `[[doctrine]]` (projeto)

### O que o consumidor faz
```
tars sync && tars doctor
```

## 0.0.1-dev.1

### O que mudou
- `principles.md` vira a regra de boot de todo consumidor (R1-R4 + hooks/idempotencia/
  modularidade/plugabilidade/agnosticidade), levada por `tars sync` e posta no topo do
  arquivo de boot gerado.

### Por que
- Todo projeto que consome o Tars precisa da mesma regua de desenho no boot.

### Arquivos impactados no consumidor
- `.ai/base/rules/principles.md`, `AGENTS.md`/`CLAUDE.md` (gerados)

### O que o consumidor faz
```
tars sync
```
