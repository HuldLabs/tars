// `tars self-update` (dev.23): atualizar com um comando, sha256 conferido, nada trocado no erro.
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assetName, escolher, selfUpdate, shaDe } from './tars-self-update.mjs'

const BIN = Buffer.from('#!/bin/sh\necho 0.0.1-dev.9\n')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const releases = (sums) => [
  {
    tag_name: 'v0.0.1-dev.9',
    draft: false,
    assets: [
      { name: 'tars-linux-amd64', url: 'u/bin' },
      { name: 'sha256sums', url: 'u/sums' },
    ],
  },
  { tag_name: 'v0.0.1-dev.8', draft: false, assets: [] },
]
const fake = (sums) => async (url) => {
  const corpo = url.includes('/releases?') ? JSON.stringify(releases(sums)) : url === 'u/sums' ? sums : BIN
  return { ok: true, status: 200, json: async () => JSON.parse(corpo), text: async () => String(corpo), arrayBuffer: async () => corpo }
}
const exe = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-su-'))
  const f = path.join(d, 'tars')
  fs.writeFileSync(f, 'velho')
  return f
}
const base = { env: { GH_TOKEN: 'x' }, log: () => {}, nome: 'tars-linux-amd64' }

describe('tars self-update', () => {
  it('asset por maquina: x64/arm64, glibc/musl; arquitetura sem binario falha alto', () => {
    expect(assetName({ arch: 'x64', musl: false })).toBe('tars-linux-amd64')
    expect(assetName({ arch: 'arm64', musl: true })).toBe('tars-linux-arm64-musl')
    expect(() => assetName({ arch: 'ia32', musl: false })).toThrow(/sem binario/)
  })

  it('sha256sums: acha o nome exato; ausente falha alto', () => {
    expect(shaDe('aa  tars-linux-amd64\nbb  tars-linux-amd64-musl\n', 'tars-linux-amd64-musl')).toBe('bb')
    expect(() => shaDe('aa  outro\n', 'tars-linux-amd64')).toThrow(/ausente/)
  })

  it('escolhe a mais recente ou a versao pedida; inexistente falha alto', () => {
    const r = releases('')
    expect(escolher(r).tag_name).toBe('v0.0.1-dev.9')
    expect(escolher(r, '0.0.1-dev.8').tag_name).toBe('v0.0.1-dev.8')
    expect(() => escolher(r, '9.9.9')).toThrow(/nao encontrada/)
  })

  it('troca o binario quando o sha256 bate', async () => {
    const f = exe()
    const r = await selfUpdate({ ...base, atual: '0.0.1-dev.8', exe: f, fetchFn: fake(`${sha(BIN)}  tars-linux-amd64\n`) })
    expect(r).toEqual({ mudou: true, versao: '0.0.1-dev.9' })
    expect(fs.readFileSync(f)).toEqual(BIN)
    expect(fs.statSync(f).mode & 0o111).not.toBe(0)
  })

  it('self-update concorrente: nao toca no .tmp de outro processo', async () => {
    const f = exe()
    const alheio = path.join(path.dirname(f), '.tars-0.0.1-dev.9.tmp') // nome fixo da dev.26
    fs.writeFileSync(alheio, 'do outro')
    await selfUpdate({ ...base, atual: '0.0.1-dev.8', exe: f, fetchFn: fake(`${sha(BIN)}  tars-linux-amd64\n`) })
    expect(fs.readFileSync(alheio, 'utf8')).toBe('do outro')
    expect(fs.readFileSync(f)).toEqual(BIN)
  })

  it('repo publico: baixa sem token; anonima falhou, tenta com token', async () => {
    const ok = fake(`${sha(BIN)}  tars-linux-amd64\n`)
    const auths = []
    const fn = (falha) => async (u, o) => (auths.push(o.headers.Authorization), !o.headers.Authorization && falha ? { ok: false, status: 403 } : ok(u))
    const semToken = { ...base, env: {}, atual: '0.0.1-dev.8' }
    expect((await selfUpdate({ ...semToken, exe: exe(), fetchFn: fn(false) })).mudou).toBe(true)
    expect(auths.every((a) => a === undefined)).toBe(true)
    auths.length = 0
    expect((await selfUpdate({ ...base, atual: '0.0.1-dev.8', exe: exe(), fetchFn: fn(true) })).mudou).toBe(true)
    expect(auths).toEqual([undefined, 'Bearer x', 'Bearer x', 'Bearer x']) // depois do 1o 403, so' com token
    await expect(selfUpdate({ ...semToken, env: { PATH: '' }, exe: exe(), fetchFn: fn(true) })).rejects.toThrow(/403 .* sem token/)
  })

  it('sha256 diferente: NADA e trocado', async () => {
    const f = exe()
    await expect(selfUpdate({ ...base, atual: '0.0.1-dev.8', exe: f, fetchFn: fake(`${'0'.repeat(64)}  tars-linux-amd64\n`) })).rejects.toThrow(/NAO bate/)
    expect(fs.readFileSync(f, 'utf8')).toBe('velho')
  })

  it('ja na versao: idempotente, nada baixado', async () => {
    const f = exe()
    let chamadas = 0
    const fn = async (u) => (chamadas++, fake('')(u))
    expect(await selfUpdate({ ...base, atual: '0.0.1-dev.9', exe: f, fetchFn: fn })).toEqual({ mudou: false, versao: '0.0.1-dev.9' })
    expect(chamadas).toBe(1) // so' a lista de releases
    expect(fs.readFileSync(f, 'utf8')).toBe('velho')
  })

  it('sem --version nunca rebaixa (atual mais nova que a ultima Release)', async () => {
    const f = exe()
    expect(await selfUpdate({ ...base, atual: '0.0.1-dev.10', exe: f, fetchFn: fake('') })).toEqual({ mudou: false, versao: '0.0.1-dev.10' })
    expect(fs.readFileSync(f, 'utf8')).toBe('velho')
  })

  it('pelo fonte (execPath = node) recusa: nunca sobrescreve o runtime', async () => {
    await expect(selfUpdate({ ...base, atual: 'x', exe: '/usr/bin/node', fetchFn: fake('') })).rejects.toThrow(/binario publicado/)
  })
})
