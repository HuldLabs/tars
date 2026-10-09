// Helper do `tars secrets refresh` (porte do `secrets-inject.mjs` do segtools). NAO e' ponto
// de entrada: quem o roda e' o `op run --env-file=<template>` do tars-secrets.mjs, que ja'
// resolveu as referencias do template no AMBIENTE deste processo. Aqui so' materializamos os
// NOMES do template como JSON — nunca um nome a mais (o cache tem exatamente a lista do
// template).
//
// Por que `op run` e nao `op inject`: a chave de assinatura e' MULTILINHA, e nos dois formatos
// do `op inject` ela quebra — template JSON entra CRU (JSON invalido) e template dotenv trunca
// no primeiro \n EM SILENCIO. O `op run` entrega o valor INTACTO no ambiente do filho, e o
// `JSON.stringify` daqui escapa a quebra de linha — o unico jeito de o cache carregar essa
// chave. Nada e' impresso alem da contagem de nomes.
//
// Uso (so' pelo op run): node tars-secrets-inject.mjs <template> <saida.json>
import fs from 'node:fs'

const [tpl, out] = process.argv.slice(2)
if (!tpl || !out) {
  console.error('uso: node tars-secrets-inject.mjs <template> <saida.json>')
  process.exit(2)
}

const nomes = fs
  .readFileSync(tpl, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('=')[0].trim())
  .filter(Boolean)

if (!nomes.length) {
  console.error(`[secrets] FATAL: template sem nenhum nome: ${tpl}`)
  process.exit(1)
}

const obj = {}
const faltando = []
for (const n of nomes) {
  const v = process.env[n]
  if (v === undefined || v === '') faltando.push(n)
  else obj[n] = v
}
if (faltando.length) {
  // Falha RUIDOSA: referencia que nao resolveu (campo inexistente, cofre sem acesso) nao pode
  // virar chave ausente no cache. So' os NOMES: valor nunca entra em mensagem.
  console.error(`[secrets] FATAL: referencia nao resolvida para: ${faltando.join(', ')}`)
  process.exit(1)
}

fs.writeFileSync(out, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 })
console.log(`[secrets] ${nomes.length} nome(s) resolvido(s): ${nomes.join(' ')}`)
