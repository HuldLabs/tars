#!/usr/bin/env node
// gate commit-msg — valida a MENSAGEM do commit (INV-GIT-2 + INV-LESSON-1).
//
// Contrato do motor (tars-hooks.mjs): recebe o argumento do hook em argv (o caminho do
// arquivo da mensagem, no commit-msg) e o projeto em TARS_PROJECT. exit != 0 = o commit
// nao passa. A regra em si (tipos, emoji, 72 chars, trailers) NAO mora aqui: este arquivo
// so' chama `validate-commit.mjs`, que e' a fonte unica — duplicar o regex seria o defeito
// que a R3 proibe.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const project = process.env.TARS_PROJECT ?? process.cwd()

// O validador viaja junto do gate (item de catalogo = pasta). O caminho do projeto e' a
// saida de emergencia para quem ja' tem a camada do segtools no lugar.
const validator =
  [join(here, 'validate-commit.mjs'), join(project, 'tools', 'framework', 'githooks', 'validate-commit.mjs')].find((p) =>
    existsSync(p),
  ) ?? join(here, 'validate-commit.mjs')

const msgFile = process.argv[2]
if (!msgFile) {
  console.error('gate commit-msg: o hook nao passou o arquivo da mensagem (uso: gate.mjs <msgFile>)')
  process.exit(1)
}

const r = spawnSync(process.execPath, [validator, '--validate', msgFile], { stdio: 'inherit' })
process.exit(r.status ?? 1)
