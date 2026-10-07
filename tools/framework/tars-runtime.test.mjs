// Resolvedor do runtime JS (Incident: `dist/tars` roda gate com `process.execPath` = ele mesmo).
//
// A tabela cobre os QUATRO casos que decidem o destino do gate `.mjs`:
//   binario bun compilado -> reexecuta o proprio binario com `BUN_BE_BUN=1` (vira `bun`);
//   fonte (node/bun)      -> o proprio `process.execPath`;
//   binario sem a flag    -> `node`/`bun` do PATH;
//   nenhum runtime        -> `null`, e o MOTOR grita (nao pode sair 0 calado).
import { describe, expect, it } from 'vitest'
import { jsRuntime } from './tars-runtime.mjs'

const execPath = '/usr/local/bin/algum-runtime'
const bunfs = '/$bunfs/root/tars'

describe('jsRuntime — resolvedor do runtime dos gates .mjs', () => {
  it('binario bun compilado: reexecuta a SI MESMO com BUN_BE_BUN=1', () => {
    expect(jsRuntime({ compiled: true, execPath: bunfs, tem: () => false })).toEqual({
      cmd: bunfs,
      env: { BUN_BE_BUN: '1' },
    })
  })

  it('fonte (node ou bun): o proprio process.execPath, sem flag', () => {
    expect(jsRuntime({ compiled: false, execPath, tem: () => false })).toEqual({ cmd: execPath, env: {} })
  })

  it('execPath dentro do bunfs sem o flag de compilado: cai para node/bun do PATH', () => {
    expect(jsRuntime({ compiled: false, execPath: bunfs, tem: (b) => b === 'node' })).toEqual({ cmd: 'node', env: {} })
    expect(jsRuntime({ compiled: false, execPath: bunfs, tem: (b) => b === 'bun' })).toEqual({ cmd: 'bun', env: {} })
  })

  it('nenhum runtime: null (quem chama falha alto, nunca exit 0)', () => {
    expect(jsRuntime({ compiled: false, execPath: bunfs, tem: () => false })).toBeNull()
  })
})
