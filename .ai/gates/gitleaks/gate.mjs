#!/usr/bin/env node
// gate gitleaks — varredura de SEGREDO no que vai ser commitado.
//
// Nao reimplementa padrao de segredo nenhum: se o `gitleaks` esta' instalado, roda ele
// (`protect --staged`, com o `.gitleaks.toml` do projeto quando existir) e propaga o exit
// code. Sem gitleaks, REPROVA (fail-closed): um scan ausente nao pode virar um "pode
// commitar" — foi o que o Kipp viu na adocao da dev.20 (14/10): o commit passou sem varredura.
//
// Parametros (opcionais, no `[gates.params.gitleaks]` do `.ai/tars.toml`):
//   modo  = "staged" | "tree"  (default staged)
//   extra = lista de argumentos extras repassados ao gitleaks
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')

// Binario ausente => spawnSync devolve `error` (nao status): e' o unico sinal confiavel de "nao instalado".
if (spawnSync('gitleaks', ['version'], { stdio: 'ignore' }).error) {
  console.error('gate gitleaks: binario ausente — segredo NAO foi varrido. Instale o gitleaks (versao fixa) e repita.')
  process.exit(1)
}

const args = params.modo === 'tree' ? ['detect', '--redact'] : ['protect', '--staged', '--redact']
const cfg = join(project, '.gitleaks.toml')
if (existsSync(cfg)) args.push('--config', cfg)
if (Array.isArray(params.extra)) args.push(...params.extra)

const r = spawnSync('gitleaks', args, { stdio: 'inherit' })
if (r.status !== 0) {
  console.error('\ngate gitleaks: possivel segredo no que vai ser commitado.')
  console.error('  remova/rotacione; falso-positivo = allowlist no .gitleaks.toml.')
}
process.exit(r.status ?? 1)
