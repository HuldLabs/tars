// `tars secrets` (S2b) — o contrato da manipulacao de segredo: UM parser de endereco, compare
// em tempo constante que so' diz `igual`/`diferente`, destino `env:`/`cache:` RECUSADO, `move`
// que nunca apaga a origem sem confirmacao, `rm` que ARQUIVA o item e tira a LINHA certa do
// rc, `scan` que reporta `arquivo:linha` sem o valor, `import` que so' toca o cofre, redacao
// que sobrevive a um valor PARTIDO entre dois pedacos, e auditoria sem nenhum valor.
//
// O `op` e' SEMPRE stub; `sops`/`age-keygen` sao REAIS quando existem no PATH (sem eles os
// casos de ponta a ponta sao `skip` explicito, nunca um verde falso).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decifraMapa, lerConfig, refresh } from './tars-secrets.mjs'
import { comparaValores, execRedigido, parseEndereco, redator, removeLinhaDeEnv, run } from './tars-secrets-ops.mjs'

const bases = []
const tmp = (p = 'tars-ops-') => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p))
  bases.push(d)
  return d
}
afterEach(() => {
  for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true })
  delete process.env.TARS_SECRETS_OP
})

const tem = (bin) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).error === undefined
const TEM_SOPS = tem('sops')
const TEM_AGE = tem('age-keygen')
const TEM_GITLEAKS = tem('gitleaks')

/** Uma chave age REAL (o `sops` so' cifra para um recipient de verdade). */
function chaveReal() {
  const f = path.join(tmp('tars-key-'), 'age.key')
  if (spawnSync('age-keygen', ['-o', f], { encoding: 'utf8' }).status !== 0) throw new Error('age-keygen falhou')
  fs.chmodSync(f, 0o600)
  return f
}

/**
 * O stub do `op`. O estado vive num JSON (`TARS_STUB_JSON`) que os proprios comandos ATUALIZAM
 * — e' o unico jeito de um `set` conferir a releitura: o `item edit` grava, o `read` de volta
 * le' o que foi gravado. `TARS_STUB_EDIT_IGNORA` faz o `item edit` responder OK sem gravar (e'
 * como se prova um destino que NAO confirma). O argv inteiro vai para um log: e' ali que se
 * prova que o valor nunca passou por ele, e que o `rm` usou `--archive`.
 */
function stubOp({ chave = null, item, refs = {}, editIgnora = false } = {}) {
  const dir = tmp('tars-op-')
  const estado = path.join(dir, 'estado.json')
  const log = path.join(dir, 'argv.log')
  const js = path.join(dir, 'op.mjs')
  fs.writeFileSync(estado, JSON.stringify({ chave, item, refs }))
  fs.writeFileSync(log, '')
  fs.writeFileSync(
    js,
    [
      "import { spawnSync } from 'node:child_process'",
      "import fs from 'node:fs'",
      'const argv = process.argv.slice(2)',
      'fs.appendFileSync(process.env.TARS_STUB_LOG, JSON.stringify(argv) + "\\n")',
      'const i = (n) => argv.indexOf(n)',
      "const st = () => JSON.parse(fs.readFileSync(process.env.TARS_STUB_JSON, 'utf8'))",
      "const save = (s) => fs.writeFileSync(process.env.TARS_STUB_JSON, JSON.stringify(s))",
      'const campoDe = (s, ref) => {',
      '  const m = /^op:\\/\\/([^/]+)\\/([^/]+)\\/(.+)$/.exec(ref)',
      '  if (!m || !s.item || s.item.id !== "op://" + m[1] + "/" + m[2]) return null',
      '  return (s.item.fields || []).find((f) => f.id === m[3] || f.label === m[3]) || null',
      '}',
      'if (argv[0] === "read" && i("--out-file") !== -1) {',
      '  const out = argv[i("--out-file") + 1]',
      '  const ref = argv[argv.length - 1]',
      '  const s = st()',
      '  const f = campoDe(s, ref)',
      '  const v = f ? f.value : s.chave && /age-key/.test(ref) ? fs.readFileSync(s.chave, "utf8") : s.refs[ref]',
      '  if (v === undefined) process.exit(1)',
      '  fs.writeFileSync(out, v, { mode: 0o600 })',
      '  process.exit(0)',
      '}',
      'if (argv[0] === "item" && argv[1] === "get") { process.stdout.write(JSON.stringify(st().item)); process.exit(0) }',
      'if (argv[0] === "item" && argv[1] === "edit") {',
      '  if (process.env.TARS_STUB_EDIT_IGNORA) process.exit(0)',
      '  const t = argv.find((a) => a.startsWith("--template=")).slice(11)',
      '  const s = st()',
      '  const novo = JSON.parse(fs.readFileSync(t, "utf8"))',
      '  s.item.fields = s.item.fields || []',
      '  for (const f of novo.fields || []) {',
      '    const j = s.item.fields.findIndex((x) => x.id === f.id)',
      '    if (j === -1) s.item.fields.push(f)',
      '    else s.item.fields[j] = { ...s.item.fields[j], ...f }',
      '  }',
      '  save(s)',
      '  process.exit(0)',
      '}',
      'if (argv[0] === "run") {',
      '  const tpl = argv.find((a) => a.startsWith("--env-file=")).slice(11)',
      '  const nomes = fs.readFileSync(tpl, "utf8").split("\\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split("=")[0].trim())',
      '  const val = JSON.parse(process.env.TARS_STUB_VALORES || "{}")',
      '  const env = { ...process.env }',
      '  for (const n of nomes) env[n] = val[n] !== undefined ? val[n] : "stub-" + n',
      '  const sep = argv.indexOf("--")',
      '  const r = spawnSync(argv[sep + 1], argv.slice(sep + 2), { env, stdio: "inherit" })',
      '  process.exit(r.status ?? 1)',
      '}',
      'process.exit(0)',
    ].join('\n'),
  )
  const launcher = path.join(dir, process.platform === 'win32' ? 'op.cmd' : 'op')
  if (process.platform === 'win32') fs.writeFileSync(launcher, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`)
  else fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`, { mode: 0o755 })
  process.env.TARS_SECRETS_OP = launcher
  const env = { ...process.env, TARS_STUB_LOG: log, TARS_STUB_JSON: estado }
  if (editIgnora) env.TARS_STUB_EDIT_IGNORA = '1'
  return { launcher, log, estado, env }
}

/**
 * Config resolvida no tmpfs do teste — nada toca `~/.config` de verdade. A ref da chave age
 * vem por PADRAO: `key_scope=project` a exige, e o que cada caso varia e' o resto.
 */
const cfgDe = (secrets, dir) =>
  lerConfig({ age_key_ref: 'op://tars/age-key/ref', ...secrets }, { project: dir, env: { ...process.env, TARS_SECRETS_DIR: path.dirname(dir) } })

/**
 * O `env` de DONO. `TARS_ACTOR=human` e `CLAUDECODE` fora sao o que faz o teste representar a
 * mao do dono: com o marcador de agente, `source=owner` recusaria abrir o cofre (por desenho).
 * O `stub.env` entra PRIMEIRO e o resto por cima, senao ele traria o `CLAUDECODE` de volta.
 */
const envDono = (stub) => ({ ...(stub?.env ?? process.env), TARS_ACTOR: 'human', CLAUDECODE: undefined })

const ctxDe = (cfg, extra = {}) => ({
  cfg,
  env: envDono(),
  tty: true,
  confirma: () => true,
  le: () => 'valor-escrito',
  cwd: cfg.projeto,
  home: tmp('tars-home-'),
  ...extra,
})

describe('endereco: um parser so`', () => {
  it('as quatro formas, e cada uma com o TIPO que o resto consulta', () => {
    expect(parseEndereco('op://cofre/item/campo')).toMatchObject({ tipo: 'cofre', item: 'op://cofre/item', campo: 'campo' })
    expect(parseEndereco('file:/x/y').tipo).toBe('file')
    expect(parseEndereco('env:NOME').nome).toBe('NOME')
    expect(parseEndereco('cache:NOME').nome).toBe('NOME')
  })

  it('forma desconhecida falha SEM ecoar o que veio (pode ser o segredo no lugar errado)', () => {
    let msg = ''
    try {
      parseEndereco('senha-do-dono')
    } catch (e) {
      msg = e.message
    }
    expect(msg).toMatch(/endereco invalido/)
    expect(msg).not.toContain('senha-do-dono')
  })

  it('`op://` sem o CAMPO falha: sem campo nao ha o que ler nem onde gravar', () => {
    expect(() => parseEndereco('op://cofre/item')).toThrow(/campo/)
  })
})

describe('compare: so` `igual`/`diferente`, em tempo constante', () => {
  it('mesmo valor; prefixo igual mudando no fim; e o comprimento entra no veredito', () => {
    expect(comparaValores('segredo-a', 'segredo-a')).toBe(true)
    expect(comparaValores('segredo-a', 'segredo-b')).toBe(false)
    // `ab` nao e' `ab\0`: o comprimento e' um bit A MAIS no resultado, nunca um atalho antes.
    expect(comparaValores('ab', 'ab\0')).toBe(false)
    expect(comparaValores('', '')).toBe(true)
  })

  it('imprime SO` a palavra, e o exit segue o veredito', () => {
    const dir = tmp()
    const a = path.join(dir, 'a')
    const b = path.join(dir, 'b')
    fs.writeFileSync(a, 'mesmo-valor-aqui', { mode: 0o600 })
    fs.writeFileSync(b, 'mesmo-valor-aqui', { mode: 0o600 })
    const ctx = ctxDe(cfgDe({ source: 'owner' }, dir))
    const igual = run({ sub: 'compare', rest: [`file:${a}`, `file:${b}`], ...ctx })
    expect(igual.saida).toBe('igual')
    expect(igual.status).toBe(0)
    fs.writeFileSync(b, 'outro-valor-aqui', { mode: 0o600 })
    const dif = run({ sub: 'compare', rest: [`file:${a}`, `file:${b}`], ...ctx })
    expect(dif.saida).toBe('diferente')
    expect(dif.status).toBe(1)
  })

  it.skipIf(process.platform === 'win32')('arquivo frouxo (0644) RECUSA: ler segredo exige 0600/0400', () => {
    const dir = tmp()
    const f = path.join(dir, 'solto')
    fs.writeFileSync(f, 'valor', { mode: 0o644 })
    expect(() => run({ sub: 'compare', rest: [`file:${f}`, `file:${f}`], ...ctxDe(cfgDe({ source: 'owner' }, dir)) })).toThrow(/0600/)
  })
})

describe('fingerprint: so` identidade PUBLICA', () => {
  it.skipIf(!TEM_AGE)('chave age: o recipient (`age-keygen -y`), nunca a chave', () => {
    const dir = tmp()
    const r = run({ sub: 'fingerprint', rest: [`file:${chaveReal()}`], ...ctxDe(cfgDe({ source: 'owner' }, dir)) })
    expect(r.saida).toMatch(/^age1/)
    expect(r.saida).not.toContain('AGE-SECRET-KEY')
  })

  it.skipIf(process.platform === 'win32')('chave SSH: a impressao da publica DERIVADA', () => {
    const dir = tmp()
    const k = path.join(dir, 'id')
    if (spawnSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', k], { encoding: 'utf8' }).status !== 0) return
    const r = run({ sub: 'fingerprint', rest: [`file:${k}`], ...ctxDe(cfgDe({ source: 'owner' }, dir)) })
    expect(r.saida).toMatch(/SHA256:/)
    expect(r.saida).not.toContain('PRIVATE KEY')
  })

  it('senha (nem age, nem SSH) RECUSA — nao existe impressao de senha', () => {
    const dir = tmp()
    const f = path.join(dir, 'senha')
    fs.writeFileSync(f, 'uma-senha-qualquer', { mode: 0o600 })
    expect(() => run({ sub: 'fingerprint', rest: [`file:${f}`], ...ctxDe(cfgDe({ source: 'owner' }, dir)) })).toThrow(
      /sem identidade publica; use compare/,
    )
  })
})

describe('destino: `env:` e `cache:` sao so` ORIGEM', () => {
  const cenario = () => {
    const dir = tmp()
    const origem = path.join(dir, 'origem')
    fs.writeFileSync(origem, 'valor-a-mover', { mode: 0o600 })
    return { origem: `file:${origem}`, ctx: ctxDe(cfgDe({ source: 'owner' }, dir)) }
  }

  it('copy para `cache:` RECUSA, e nomeia a saida certa', () => {
    const { origem, ctx } = cenario()
    expect(() => run({ sub: 'copy', rest: [origem, 'cache:TOKEN'], ...ctx })).toThrow(/grave no cofre e rode .*refresh/)
  })

  it('copy para `env:` RECUSA: ambiente persistente e segunda fonte de verdade', () => {
    const { origem, ctx } = cenario()
    expect(() => run({ sub: 'copy', rest: [origem, 'env:TOKEN'], ...ctx })).toThrow(/PROIBIDO/)
  })

  it('`set` so` grava no COFRE: endereco que nao e `op://` recusa', () => {
    const { origem, ctx } = cenario()
    expect(() => run({ sub: 'set', rest: [origem], ...ctx })).toThrow(/grava no COFRE/)
  })
})

describe('escrita no cofre (op stub)', () => {
  const cenario = (opts = {}) => {
    const dir = tmp()
    const stub = stubOp({ item: { id: 'op://tars/conta', fields: [{ id: 'ref', label: 'ref', value: 'valor-antigo' }] }, ...opts })
    const cfg = cfgDe({ source: 'owner', age_key_ref: 'op://tars/age-key/ref' }, dir)
    return { dir, stub, cfg, ctx: ctxDe(cfg, { env: envDono(stub) }) }
  }

  it('`set` NUNCA poe o valor no argv do `op` — e ele chega ao campo', () => {
    const { stub, ctx } = cenario()
    const r = run({ sub: 'set', rest: ['op://tars/conta/ref'], ...ctx, le: () => 'segredo-novo-aqui' })
    expect(r.status).toBe(0)
    expect(fs.readFileSync(stub.log, 'utf8')).not.toContain('segredo-novo-aqui')
    expect(JSON.parse(fs.readFileSync(stub.estado, 'utf8')).item.fields[0].value).toBe('segredo-novo-aqui')
  })

  it('valor vindo de `--from <endereco>` tambem nao passa por argv', () => {
    const { dir, stub, ctx } = cenario()
    const origem = path.join(dir, 'origem')
    fs.writeFileSync(origem, 'valor-de-outro-lugar', { mode: 0o600 })
    const r = run({ sub: 'set', rest: ['op://tars/conta/ref', '--from', `file:${origem}`], ...ctx })
    expect(r.status).toBe(0)
    expect(fs.readFileSync(stub.log, 'utf8')).not.toContain('valor-de-outro-lugar')
    expect(JSON.parse(fs.readFileSync(stub.estado, 'utf8')).item.fields[0].value).toBe('valor-de-outro-lugar')
  })

  it('`rm` ARQUIVA o ITEM (`op://cofre/item`) — nunca apaga de vez', () => {
    const { stub, ctx } = cenario()
    const r = run({ sub: 'rm', rest: ['op://tars/conta'], ...ctx })
    expect(r.status).toBe(0)
    const argv = fs.readFileSync(stub.log, 'utf8')
    expect(argv).toContain('op://tars/conta')
    expect(argv).toContain('--archive')
    expect(r.saida).toMatch(/ARQUIVADO/)
  })

  it('`rm op://cofre/item/campo` RECUSA: arquivar e` do item inteiro, e a mensagem diz o endereco certo', () => {
    const { stub, ctx } = cenario()
    expect(() => run({ sub: 'rm', rest: ['op://tars/conta/ref'], ...ctx })).toThrow(/arquiva o item INTEIRO.*op:\/\/cofre\/item/)
    // Nada foi tocado: o `op` nem foi chamado.
    expect(fs.readFileSync(stub.log, 'utf8')).not.toContain('delete')
  })

  it('`rm` com [s/N] negado nao toca em nada', () => {
    const { stub, ctx } = cenario()
    const r = run({ sub: 'rm', rest: ['op://tars/conta'], ...ctx, confirma: () => false })
    expect(r.saida).toMatch(/cancelado/)
    expect(fs.readFileSync(stub.log, 'utf8')).not.toContain('delete')
  })
})

describe('copy/move: o destino CONFIRMA antes de qualquer coisa', () => {
  it('`move` copia, confirma e so` entao apaga a origem', () => {
    const dir = tmp()
    const origem = path.join(dir, 'origem')
    fs.writeFileSync(origem, 'valor-unico', { mode: 0o600 })
    const destino = path.join(dir, 'sub', 'destino')
    const r = run({ sub: 'move', rest: [`file:${origem}`, `file:${destino}`], ...ctxDe(cfgDe({ source: 'owner' }, dir)) })
    expect(r.status).toBe(0)
    expect(fs.existsSync(origem)).toBe(false)
    expect(fs.readFileSync(destino, 'utf8')).toBe('valor-unico')
  })

  it('compare falho PRESERVA a origem (destino que devolve outra coisa)', () => {
    const dir = tmp()
    const origem = path.join(dir, 'origem')
    fs.writeFileSync(origem, 'valor-unico-na-origem', { mode: 0o600 })
    // O cofre que aceita o `item edit` sem gravar: o `read` de volta devolve o valor VELHO, o
    // compare reprova e o `move` nao chega a apagar nada.
    const stub = stubOp({ item: { id: 'op://tars/conta', fields: [{ id: 'ref', label: 'ref', value: 'antigo' }] }, editIgnora: true })
    const cfg = cfgDe({ source: 'owner', age_key_ref: 'op://tars/age-key/ref' }, dir)
    expect(() => run({ sub: 'move', rest: [`file:${origem}`, 'op://tars/conta/ref'], ...ctxDe(cfg, { env: envDono(stub) }) })).toThrow(/nao confirma/)
    expect(fs.existsSync(origem), 'a origem e o unico lugar onde o valor existe').toBe(true)
    expect(fs.readFileSync(origem, 'utf8')).toBe('valor-unico-na-origem')
  })
})

describe('rm de `env:` persistente', () => {
  it('tira a LINHA certa do rc e preserva as outras', () => {
    const dir = tmp()
    const rc = path.join(dir, '.bashrc')
    fs.writeFileSync(rc, '# meu rc\nexport OUTRA=1\nexport TOKEN=segredo\nNOME=2\n')
    const r = removeLinhaDeEnv(rc, 'TOKEN', ctxDe(cfgDe({ source: 'owner' }, dir)), { confirmado: true })
    expect(r.status).toBe(0)
    const txt = fs.readFileSync(rc, 'utf8')
    expect(txt).not.toContain('TOKEN')
    expect(txt).toContain('export OUTRA=1')
    expect(txt).toContain('NOME=2')
    expect(fs.existsSync(`${rc}.tars-bak`), 'a copia de seguranca nao fica para tras').toBe(false)
  })

  it('o [s/N] mostra ARQUIVO:LINHA — nunca a linha inteira', () => {
    const dir = tmp()
    const rc = path.join(dir, '.bashrc')
    fs.writeFileSync(rc, 'export TOKEN=segredo-na-linha\n')
    const visto = []
    const r = removeLinhaDeEnv(rc, 'TOKEN', ctxDe(cfgDe({ source: 'owner' }, dir), { confirma: (m) => (visto.push(m), true) }))
    expect(r.status).toBe(0)
    expect(visto.join('')).toMatch(/\.bashrc:1/)
    expect(visto.join('')).not.toContain('segredo-na-linha')
  })

  it('escrita ATOMICA: sem `.tars-bak`, sem `.tars-rm` e o MODO do original fica', () => {
    const dir = tmp()
    const rc = path.join(dir, '.bashrc')
    fs.writeFileSync(rc, 'export TOKEN=segredo\n', { mode: 0o640 })
    fs.chmodSync(rc, 0o640)
    const r = removeLinhaDeEnv(rc, 'TOKEN', ctxDe(cfgDe({ source: 'owner' }, dir)), { confirmado: true })
    expect(r.status).toBe(0)
    expect(fs.existsSync(`${rc}.tars-bak`)).toBe(false)
    expect(fs.existsSync(`${rc}.tars-rm`), 'o tmp do rename nao pode sobreviver').toBe(false)
    if (process.platform !== 'win32') {
      expect(fs.statSync(rc).mode & 0o777, 'um rc 0640 nao vira 0600 por causa de uma linha').toBe(0o640)
    }
  })

  it('preserva o separador DETECTADO (CRLF continua CRLF; LF continua LF)', () => {
    const dir = tmp()
    const crlf = path.join(dir, '.bashrc')
    fs.writeFileSync(crlf, '# rc\r\nexport OUTRA=1\r\nexport TOKEN=segredo\r\nNOME=2\r\n')
    removeLinhaDeEnv(crlf, 'TOKEN', ctxDe(cfgDe({ source: 'owner' }, dir)), { confirmado: true })
    const txt = fs.readFileSync(crlf, 'utf8')
    expect(txt).toBe('# rc\r\nexport OUTRA=1\r\nNOME=2\r\n')
    expect(txt, 'nenhum \\n solto: o perfil nao vira um arquivo misto').not.toMatch(/[^\r]\n/)
    const lf = path.join(dir, '.zshrc')
    fs.writeFileSync(lf, 'export TOKEN=segredo\nexport OUTRA=1\n')
    removeLinhaDeEnv(lf, 'TOKEN', ctxDe(cfgDe({ source: 'owner' }, dir)), { confirmado: true })
    expect(fs.readFileSync(lf, 'utf8')).toBe('export OUTRA=1\n')
  })

  it('nome INVAlido recusa ANTES da RegExp: `.*` nao pode casar a primeira linha', () => {
    const dir = tmp()
    const rc = path.join(dir, '.bashrc')
    const original = '# rc\nexport OUTRA=1\nexport TOKEN=segredo\n'
    fs.writeFileSync(rc, original)
    expect(() => removeLinhaDeEnv(rc, '.*', ctxDe(cfgDe({ source: 'owner' }, dir)), { confirmado: true })).toThrow(/nome invalido/)
    expect(fs.readFileSync(rc, 'utf8'), 'nada foi tocado').toBe(original)
  })

  it('`rm env:NOME` sem `--em` (fora do win32) grita pedindo o arquivo', () => {
    if (process.platform === 'win32') return
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'x'), '')
    expect(() => run({ sub: 'rm', rest: ['env:TOKEN'], ...ctxDe(cfgDe({ source: 'owner' }, dir)) })).toThrow(/--em/)
  })
})

describe.skipIf(!TEM_AGE || !TEM_SOPS)('scan, import, redacao e auditoria (sops/age reais)', () => {
  const VALOR = 'valor-plantado-do-cache-1234'
  const AWS_FALSO = ['AKIA', 'IOSFODNN7EXAMPLE'].join('')

  /** O cofre stub + o cache CIFRADO de verdade, com um valor conhecido dentro. */
  const comCache = ({ item, valores = { TOKEN: VALOR } } = {}) => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=op://v/i/f\n')
    const stub = stubOp({ chave: chaveReal(), item: item ?? { id: 'op://tars/conta', fields: [] } })
    const cfg = cfgDe({ source: 'owner', age_key_ref: 'op://tars/age-key/ref' }, dir)
    refresh(cfg, { env: { ...envDono(stub), TARS_STUB_VALORES: JSON.stringify(valores) }, tty: true })
    return { dir, stub, cfg, ctx: ctxDe(cfg, { env: envDono(stub), cwd: dir }) }
  }

  /**
   * O `env` do scan: o MINIMO. A varredura acusa `AMBIENTE_ACUSADO` no ambiente de quem
   * chama, entao herdar o do runner faria o resultado depender da maquina — nao do codigo.
   */
  const envScan = () => ({ PATH: process.env.PATH, APPDATA: process.env.APPDATA, HOME: process.env.HOME })

  it('scan: acha o valor do cache num jsonl e reporta `arquivo:linha` — o VALOR nao sai', async () => {
    const { dir, cfg, ctx } = comCache()
    const home = tmp('tars-home-')
    const jsonl = path.join(home, '.claude', 'projects', 'p', 'sessao.jsonl')
    fs.mkdirSync(path.dirname(jsonl), { recursive: true })
    fs.writeFileSync(jsonl, `{"role":"user"}\n{"text":"a chave e' ${VALOR} aqui"}\n`)
    // Montado em runtime de proposito: um `AKIA...` literal no FONTE seria barrado pelo
    // proprio guard de conteudo do pre-commit (o padrao que este teste exercita).
    fs.writeFileSync(path.join(home, '.bashrc'), `# perfil\nAWS_ACCESS_KEY_ID=${AWS_FALSO}\n`)
    fs.writeFileSync(path.join(dir, 'x.tpl'), '# op://v/i/f em comentario\n')

    const r = await run({ sub: 'scan', rest: [], ...ctx, home, env: envScan() })
    expect(r.status).toBe(1)
    expect(r.saida).toMatch(/sessao\.jsonl:2/)
    expect(r.saida).toMatch(/cache:TOKEN/)
    expect(r.saida).toMatch(/\.bashrc:2/)
    expect(r.saida).toMatch(/aws-access-key-id/)
    expect(r.saida).toMatch(/x\.tpl:1/)
    expect(r.saida, 'o trecho achado NUNCA aparece, nem truncado').not.toContain(VALOR)
    expect(fs.existsSync(cfg.cache_file)).toBe(true)
  })

  it('scan limpo sai 0', async () => {
    const { ctx } = comCache()
    const r = await run({ sub: 'scan', rest: [], ...ctx, home: tmp('tars-home-'), cwd: ctx.cfg.projeto, env: envScan() })
    expect(r.status).toBe(0)
    expect(r.saida).toMatch(/limpo/)
  })

  it('import: cada NOME vira CAMPO, linha de template sai, e a origem fica intacta', () => {
    const { dir, stub, ctx } = comCache({ item: { id: 'op://tars/conta', fields: [] } })
    const env = path.join(dir, '.env')
    const original = '# comentario\nTOKEN=valor-do-env-abcdef\nREF=op://v/i/f\nPLACE={{ op://v/i/g }}\n'
    fs.writeFileSync(env, original, { mode: 0o600 })
    const r = run({ sub: 'import', rest: [env, '--item', 'op://tars/conta'], ...ctx })
    expect(r.status).toBe(0)
    expect(r.saida).toBe('TOKEN=op://tars/conta/TOKEN')
    expect(JSON.parse(fs.readFileSync(stub.estado, 'utf8')).item.fields.map((f) => f.id)).toEqual(['TOKEN'])
    expect(fs.readFileSync(env, 'utf8'), 'a origem nao e tocada').toBe(original)
    expect(fs.readFileSync(stub.log, 'utf8'), 'o valor nunca passa por argv').not.toContain('valor-do-env-abcdef')
  })

  it('redacao: o valor sai `***` no pipe — inclusive partido entre dois pedacos', async () => {
    const { cfg } = comCache()
    const meio = Math.floor(VALOR.length / 2)
    const script = `process.stdout.write(${JSON.stringify(VALOR.slice(0, meio))});setTimeout(()=>process.stdout.write(${JSON.stringify(VALOR.slice(meio))}),40)`
    const saida = { chunks: [], write(s) { this.chunks.push(s) } }
    const r = await execRedigido(cfg, [process.execPath, '-e', script], {
      env: process.env,
      ttySaida: false,
      saida,
      erro: { write() {} },
    })
    expect(r.status).toBe(0)
    const texto = saida.chunks.join('')
    expect(texto).toContain('***')
    expect(texto).not.toContain(VALOR)
    expect(texto, 'nem a METADE que saiu no primeiro pedaco').not.toContain(VALOR.slice(0, meio))
  })

  it('o redator segura o rabo e devolve tudo no fim', () => {
    // O piso e' o tamanho do MAIOR valor: enquanto o buffer nao passa disso nada sai, porque
    // qualquer pedaco curto pode ser o comeco de um valor que ainda vai chegar.
    const r = redator(['segredo-completo'])
    expect(r.empurra('antes ')).toBe('')
    const texto = [r.empurra('segredo-'), r.empurra('completo e depois'), r.fim()].join('')
    expect(texto).toContain('antes ')
    expect(texto).toContain('***')
    expect(texto).not.toContain('segredo-completo')
  })

  it('audit.log registra a operacao e NAO carrega nenhum valor do cache', () => {
    const { cfg, ctx } = comCache()
    run({ sub: 'compare', rest: ['cache:TOKEN', 'cache:TOKEN'], ...ctx })
    const log = fs.readFileSync(path.join(cfg.dir, 'audit.log'), 'utf8')
    expect(log).toContain('compare')
    expect(log).toContain('igual')
    for (const v of Object.values(decifraMapa(cfg))) {
      expect(log, 'um valor do cache vazou para a auditoria').not.toContain(v)
    }
  })
})

/**
 * O scan de `git` nao tem stub: ou o gitleaks de verdade roda, ou o caso e' `skip` explicito.
 * O valor plantado entra montado em runtime pelo mesmo motivo do teste la' de cima (o guard de
 * conteudo do pre-commit barraria um `AKIA...` literal no proprio fonte).
 */
const AWS_PLANTADO = ['AKIA', 'IOSFODNN7EXAMPLX'].join('')

describe('scan --onde git: relatorio redigido e passo PULADO nunca silencioso', () => {
  const ctxScan = (cfg, cwd, env) => ({ cfg, env, tty: false, confirma: () => true, cwd, home: tmp('tars-home-') })

  it.skipIf(!TEM_GITLEAKS)('gitleaks acha um segredo COMMITADO; o valor plantado NAO sai na saida', async () => {
    const repo = tmp('tars-scan-git-')
    spawnSync('git', ['init', '-q'], { cwd: repo })
    spawnSync('git', ['config', 'user.email', 'teste@exemplo.invalid'], { cwd: repo })
    spawnSync('git', ['config', 'user.name', 'teste'], { cwd: repo })
    fs.writeFileSync(path.join(repo, 'vazamento.txt'), `AWS_ACCESS_KEY_ID=${AWS_PLANTADO}\n`)
    spawnSync('git', ['add', 'vazamento.txt'], { cwd: repo })
    spawnSync('git', ['commit', '-q', '-m', 'vaza'], { cwd: repo })
    const cfg = cfgDe({ source: 'owner' }, tmp())
    const r = await run({ sub: 'scan', rest: ['--onde', 'git'], ...ctxScan(cfg, repo, { ...process.env }) })
    expect(r.saida).toMatch(/vazamento\.txt:1/)
    expect(r.saida, 'relatorio redigido (`--redact`): do achado sai so` arquivo:linha + a regra').not.toContain(AWS_PLANTADO)
    expect(r.status, '`--onde git` explicito com achado reprova').toBe(1)
  })

  it('sem gitleaks: PULADO visivel (nunca silencio) — e `--onde git` explicito reprova', async () => {
    // PATH sem nada: o `gitleaks` nao existe para o processo-filho, e e' esse o caso de um
    // scanner que nao pode rodar. Um `catch {}` mudo faria o scan sair "limpo" mentindo.
    const cfg = cfgDe({ source: 'owner' }, tmp())
    const ctx = ctxScan(cfg, cfg.projeto, { PATH: '' })
    const padrao = await run({ sub: 'scan', rest: [], ...ctx })
    expect(padrao.saida).toMatch(/git: PULADO \(gitleaks ausente\)/)
    expect(padrao.saida, 'o aviso nao pode sumir atras de um "limpo" seco').toMatch(/limpo \(com 1 aviso/)
    expect(padrao.status, 'no scan padrao o passo pulado e` aviso, nao reprovacao').toBe(0)
    const explicito = await run({ sub: 'scan', rest: ['--onde', 'git'], ...ctx })
    expect(explicito.status, 'pedir `--onde git` e nao ter gitleaks e` falha, nao aviso').toBe(1)
    expect(explicito.saida).toMatch(/git: PULADO \(gitleaks ausente\)/)
  })
})

describe('auditoria: o ator vem do AMBIENTE de quem chama', () => {
  const logDe = (cfg) => JSON.parse(fs.readFileSync(path.join(cfg.dir, 'audit.log'), 'utf8').trim().split('\n').pop())

  /** `compare` de dois enderecos de ambiente nao abre o cofre: exercita a trilha sozinha. */
  const audita = (env) => {
    const dir = tmp()
    const cfg = cfgDe({ source: 'owner' }, dir)
    run({ sub: 'compare', rest: ['env:A', 'env:A'], cfg, env: { ...env, A: 'valor-de-teste' }, tty: false, confirma: () => true, cwd: dir, home: tmp('tars-home-') })
    return logDe(cfg)
  }

  it('agente (TARS_ACTOR=agent) e` registrado como `agent` — nao o `human` de `actor({})`', () => {
    expect(audita({ ...envDono(), TARS_ACTOR: 'agent' }).ator).toBe('agent')
  })

  it('CLAUDECODE=1 tambem denuncia o agente', () => {
    expect(audita({ TARS_ACTOR: undefined, CLAUDECODE: '1' }).ator).toBe('agent')
  })

  it('sem marcador nenhum, o silencio e` `human`', () => {
    expect(audita({ TARS_ACTOR: undefined, CLAUDECODE: undefined }).ator).toBe('human')
  })
})
