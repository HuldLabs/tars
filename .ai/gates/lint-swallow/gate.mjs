#!/usr/bin/env node
// gate lint-swallow — erro ENGOLIDO no que vai ser commitado.
//
// Um `catch {}` vazio (JS/TS) ou `except: pass` (Python) esconde a falha: o programa
// segue como se nada tivesse acontecido e o erro so' reaparece longe de onde nasceu.
// O gate le' os ARQUIVOS STAGED (o que entra no commit, nao a arvore inteira) e reprova
// com `arquivo:linha` — nomear o lugar e' o que torna o conserto possivel.
//
// Porte da IDEIA do INV-FAIL-1 do seo-brain (falha nao se engole); a implementacao e'
// nossa. Comentario nao conta: a linha e' teste do codigo, sem o texto apos `//`.
//
// Parametros (opcionais, no `[gates.params.lint-swallow]` do `.ai/tars.toml`):
//   allow = lista de trechos de caminho isentos (ex.: ["vendor/"])
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')
const allow = Array.isArray(params.allow) ? params.allow : []

const JS = /\.(mjs|cjs|js|jsx|ts|tsx)$/i
const PY = /\.py$/i

// JS/TS: `catch` com corpo vazio — `catch {}`, `catch (e) {}`, `catch (e) { /* nada */ }`.
// Casa no codigo JA' sem comentario (o comentario sai antes), entao `{ }` vazio e' vazio de verdade.
const SWALLOW_JS = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/
// Python: `except` (com ou sem tipo) cujo corpo e' apenas `pass`/`...` — na mesma
// linha (`except: pass`) ou no bloco (`except:` + `pass` indentado logo abaixo).
const SWALLOW_PY = /^\s*except\b[^:]*:\s*(?:pass|\.\.\.)\s*$/
const PY_EXCEPT = /^\s*except\b[^:]*:\s*$/

const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'], { cwd: project, encoding: 'utf8' })
if (r.status !== 0 || typeof r.stdout !== 'string') { console.error('gate lint-swallow: sem git — nao foi possivel listar o staged.'); process.exit(0) }

// Nada staged: o gate tem um SEGUNDO modo, e ele precisa ser dito em voz alta.
// Quem CHAMA o gate (pre-commit) sempre tem staged; quem so' quer saber se ele
// ainda REPROVA (a `prova` da doutrina `fail/erro-nao-se-engole`, roda por
// `tars doctor` numa arvore limpa) nao tem — e um `exit 0` mudo ali vira
// PHANTOM: "a prova passou, nada distingue quem segue de quem ignora", que e'
// o OPOSTO do que aconteceu (o gate desistiu, nao aprovou).
//   com staged → julga o conteudo STAGED (o commit e' o que entra, nao o disco)
//   sem staged → julga os arquivos RASTREADOS, para a prova seguir falsificavel
// Ausencia de staged NAO e' aprovacao — e o gate diz isso na propria saida.
if (!r.stdout.split('\0').some(Boolean)) {
  console.error('gate lint-swallow: nada staged — julgando a ARVORE RASTREADA (modo prova); sem staged NAO significa aprovado.')
  const t = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: project, encoding: 'utf8' })
  if (t.status !== 0 || typeof t.stdout !== 'string') { console.error('gate lint-swallow: sem git — nao foi possivel listar a arvore.'); process.exit(0) }
  r.stdout = t.stdout
}

const arquivos = r.stdout.split('\0').filter(Boolean).filter((f) => (JS.test(f) || PY.test(f)) && !allow.some((a) => f.includes(a)))
const achados = []
for (const f of arquivos) {
  let txt
  try { txt = readFileSync(join(project, f), 'utf8') } catch { continue } // sumiu do disco: nada a julgar
  const re = JS.test(f) ? SWALLOW_JS : SWALLOW_PY
  const linhas = txt.split(/\r?\n/).map((l) => l.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '').replace(/#.*$/, ''))
  linhas.forEach((codigo, i) => {
    if (re.test(codigo)) return achados.push(`${f}:${i + 1}`)
    // `except:` sozinho e o `pass` na linha de baixo = o mesmo erro engolido.
    if (PY.test(f) && PY_EXCEPT.test(codigo) && /^\s*(?:pass|\.\.\.)\s*$/.test(linhas[i + 1] ?? '')) achados.push(`${f}:${i + 1}`)
  })
}

if (achados.length) {
  console.error('\ngate lint-swallow: erro ENGOLIDO (falha silenciosa) no que vai ser commitado:')
  for (const a of achados) console.error(`  ${a}`)
  // O texto abaixo NAO pode conter o padrao que o gate procura: ele seria o primeiro
  // achado de si mesmo (o gate julga a arvore INTEIRA no modo prova, este arquivo incluso).
  console.error('\n  `catch` com corpo vazio e `except: pass` escondem a falha — trate, propague ou registre o porque')
  console.error('  (com um erro nomeado). Se for mesmo intencional, deixe o motivo escrito no corpo.')
  process.exit(1)
}
process.exit(0)
