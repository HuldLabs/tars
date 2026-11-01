#!/usr/bin/env node
// gate data-layout: doutrina `dados-do-projeto`. Julga so' o staged: repo com `var/` antigo nao
// trava ao atualizar, mas nenhum arquivo NOVO entra fora do padrao.
import { stagedPaths } from '../lib-staged.mjs'

const project = process.env.TARS_PROJECT ?? process.cwd()
const FINALIDADES = ['runtime', 'dev', 'poc', 'bench']

export const foraDoPadrao = (f) =>
  f.startsWith('var/') || (f.startsWith('data/') && !FINALIDADES.includes(f.split('/')[1]))

const staged = stagedPaths(project)
if (staged === null) {
  console.error('gate data-layout: sem git - NAO julguei o staged.')
  process.exit(1)
}
const ruins = staged.filter(foraDoPadrao)
if (ruins.length) {
  console.error('gate data-layout: dado fora do padrao (doutrina dados-do-projeto):')
  for (const f of ruins) console.error(`  ${f}`)
  console.error(`  Use data/<${FINALIDADES.join('|')}>/; var/ nao e' convencao.`)
  process.exit(1)
}
