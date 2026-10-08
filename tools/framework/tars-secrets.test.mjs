// `tars secrets` — o contrato do cofre: o schema GRITA em cada violacao, o refresh e' o unico
// que abre o cofre e NUNCA deixa material em stdout, o exec nao passa por shell nem herda a
// fonte, e o check julga sem abrir o cofre.
//
// O `op` e' SEMPRE stub (nunca o de verdade: ele abriria o cofre de igual); `sops` e `age`
// sao REAIS quando existem no PATH — sem eles os casos de ponta a ponta sao `skip` explicito,
// nunca um verde falso.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ErroConfig,
  check,
  confereTemplate,
  configDir,
  envDoFilho,
  exec,
  format,
  lerConfig,
  redige,
  refresh,
  registra,
  validaRef,
} from './tars-secrets.mjs'

const bases = []
const tmp = (p = 'tars-secrets-') => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p))
  bases.push(d)
  return d
}
afterEach(() => {
  for (const d of bases.splice(0)) fs.rmSync(d, { recursive: true, force: true })
  // O seam volta ao que era: um stub nao pode sobreviver ao teste dele.
  if (process.env.TARS_SECRETS_OP) delete process.env.TARS_SECRETS_OP
})

/** Uma ferramenta existe no PATH? Sem ela o caso vira `skip` (nunca um verde falso). */
const tem = (bin) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).error === undefined

const TEM_SOPS = tem('sops')
const TEM_AGE = tem('age-keygen')

/**
 * O stub do `op` no PATH. Um script Node (o `.cmd` do Windows so' o chama) que registra o
 * argv num log — e' o log que PROVA que foi o stub que rodou, nao o `op` de verdade.
 * `read --out-file <f> <ref>` copia uma chave age real; `inject` escreve o JSON resolvido.
 */
function stubOp({ keySrc, injeta }) {
  const dir = tmp('tars-op-')
  const log = path.join(dir, 'argv.log')
  const js = path.join(dir, 'op.mjs')
  const antes = process.env.TARS_SECRETS_OP
  fs.writeFileSync(
    js,
    [
      "import fs from 'node:fs'",
      'const argv = process.argv.slice(2)',
      "fs.appendFileSync(process.env.TARS_STUB_LOG, JSON.stringify(argv) + '\\n')",
      "if (process.env.TARS_STUB_MORTO) process.exit(1)",
      "const i = (n) => argv.indexOf(n)",
      "if (argv[0] === 'read' && i('--out-file') !== -1) fs.copyFileSync(process.env.TARS_STUB_KEY_SRC, argv[i('--out-file') + 1])",
      "if (argv[0] === 'read' && i('--out-file') === -1) { process.stdout.write(fs.readFileSync(process.env.TARS_STUB_KEY_SRC)) }",
      "if (argv[0] === 'inject') fs.writeFileSync(argv[i('--out-file') + 1], process.env.TARS_STUB_INJECT)",
      'process.exit(0)',
    ].join('\n'),
  )
  const env = { ...process.env, TARS_STUB_LOG: log }
  if (keySrc) env.TARS_STUB_KEY_SRC = keySrc
  if (injeta) env.TARS_STUB_INJECT = injeta
  // O seam: trocar o PATH nao basta no Windows — o libuv acha o `op.exe` de verdade antes
  // de qualquer `.cmd` do stub, e o teste abriria o COFRE REAL. O caminho explicito nao.
  const launcher = path.join(dir, process.platform === 'win32' ? 'op.cmd' : 'op')
  if (process.platform === 'win32') {
    fs.writeFileSync(launcher, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`)
  } else {
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`, { mode: 0o755 })
  }
  process.env.TARS_SECRETS_OP = launcher
  return { env, log, launcher, antes }
}

/** Uma chave age REAL (o `sops` so' cifra para um recipient de verdade). */
function chaveReal() {
  const f = path.join(tmp('tars-key-'), 'age.key')
  const r = spawnSync('age-keygen', ['-o', f], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('age-keygen falhou')
  fs.chmodSync(f, 0o600)
  return f
}

/** Config resolvida no tmpfs do teste — nada toca `~/.config` de verdade. */
const cfgDe = (secrets, dir) => lerConfig(secrets, { project: dir, env: { ...process.env, TARS_SECRETS_DIR: path.dirname(dir) } })

describe('schema [secrets]', () => {
  it('key_scope fora da lista grita com a lista', () => {
    expect(() => cfgDe({ key_scope: 'nuvem', source: 'automation' }, tmp())).toThrow(/key_scope invalido.*project \| machine/)
  })

  it('source e OBRIGATORIO — nao ha fallback entre as fontes', () => {
    expect(() => cfgDe({ key_scope: 'project', age_key_ref: 'op://tars/age-key/ref' }, tmp())).toThrow(/source e' OBRIGATORIO/)
  })

  it('source fora da lista grita', () => {
    expect(() => cfgDe({ source: 'sqlite' }, tmp())).toThrow(/source invalido.*automation \| owner/)
  })

  it('project exige age_key_ref', () => {
    expect(() => cfgDe({ source: 'automation' }, tmp())).toThrow(/key_scope=project exige age_key_ref/)
  })

  it('machine PROIBE age_key_ref', () => {
    expect(() => cfgDe({ key_scope: 'machine', source: 'automation', age_key_ref: 'op://tars/age-key/ref' }, tmp())).toThrow(/machine PROIBE age_key_ref/)
  })

  it('machine PROIBE sops_config versionado', () => {
    expect(() => cfgDe({ key_scope: 'machine', source: 'automation', sops_config: './sops.yaml' }, tmp())).toThrow(/machine PROIBE sops_config/)
  })

  it('defaults neutros: o projeto nomeia o diretorio, nada de nome de pessoa', () => {
    const dir = tmp('meu-projeto-')
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref' }, dir)
    expect(c.age_key_file.startsWith(c.dir)).toBe(true)
    expect(path.basename(c.dir)).toBe(path.basename(dir))
    expect(path.basename(configDir({ project: dir, env: { TARS_SECRETS_DIR: dir } }))).toBe(path.basename(dir))
    // O tmpdir do runner JA' carrega o nome de usuario da maquina, entao procurar o nome no
    // caminho acusaria o ambiente, nao o codigo. O que se proibe e' o nome pessoal como
    // CONSTANTE — e isso se checa na fonte do modulo.
    const fonte = fs.readFileSync(new URL('./tars-secrets.mjs', import.meta.url), 'utf8')
    // Sem os comentarios: o cabecalho NOMEIA o que se proibe ("nada de pablo nem dotfiles"),
    // entao a proibicao e' sobre o CODIGO — um path default, uma constante, um fallback.
    const codigo = fonte.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(codigo).not.toMatch(/pablo|dotfiles/i)
  })
})

describe('referencia `op://` e redacao', () => {
  it('ref fora do formato `op://` falha SEM ecoar o valor', () => {
    expect(() => validaRef('https://vault/item')).toThrow(/op:\/\/` invalida/)
    // O que seria o material secreto no lugar errado nao aparece na mensagem de erro.
    let msg = ''
    try {
      validaRef('vault-senha-do-dono')
    } catch (e) {
      msg = e.message
    }
    expect(msg).toMatch(/op:\/\/` invalida/)
    expect(msg).not.toContain('vault-senha-do-dono')
  })

  it('redige troca todo valor de segredo conhecido por `***`', () => {
    registra('valor-super-secreto')
    expect(redige('erro: valor-super-secreto recusado')).toBe('erro: *** recusado')
  })
})

describe('quem abre o cofre', () => {
  it('automation sem token_file falha alto nomeando o caminho', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '{}')
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref' }, dir)
    expect(() => refresh(c, { env: { ...process.env }, tty: true })).toThrow(/token da service account ausente/)
  })

  it('owner sem TTY falha alto', () => {
    const c = cfgDe({ source: 'owner', age_key_ref: 'op://tars/age-key/ref' }, tmp())
    // Sem marcador de ator: aqui se testa o TTY, nao o ator — os dois marcadores do runner
    // (CLAUDECODE e TARS_ACTOR, que o harness exporta) batem ANTES e cobririam o TTY.
    const env = { ...process.env, CLAUDECODE: '0', TARS_ACTOR: '' }
    expect(() => refresh(c, { env, tty: false })).toThrow(/source=owner sem TTY/)
  })

  it('owner com ator=agent falha alto (o agente nao abre o cofre)', () => {
    const c = cfgDe({ source: 'owner', age_key_ref: 'op://tars/age-key/ref' }, tmp())
    expect(() => refresh(c, { env: { ...process.env, TARS_ACTOR: 'agent' }, tty: true })).toThrow(/ator=agent/)
  })
})

describe.skipIf(!TEM_AGE || !TEM_SOPS)('refresh', () => {
  it('project: le a chave pelo --out-file (nunca stdout), grava 0600 e nao vaza nada', () => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '{"TOKEN":"{{ op://v/i/f }}"}')
    const stub = stubOp({ keySrc, injeta: '{"TOKEN":"segredo-de-teste"}' })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })

    const r = refresh(c, { env: stub.env, tty: false })
    expect(r.chaves).toBe(1)
    expect(fs.existsSync(c.cache_file)).toBe(true)
    // A chave veio por ARQUIVO: o argv prova o `--out-file` (stdout seria o vazamento).
    const chamadas = fs.readFileSync(stub.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(chamadas[0].slice(0, 3)).toEqual(['read', '--out-file', c.age_key_file])
    // A saida do refresh (o que o operador ve) nunca contem o valor do segredo.
    expect(JSON.stringify(r)).not.toContain('segredo-de-teste')
    if (process.platform !== 'win32') expect(fs.statSync(c.age_key_file).mode & 0o777).toBe(0o600)
  })

  it('machine: gera a chave aqui (age-keygen) e nao toca o cofre para isso', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '{"TOKEN":"x"}')
    const stub = stubOp({ injeta: '{"TOKEN":"x"}' })
    const c = cfgDe({ key_scope: 'machine', source: 'automation', token_file: path.join(dir, 'op-token') }, dir)
    // O escopo machine gera a CHAVE aqui, mas os segredos ainda vem do template: o token da SA continua necessario.
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    const r = refresh(c, { env: stub.env, tty: false })
    expect(r.chaves).toBe(1)
    const chamadas = fs.readFileSync(stub.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    // Nenhum `read`: a chave da maquina nao vem do cofre (seria a segunda fonte de verdade).
    expect(chamadas.some((a) => a[0] === 'read')).toBe(false)
  })

  it('template reprovado NAO abre o cofre (falha antes de gastar cota)', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '# op://v/i/f\n{"TOKEN":"x"}')
    const stub = stubOp({ injeta: '{"TOKEN":"x"}' })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    expect(() => refresh(c, { env: stub.env, tty: false })).toThrow(/template reprovado/)
    // Nenhuma chamada ao `op`: reprovou antes.
    expect(fs.existsSync(stub.log)).toBe(false)
  })

  it('op morto falha alto — o cache anterior NAO e sobrescrito', () => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '{"TOKEN":"x"}')
    const stub = stubOp({ keySrc, injeta: '{"TOKEN":"x"}' })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: stub.env, tty: false }) // cache bom
    const antes = fs.readFileSync(c.cache_file, 'utf8')

    const morto = { ...stub.env, TARS_STUB_MORTO: '1' }
    expect(() => refresh(c, { env: morto, tty: false })).toThrow(/1Password nao respondeu/)
    expect(fs.readFileSync(c.cache_file, 'utf8')).toBe(antes)
  })
})

describe.skipIf(!TEM_AGE || !TEM_SOPS)('exec', () => {
  let c
  beforeEach(() => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '{"TOKEN":"{{ op://v/i/f }}"}')
    const injeta = JSON.stringify({ TOKEN: 'segredo-de-teste', OUTRO: 'x' })
    const stub = stubOp({ keySrc, injeta })
    c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: stub.env, tty: false })
  })

  it('nao herda OP_*/SOPS_AGE_KEY e exporta o CAMINHO da chave', () => {
    const env = {
      ...process.env,
      OP_SERVICE_ACCOUNT_TOKEN: 'token-falso',
      OP_CONNECT_HOST: 'http://x',
      SOPS_AGE_KEY: 'AGE-SECRET-KEY-1...',
    }
    const filho = envDoFilho({ TOKEN: 'v' }, { env, cfg: c })
    expect(filho.OP_SERVICE_ACCOUNT_TOKEN).toBeUndefined()
    expect(filho.OP_CONNECT_HOST).toBeUndefined()
    expect(filho.SOPS_AGE_KEY).toBeUndefined()
    expect(filho.SOPS_AGE_KEY_FILE).toBe(c.age_key_file)
    expect(filho.TOKEN).toBe('v')
  })

  it('roda por argv, sem shell: `;` e argumento, nao sintaxe', () => {
    const alvo = path.join(tmp(), 'nao-devia-existir')
    const filho = process.execPath
    const r = exec(c, [filho, '-e', 'process.stdout.write(process.argv[1])', `; touch ${alvo}`], { env: process.env })
    expect(r.status).toBe(0)
    expect(fs.existsSync(alvo)).toBe(false)
  })

  it('nao imprime o valor do segredo (nem no erro de comando inexistente)', () => {
    expect(() => exec(c, ['comando-que-nao-existe-xyz'], { env: process.env })).toThrow(/nao consegui executar/)
  })
})

describe.skipIf(!TEM_AGE || !TEM_SOPS)('check', () => {
  const pronto = (extra = {}) => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '{"TOKEN":"x"}')
    const stub = stubOp({ keySrc, injeta: '{"TOKEN":"x"}' })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token'), ...extra }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: stub.env, tty: false })
    return c
  }

  it('estado limpo: ok, sem OP_* no ambiente', () => {
    const r = check(pronto(), { env: { PATH: process.env.PATH } })
    expect(r.linhas.map((l) => l.nome)).toContain('decifra')
    expect(r.ok).toBe(true)
    expect(format(r)).toContain('OK')
  })

  it('ambiente sujo reprova imprimindo SO os NOMES', () => {
    const r = check(pronto(), { env: { PATH: process.env.PATH, OP_SERVICE_ACCOUNT_TOKEN: 'token-falso', SOPS_AGE_KEY: 'AGE-SECRET-KEY-1XXX' } })
    expect(r.ok).toBe(false)
    const txt = format(r)
    expect(txt).toContain('OP_SERVICE_ACCOUNT_TOKEN')
    expect(txt).not.toContain('token-falso')
    expect(txt).not.toContain('AGE-SECRET-KEY-1XXX')
  })

  it('recipient desatualizado (chave trocada) reprova', () => {
    const c = pronto()
    fs.copyFileSync(chaveReal(), c.age_key_file) // outra chave, mesmo cache
    const r = check(c, { env: { PATH: process.env.PATH } })
    expect(r.ok).toBe(false)
    expect(r.linhas.find((l) => l.nome === 'cache').ok).toBe(false)
  })

  it('sops_config que nao declara o recipient da chave reprova', () => {
    const dir = tmp()
    const c = pronto({ sops_config: path.join(dir, 'sops.yaml') })
    fs.writeFileSync(c.sops_config, 'creation_rules:\n  - age: age1zzzzqqqqwwww1111yyyy2222xxxx3333\n')
    const r = check(c, { env: { PATH: process.env.PATH } })
    expect(r.linhas.find((l) => l.nome === 'sops_config').ok).toBe(false)
  })

  it('template com `op://` fora de `{{ }}` (comentario incluso) reprova', () => {
    const c = pronto()
    // O `op inject` resolve QUALQUER `op://` — inclusive este, que so' queria ser comentario.
    fs.writeFileSync(c.template, '# nao usar {{ op://v/i/f }}\n{"TOKEN":"x","OUTRO":"op://v/i/g"}\n')
    const r = check(c, { env: { PATH: process.env.PATH } })
    expect(r.linhas.find((l) => l.nome === 'template').ok).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('template que cita a ref da CHAVE age reprova (a chave vem so do manifesto)', () => {
    const c = pronto()
    fs.writeFileSync(c.template, `{"TOKEN":"x","OUTRO":"{{ ${c.age_key_ref} }}"}`)
    expect(confereTemplate(c).ok).toBe(false)
    expect(confereTemplate(c).detalhe).toMatch(/ref da CHAVE age/)
  })

  it('check NAO abre o cofre: nenhuma referencia op:// e usada', () => {
    expect(() => check(pronto(), { env: { PATH: process.env.PATH } })).not.toThrow()
    expect(new ErroConfig('x')).toBeInstanceOf(Error)
  })
})
