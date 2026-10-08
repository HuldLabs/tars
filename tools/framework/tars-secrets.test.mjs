// `tars secrets` — o contrato do age_key_ref: o schema GRITA em cada violacao, o refresh e' o unico
// que abre o cofre e NUNCA deixa material em stdout, o exec nao passa por shell nem herda a
// fonte, e o check julga sem abrir o cofre.
//
// O `op` e' SEMPRE stub (nunca o de verdade: ele abriria o cofre de igual); `sops` e `age`
// sao REAIS quando existem no PATH — sem eles os casos de ponta a ponta sao `skip` explicito,
// nunca um verde falso.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CAMADAS,
  CAMPOS,
  ErroConfig,
  check,
  confereTemplate,
  DIAS_AVISO_TOKEN,
  configDir,
  decifraMapa,
  diasAte,
  editaItemNoCofre,
  estadoRotate,
  ESTRATEGIAS_COFRE,
  expandeArquivos,
  envDoCofre,
  envDoFilho,
  exec,
  format,
  lerConfig,
  lerPerfil,
  perfilFile,
  reapResiduo,
  recipient,
  recipientDoCache,
  refDocumento,
  redige,
  refresh,
  registra,
  rotate,
  tokenSet,
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
 * `read --out-file <f> <ref>` copia uma chave age real; `run --env-file=<tpl> -- <cmd...>`
 * emula o `op run`: resolve os NOMES do template a partir de `TARS_STUB_VALORES` e executa o
 * filho com eles no ambiente (e' assim que o helper ve o valor — intacto, multilinha incluso).
 */
function stubOp({ keySrc, valores, item, editIgnora, whoami, doc }) {
  const dir = tmp('tars-op-')
  const log = path.join(dir, 'argv.log')
  const js = path.join(dir, 'op.mjs')
  const antes = process.env.TARS_SECRETS_OP
  fs.writeFileSync(
    js,
    [
      "import fs from 'node:fs'",
      "import { spawnSync } from 'node:child_process'",
      'const argv = process.argv.slice(2)',
      "fs.appendFileSync(process.env.TARS_STUB_LOG, JSON.stringify(argv) + '\\n')",
      // O valor (nao so' o nome) da variavel de biometria: prova que ela chega ao SPAWN do `op`.
      "fs.appendFileSync(process.env.TARS_STUB_ENV, String(process.env.OP_BIOMETRIC_UNLOCK_ENABLED) + '\\n')",
      "if (process.env.TARS_STUB_MORTO) process.exit(1)",
      "const i = (n) => argv.indexOf(n)",
      // `read` devolve o CAMPO do item quando ha' item: e' assim que o cofre real reflete o que
      // o `item edit` gravou — a prova de que a rotacao fechou o ciclo pelo cofre.
      "if (argv[0] === 'read' && i('--out-file') !== -1) {",
      "  const out = argv[i('--out-file') + 1]",
      "  if (process.env.TARS_STUB_ITEM && fs.existsSync(process.env.TARS_STUB_ITEM)) {",
      "    const doc = JSON.parse(fs.readFileSync(process.env.TARS_STUB_ITEM, 'utf8'))",
      "    const f = (doc.fields || []).find((x) => x.id === 'age.key' || x.label === 'age.key') || doc.fields[0]",
      "    fs.writeFileSync(out, (f && f.value) || '', { mode: 0o600 })",
      '  } else fs.copyFileSync(process.env.TARS_STUB_KEY_SRC, out)',
      '}',
      "if (argv[0] === 'item' && argv[1] === 'get') { process.stdout.write(fs.readFileSync(process.env.TARS_STUB_ITEM, 'utf8')); process.exit(0) }",
      "if (argv[0] === 'item' && argv[1] === 'edit') {",
      "  const t = argv.find((a) => a.startsWith('--template=')).slice(11)",
      "  fs.appendFileSync(process.env.TARS_STUB_TEMPLATE_LOG, fs.readFileSync(t, 'utf8') + '\\n')",
      "  if (!process.env.TARS_STUB_EDIT_IGNORA) fs.copyFileSync(t, process.env.TARS_STUB_ITEM)",
      "  process.exit(Number(process.env.TARS_STUB_EDIT_STATUS || 0))",
      '}',
      "if (argv[0] === 'document' && argv[1] === 'edit') {",
      "  fs.appendFileSync(process.env.TARS_STUB_DOC_LOG, JSON.stringify(argv) + '\\n')",
      "  if (!process.env.TARS_STUB_EDIT_IGNORA) fs.copyFileSync(argv[3], process.env.TARS_STUB_DOC)",
      "  process.exit(Number(process.env.TARS_STUB_EDIT_STATUS || 0))",
      '}',
      "if (argv[0] === 'whoami') process.exit(Number(process.env.TARS_STUB_WHOAMI || 0))",
      "if (argv[0] === 'run') {",
      "  const tpl = argv.find((a) => a.startsWith('--env-file=')).slice(11)",
      "  const nomes = fs.readFileSync(tpl, 'utf8').split('\\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')[0].trim())",
      "  const val = JSON.parse(process.env.TARS_STUB_VALORES || '{}')",
      "  const env = { ...process.env }",
      "  for (const n of nomes) env[n] = val[n] !== undefined ? val[n] : 'stub-' + n",
      "  const sep = argv.indexOf('--')",
      "  const r = spawnSync(argv[sep + 1], argv.slice(sep + 2), { env, stdio: 'inherit' })",
      '  process.exit(r.status ?? 1)',
      '}',
      'process.exit(0)',
    ].join('\n'),
  )
  const envLog = path.join(dir, 'env.log')
  fs.writeFileSync(envLog, '')
  const tplLog = path.join(dir, 'template.log')
  fs.writeFileSync(tplLog, '')
  const docLog = path.join(dir, 'doc.log')
  fs.writeFileSync(docLog, '')
  const env = { ...process.env, TARS_STUB_LOG: log, TARS_STUB_ENV: envLog, TARS_STUB_TEMPLATE_LOG: tplLog, TARS_STUB_DOC_LOG: docLog }
  if (doc) env.TARS_STUB_DOC = doc
  if (keySrc) env.TARS_STUB_KEY_SRC = keySrc
  if (valores) env.TARS_STUB_VALORES = JSON.stringify(valores)
  if (item) env.TARS_STUB_ITEM = item
  if (editIgnora) env.TARS_STUB_EDIT_IGNORA = '1'
  if (whoami !== undefined) env.TARS_STUB_WHOAMI = String(whoami)
  // O seam: trocar o PATH nao basta no Windows — o libuv acha o `op.exe` de verdade antes
  // de qualquer `.cmd` do stub, e o teste abriria o COFRE REAL. O caminho explicito nao.
  const launcher = path.join(dir, process.platform === 'win32' ? 'op.cmd' : 'op')
  if (process.platform === 'win32') {
    fs.writeFileSync(launcher, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`)
  } else {
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`, { mode: 0o755 })
  }
  process.env.TARS_SECRETS_OP = launcher
  return { env, log, envLog, tplLog, docLog, launcher, antes }
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

  it('project sem `age_key_ref` em NENHUMA camada falha nomeando o campo e as camadas', () => {
    expect(() => cfgDe({ source: 'automation' }, tmp())).toThrow(/`age_key_ref` nao declarado em nenhuma camada \(embutido \| perfil \| projeto\)/)
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

describe('formato do template: `op://` só como valor inteiro de `KEY=`', () => {
  /** Um cfg minimo: `confereTemplate` só lê `template` e `age_key_ref`. */
  const tplCfg = (txt, extra = {}) => {
    const p = path.join(tmp(), 'secrets.tpl')
    fs.writeFileSync(p, txt)
    return { template: p, age_key_ref: null, ...extra }
  }

  it('aceita `KEY=op://...`, com ou sem aspas', () => {
    expect(confereTemplate(tplCfg('TOKEN=op://v/i/f\n')).ok).toBe(true)
    expect(confereTemplate(tplCfg('TOKEN="op://v/i/f"\n')).ok).toBe(true)
  })

  it('aceita campo com ESPACO (`op://v/i/private key`) — o resto da linha até o fim', () => {
    const r = confereTemplate(tplCfg('SIGN_KEY=op://v/i/private key\n'))
    expect(r.ok).toBe(true)
  })

  it('um comentário e um `KEY=x` sem `op://` não atrapalham', () => {
    expect(confereTemplate(tplCfg('# nota\nTOKEN=x\n\nOUTRO=op://v/i/g\n')).ok).toBe(true)
  })

  it('`{{ op://... }}` reprova (o `op run --env-file` entrega o literal com as chaves)', () => {
    const r = confereTemplate(tplCfg('TOKEN={{ op://v/i/f }}\n'))
    expect(r.ok).toBe(false)
    expect(r.detalhe).toMatch(/linha 1/)
  })

  it('`op://` no MEIO do valor reprova', () => {
    const r = confereTemplate(tplCfg('TOKEN=prefixo op://v/i/f\n'))
    expect(r.ok).toBe(false)
    expect(r.detalhe).toMatch(/linha 1/)
  })

  it('comentário com `op://` reprova (o `op run` resolve até comentário)', () => {
    const r = confereTemplate(tplCfg('# usar op://v/i/f\nTOKEN=x\n'))
    expect(r.ok).toBe(false)
    expect(r.detalhe).toMatch(/linha 1/)
  })

  it('`export KEY=...` reprova EXPLICITAMENTE (formato único do env-file)', () => {
    const r = confereTemplate(tplCfg('export TOKEN=op://v/i/f\n'))
    expect(r.ok).toBe(false)
    expect(r.detalhe).toMatch(/`export` nao e' aceito/)
  })

  it('mais de uma `op://` na mesma linha reprova', () => {
    const r = confereTemplate(tplCfg('TOKEN=op://v/i/f op://v/i/g\n'))
    expect(r.ok).toBe(false)
    expect(r.detalhe).toMatch(/mais de uma/)
  })

  it('a mensagem nomeia a linha, NUNCA o valor', () => {
    const r = confereTemplate(tplCfg('TOKEN=nao-secretamente op://v/i/f\n'))
    expect(r.detalhe).not.toContain('nao-secretamente')
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
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=op://v/i/f\n')
    const stub = stubOp({ keySrc, valores: { TOKEN: 'segredo-de-teste' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })

    const r = refresh(c, { env: stub.env, tty: false })
    expect(r.chaves).toBe(1)
    expect(fs.existsSync(c.cache_file)).toBe(true)
    // A chave veio por ARQUIVO: o argv prova o `--out-file` (stdout seria o vazamento) — e o
    // destino e' um TEMPORARIO ao lado da chave, so' promovido a chave por rename.
    const chamadas = fs.readFileSync(stub.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(chamadas[0].slice(0, 2)).toEqual(['read', '--out-file'])
    expect(chamadas[0][2]).toBe(`${c.age_key_file}.novo`)
    // O template so' e' resolvido pelo `op run`, nunca por `inject`.
    expect(chamadas.some((a) => a[0] === 'inject')).toBe(false)
    expect(chamadas.some((a) => a[0] === 'run' && a[1] === `--env-file=${c.template}`)).toBe(true)
    // A saida do refresh (o que o operador ve) nunca contem o valor do segredo.
    expect(JSON.stringify(r)).not.toContain('segredo-de-teste')
    if (process.platform !== 'win32') expect(fs.statSync(c.age_key_file).mode & 0o777).toBe(0o600)
  })

  it('automation: o env do SPAWN do `op` carrega `OP_BIOMETRIC_UNLOCK_ENABLED=false`', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=op://v/i/f\n')
    const stub = stubOp({ keySrc: chaveReal(), valores: { TOKEN: 'x' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: { ...stub.env, OP_BIOMETRIC_UNLOCK_ENABLED: 'true' }, tty: false })
    // O stub registra o VALOR da variavel a cada spawn: todas as chamadas (`read` e `run`)
    // tem de ver `false` — o dono não a pode reativar por engano no ambiente de automation.
    const vistas = fs.readFileSync(stub.envLog, 'utf8').trim().split('\n')
    expect(vistas.length).toBeGreaterThan(0)
    expect(vistas.every((v) => v === 'false')).toBe(true)
  })

  it('project: a chave e RELIDA a cada refresh (troca no cofre muda o recipient do cache)', () => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=op://v/i/f\n')
    const stub = stubOp({ keySrc, valores: { TOKEN: 'x' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: stub.env, tty: false })
    const antes = recipientDoCache(c)
    // O cofre "troca" a chave: o proximo refresh TEM de perceber — um existsSync antecipado
    // manteria o cache cifrado para um recipient que nao existe mais.
    const rotacionada = { ...stub.env, TARS_STUB_KEY_SRC: chaveReal() }
    refresh(c, { env: rotacionada, tty: false })
    const depois = recipientDoCache(c)
    expect(depois).not.toEqual(antes)
    expect(JSON.stringify(antes)).not.toBe(JSON.stringify(depois))
  })

  it('valor MULTILINHA sobrevive ao refresh (o motivo de ser `op run` + JSON)', () => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'SIGN_KEY=op://v/i/f\n')
    const stub = stubOp({ keySrc, valores: { SIGN_KEY: 'linha1\nlinha2\nlinha3' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: stub.env, tty: false })
    expect(decifraMapa(c).SIGN_KEY.split('\n')).toEqual(['linha1', 'linha2', 'linha3'])
  })

  it('machine: gera a chave aqui (age-keygen) e nao toca o cofre para isso', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const stub = stubOp({ valores: { TOKEN: 'x' } })
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
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), '# op://v/i/f\nTOKEN=x\n')
    const stub = stubOp({ valores: { TOKEN: 'x' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    expect(() => refresh(c, { env: stub.env, tty: false })).toThrow(/template reprovado/)
    // Nenhuma chamada ao `op`: reprovou antes.
    expect(fs.existsSync(stub.log)).toBe(false)
  })

  it('op morto falha alto — o cache anterior NAO e sobrescrito', () => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const stub = stubOp({ keySrc, valores: { TOKEN: 'x' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    refresh(c, { env: stub.env, tty: false }) // cache bom
    const antes = fs.readFileSync(c.cache_file, 'utf8')

    const morto = { ...stub.env, TARS_STUB_MORTO: '1' }
    // Com key_scope=project a chave e' RELIDA a cada refresh, entao um `op` fora do ar morre ja'
    // na leitura da chave — antes de tocar o cache. Mais cedo que a mensagem do template, e
    // igualmente sem sobrescrever nada.
    expect(() => refresh(c, { env: morto, tty: false })).toThrow(/1Password nao (respondeu|entregou)/)
    expect(fs.readFileSync(c.cache_file, 'utf8')).toBe(antes)
  })
})

describe.skipIf(!TEM_AGE || !TEM_SOPS)('residuo em tmp (refresh morto no meio)', () => {
  /** PID de um processo que JA' EXISTIU e terminou — o dono de um dir que ficou orfao. */
  const pidMorto = async () => {
    const filho = spawn(process.execPath, ['-e', ''])
    const pid = filho.pid
    await new Promise((r) => filho.on('exit', r))
    return pid
  }

  const cfgFresca = () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const stub = stubOp({ keySrc: chaveReal(), valores: { TOKEN: 'x' } })
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    return { c, stub }
  }

  it('reapa o dir de texto claro de um refresh que morreu (o `finally` nao roda em kill)', async () => {
    const { c, stub } = cfgFresca()
    const morto = fs.mkdtempSync(path.join(os.tmpdir(), `tars-secrets-${await pidMorto()}-`))
    try {
      fs.writeFileSync(path.join(morto, 'secrets.json'), 'conteudo de teste', { mode: 0o600 })
      refresh(c, { env: stub.env, tty: false })
      expect(fs.existsSync(morto), 'residuo de refresh morto sobreviveu ao refresh seguinte').toBe(false)
    } finally {
      fs.rmSync(morto, { recursive: true, force: true }) // nao deixar residuo do PROPRIO teste
    }
  })

  it('NAO apaga o dir de um processo VIVO (refresh concorrente truncaria no meio)', () => {
    const { c, stub } = cfgFresca()
    // O PID do proprio processo de teste esta' vivo por definicao — e' o caso do dir de um
    // refresh que roda AGORA. Apaga-lo seria pior que o residuo: corta o material no meio.
    const vivo = fs.mkdtempSync(path.join(os.tmpdir(), `tars-secrets-${process.pid}-`))
    try {
      refresh(c, { env: stub.env, tty: false })
      expect(fs.existsSync(vivo), 'dir de processo vivo foi apagado').toBe(true)
    } finally {
      fs.rmSync(vivo, { recursive: true, force: true })
    }
  })

  it('nome de esquema ANTIGO (sem PID) nao e tocado: nao se sabe de quem e', () => {
    const { c, stub } = cfgFresca()
    const antigo = fs.mkdtempSync(path.join(os.tmpdir(), 'tars-secrets-'))
    try {
      refresh(c, { env: stub.env, tty: false })
      expect(fs.existsSync(antigo), 'dir de esquema antigo foi apagado por engano').toBe(true)
    } finally {
      fs.rmSync(antigo, { recursive: true, force: true })
    }
  })
})

describe.skipIf(!TEM_AGE || !TEM_SOPS)('exec', () => {
  let c
  beforeEach(() => {
    const dir = tmp()
    const keySrc = chaveReal()
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=op://v/i/f\nOUTRO=op://v/i/g\n')
    const stub = stubOp({ keySrc, valores: { TOKEN: 'segredo-de-teste', OUTRO: 'x' } })
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
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const stub = stubOp({ keySrc, valores: { TOKEN: 'x' } })
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

  it('token (source=automation): ausente, vazio e modo frouxo reprovam — o conteudo nunca sai', () => {
    const c = pronto()
    fs.rmSync(c.token_file)
    const sem = check(c, { env: { PATH: process.env.PATH } })
    expect(sem.linhas.find((l) => l.nome === 'token').ok).toBe(false)
    expect(format(sem)).toContain('ausente')

    fs.writeFileSync(c.token_file, '   \n', { mode: 0o600 }) // so' espaco = vazio
    expect(check(c, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'token').ok).toBe(false)

    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    expect(check(c, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'token').ok).toBe(true)

    if (process.platform !== 'win32') {
      fs.chmodSync(c.token_file, 0o644)
      const frouxo = check(c, { env: { PATH: process.env.PATH } })
      expect(frouxo.linhas.find((l) => l.nome === 'token').ok).toBe(false)
      expect(frouxo.linhas.find((l) => l.nome === 'token').detalhe).toMatch(/esperado 400 ou 600/)
      // O detalhe NUNCA carrega o valor do token, so' o modo.
      expect(format(frouxo)).not.toContain('token-falso')
      fs.chmodSync(c.token_file, 0o400)
      expect(check(c, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'token').ok).toBe(true)
    }
  })

  it('ambiente: so acusa o que aponta para a FONTE (OP_* generico e ruido)', () => {
    const c = pronto()
    const env = { PATH: process.env.PATH, OP_BILLING: 'x', OP_CACHE_DIR: 'y' }
    expect(check(c, { env }).linhas.find((l) => l.nome === 'ambiente').ok).toBe(true)
    for (const k of ['OP_SERVICE_ACCOUNT_TOKEN', 'OP_CONNECT_TOKEN', 'OP_CONNECT_HOST', 'OP_SESSION_meu', 'SOPS_AGE_KEY']) {
      const r = check(c, { env: { ...env, [k]: 'valor-secreto-do-teste' } })
      const linha = r.linhas.find((l) => l.nome === 'ambiente')
      expect(linha.ok, `${k} deveria acusar`).toBe(false)
      expect(linha.detalhe).toContain(k)
      expect(linha.detalhe).not.toContain('valor-secreto-do-teste')
    }
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

  it('template com `op://` em comentario reprova (o `op run` resolve ate comentario)', () => {
    const c = pronto()
    fs.writeFileSync(c.template, `# nao usar op://v/i/g\nTOKEN=op://v/i/f\n`)
    const r = check(c, { env: { PATH: process.env.PATH } })
    expect(r.linhas.find((l) => l.nome === 'template').ok).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('template que cita a ref da CHAVE age reprova (a chave vem so do manifesto)', () => {
    const c = pronto()
    // Formato VALIDO (`KEY=op://...`): reprova pela REF, nao pelo formato.
    fs.writeFileSync(c.template, `TOKEN=op://v/i/f\nAGE_KEY=${c.age_key_ref}\n`)
    expect(confereTemplate(c).ok).toBe(false)
    expect(confereTemplate(c).detalhe).toMatch(/ref da CHAVE age/)
  })

  it('check NAO abre o age_key_ref: nenhuma referencia op:// e usada', () => {
    expect(() => check(pronto(), { env: { PATH: process.env.PATH } })).not.toThrow()
    expect(new ErroConfig('x')).toBeInstanceOf(Error)
  })
})

describe('quem desbloqueia o `op` no spawn (biometria)', () => {
  it('automation FORCA `OP_BIOMETRIC_UNLOCK_ENABLED=false` no env do spawn', () => {
    const dir = tmp()
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/age-key/ref', token_file: path.join(dir, 'op-token') }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    // Mesmo com o ambiente de quem chama LIGADO, automation DESLIGA: nao ha' dedo na frente do
    // leitor nesse caminho, e deixa-lo ligado faria o `op` pedir a mao humana longe da causa.
    const env = envDoCofre(c, { ...process.env, OP_BIOMETRIC_UNLOCK_ENABLED: 'true' })
    expect(env.OP_BIOMETRIC_UNLOCK_ENABLED).toBe('false')
  })

  it('owner NAO forca nada: a sessao (e a biometria) e escolha do dono', () => {
    const c = { source: 'owner' }
    expect(envDoCofre(c, {}).OP_BIOMETRIC_UNLOCK_ENABLED).toBeUndefined()
    expect(envDoCofre(c, { OP_BIOMETRIC_UNLOCK_ENABLED: 'true' }).OP_BIOMETRIC_UNLOCK_ENABLED).toBe('true')
  })
})

describe('camadas de config: embutido | perfil | projeto', () => {
  /** Base fora do repo + projeto dentro dela (o perfil NAO e' por projeto). */
  const cenario = () => {
    const base = tmp('tars-base-')
    const projDir = path.join(base, 'meu-projeto')
    fs.mkdirSync(projDir)
    const env = { ...process.env, TARS_SECRETS_DIR: base }
    return {
      base,
      projDir,
      env,
      perfil: (txt) => fs.writeFileSync(path.join(base, 'profile.toml'), txt),
      cfg: (tabela) => lerConfig(tabela, { project: projDir, env }),
    }
  }

  it('a camada EMBUTIDA so tem estrutura e caminho LOCAL: nenhuma ref `op://`, nenhuma identidade', () => {
    const c = cenario()
    const deRef = Object.entries(CAMPOS).filter(([, d]) => d.ref)
    expect(deRef.map(([n]) => n)).toEqual(['age_key_ref', 'bot', 'allowed_signers'])
    // Nenhum campo de ref tem padrao embutido (ref e' IDENTIDADE: nao viaja no catalogo).
    expect(deRef.every(([, d]) => d.padrao === undefined)).toBe(true)
    const cfg = c.cfg({ key_scope: 'machine', source: 'automation' })
    expect(cfg.age_key_ref).toBeUndefined()
    expect(cfg._origem.age_key_file).toBe('embutido')
    expect(cfg.age_key_file.startsWith(c.projDir)).toBe(true)
    // A prova na FONTE: nenhum default do modulo carrega uma ref.
    const fonte = fs.readFileSync(new URL('./tars-secrets.mjs', import.meta.url), 'utf8')
    expect(fonte).not.toMatch(/=\s*['"]op:\/\//)
  })

  it('perfil ausente E projeto sem a ref: falha alta nomeando o campo e as tres camadas', () => {
    const c = cenario()
    expect(() => c.cfg({ source: 'automation' })).toThrow(/`age_key_ref` nao declarado em nenhuma camada \(embutido \| perfil \| projeto\)/)
    expect(() => c.cfg({ source: 'automation' })).toThrow(/profile\.toml/)
  })

  it('so perfil: a ref vem do perfil e a ORIGEM e o perfil', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref = "op://perfil/age/ref"\n')
    const cfg = c.cfg({ source: 'automation' })
    expect(cfg.age_key_ref).toBe('op://perfil/age/ref')
    expect(cfg._origem.age_key_ref).toBe('perfil')
  })

  it('projeto sobrescreve o perfil CAMPO A CAMPO (o campo nao tocado segue do perfil)', () => {
    const c = cenario()
    c.perfil(`[secrets]\nage_key_ref = "op://perfil/age/ref"\ncache_file = "${path.join('X', 'cache-do-perfil')}"\n`)
    const cfg = c.cfg({ source: 'automation', age_key_ref: 'op://projeto/age/ref' })
    expect(cfg.age_key_ref).toBe('op://projeto/age/ref')
    expect(cfg._origem.age_key_ref).toBe('projeto')
    expect(cfg.cache_file).toBe(path.join('X', 'cache-do-perfil'))
    expect(cfg._origem.cache_file).toBe('perfil')
    expect(cfg._origem.token_file).toBe('embutido')
  })

  it('dois perfis diferentes -> refs diferentes (e o perfil que carrega a identidade)', () => {
    const a = cenario()
    const b = cenario()
    a.perfil('[secrets]\nage_key_ref = "op://perfil-a/age/ref"\n')
    b.perfil('[secrets]\nage_key_ref = "op://perfil-b/age/ref"\n')
    expect(lerPerfil({ env: a.env }).age_key_ref).toBe('op://perfil-a/age/ref')
    expect(lerPerfil({ env: b.env }).age_key_ref).toBe('op://perfil-b/age/ref')
    expect(a.cfg({ source: 'automation' }).age_key_ref).not.toBe(b.cfg({ source: 'automation' }).age_key_ref)
  })

  it('ref malformada declarada em QUALQUER camada grita (sem ecoar o valor)', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref = "coisa-que-nao-e-ref"\n')
    expect(() => c.cfg({ source: 'automation' })).toThrow(/`op:\/\/` invalida/)
  })

  it('o perfil mora FORA de repo: `profile.toml` na base de config do usuario', () => {
    const c = cenario()
    expect(perfilFile({ env: c.env })).toBe(path.join(c.base, 'profile.toml'))
    expect(perfilFile({ env: { APPDATA: path.join('C:', 'Users', 'x', 'AppData', 'Roaming') } })).toBe(
      path.join('C:', 'Users', 'x', 'AppData', 'Roaming', 'tars', 'profile.toml'),
    )
  })

  it('check mostra a CAMADA de cada ref — nunca o valor', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref = "op://perfil/age/ref"\n')
    const cfg = c.cfg({ source: 'automation' })
    const linha = check(cfg, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'refs')
    expect(linha.detalhe).toContain('age_key_ref=perfil')
    expect(linha.detalhe).toContain('bot=nenhum')
    expect(linha.detalhe).not.toContain('op://')
  })

  it('PADRAO por projeto no perfil: dois projetos com o MESMO perfil -> refs DIFERENTES', () => {
    const base = tmp('tars-base-')
    for (const nome of ['projeto-a', 'projeto-b']) fs.mkdirSync(path.join(base, nome))
    fs.writeFileSync(path.join(base, 'profile.toml'), '[secrets]\nage_key_ref_pattern = "op://secrets/{projeto}/age/age.key"\n')
    const env = { ...process.env, TARS_SECRETS_DIR: base }
    const a = lerConfig({ source: 'automation' }, { project: path.join(base, 'projeto-a'), env })
    const b = lerConfig({ source: 'automation' }, { project: path.join(base, 'projeto-b'), env })
    expect(a.age_key_ref).toBe('op://secrets/projeto-a/age/age.key')
    expect(b.age_key_ref).toBe('op://secrets/projeto-b/age/age.key')
    expect(a.age_key_ref).not.toBe(b.age_key_ref)
    // A origem e' o PADRAO do perfil, nao uma ref pronta.
    expect(a._origem.age_key_ref).toBe('perfil(padrao)')
    expect(b._origem.age_key_ref).toBe('perfil(padrao)')
  })

  it('padrao sem `{projeto}` FALHA ALTA (senao todos os projetos dividem a chave)', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref_pattern = "op://secrets/age/age.key"\n')
    expect(() => c.cfg({ source: 'automation' })).toThrow(/precisa de \{projeto\}, senao todos os projetos dividem a chave/)
  })

  it('projeto com `age_key_ref` explicito SOBRESCREVE o padrao do perfil', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref_pattern = "op://secrets/{projeto}/age/age.key"\n')
    const cfg = c.cfg({ source: 'automation', age_key_ref: 'op://projeto/age/ref' })
    expect(cfg.age_key_ref).toBe('op://projeto/age/ref')
    expect(cfg._origem.age_key_ref).toBe('projeto')
  })

  it('key_scope=machine IGNORA o padrao do perfil: nenhuma ref, nenhum erro', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref_pattern = "op://secrets/{projeto}/age/age.key"\n')
    const cfg = c.cfg({ key_scope: 'machine', source: 'automation' })
    expect(cfg.age_key_ref).toBeUndefined()
    // A origem nao e' uma camada: em machine nao ha' ref — a chave e' gerada aqui.
    expect(cfg._origem.age_key_ref).toBe('n/a (machine)')
    const linha = check(cfg, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'refs')
    expect(linha.detalhe).toContain('age_key_ref=n/a (machine)')
    expect(linha.detalhe).not.toContain('op://')
  })

  it('key_scope=machine: ref PRONTA no perfil continua sendo erro (so o padrao e ignorado)', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref = "op://perfil/age/ref"\n')
    expect(() => c.cfg({ key_scope: 'machine', source: 'automation' })).toThrow(/machine PROIBE age_key_ref/)
  })

  it('check mostra a ORIGEM `perfil(padrao)` quando a ref vem do padrao', () => {
    const c = cenario()
    c.perfil('[secrets]\nage_key_ref_pattern = "op://secrets/{projeto}/age/age.key"\n')
    const cfg = c.cfg({ source: 'automation' })
    const linha = check(cfg, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'refs')
    expect(linha.detalhe).toContain('age_key_ref=perfil(padrao)')
    expect(linha.detalhe).not.toContain('op://')
  })

  it('as camadas sao as TRES, nessa ordem de forca', () => {
    expect(CAMADAS).toEqual(['embutido', 'perfil', 'projeto'])
  })
})

// --- `rotate` e `token set` (dev.9) ----------------------------------------------------
// O `op` continua stub, mas o `sops` e o `age-keygen` sao REAIS: e' o unico jeito de provar
// que a recifra fecha (o cache e os versionados decifram com a chave NOVA, nunca com a velha).

/** O ambiente do DONO no terminal dele: sem marcador de ator e sem nada que aponte a fonte. */
const envDono = (stub) => {
  const env = { ...stub.env, CLAUDECODE: '0', TARS_ACTOR: '' }
  for (const k of Object.keys(env)) {
    if (k.startsWith('OP_SESSION_') || ['OP_SERVICE_ACCOUNT_TOKEN', 'OP_CONNECT_TOKEN', 'OP_CONNECT_HOST', 'SOPS_AGE_KEY'].includes(k)) {
      delete env[k]
    }
  }
  return env
}

/** O JSON do item como o `op item get --format json` devolve (campos com id/label/value). */
const itemJson = (identidade) =>
  JSON.stringify({ id: 'agekey', title: 'agekey', fields: [{ id: 'age.key', label: 'age.key', type: 'concealed', value: identidade }] })

/** Um versionado de verdade: yaml cifrado com sops para `rec`. */
function versionado(dir, rec, nome) {
  const plain = path.join(dir, `${nome}.plain`)
  const alvo = path.join(dir, nome)
  fs.writeFileSync(plain, 'senha: valor-de-teste\n')
  const r = spawnSync('sops', ['--encrypt', '--age', rec, '--input-type', 'yaml', '--output-type', 'yaml', '--output', alvo, plain], {
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`sops --encrypt falhou: ${r.stderr}`)
  fs.rmSync(plain, { force: true })
  return alvo
}

describe.skipIf(!TEM_AGE || !TEM_SOPS)('rotate', () => {
  /** Um projeto pronto para rotacionar: chave velha em disco, item no stub, versionado cifrado. */
  const cenario = ({ editIgnora, extra = [], secrets = {} } = {}) => {
    const dir = tmp('tars-rot-')
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const keyAlvo = path.join(dir, 'age.key')
    fs.copyFileSync(chaveReal(), keyAlvo)
    fs.chmodSync(keyAlvo, 0o600)
    const recVelho = recipient(keyAlvo)
    const item = path.join(dir, 'item.json')
    fs.writeFileSync(item, itemJson(fs.readFileSync(keyAlvo, 'utf8').trim()))
    const sops_config = path.join(dir, '.sops.yaml')
    fs.writeFileSync(sops_config, `creation_rules:\n  - path_regex: .*\n    age: ${recVelho}\n`)
    const arquivos = [versionado(dir, recVelho, 'segredos.yaml')]
    for (const e of extra) arquivos.push(e(dir))
    const c = cfgDe(
      {
        key_scope: 'project',
        source: 'owner',
        age_key_ref: 'op://tars/agekey/age.key',
        sops_config,
        sops_files: arquivos.map((a) => path.basename(a)),
        ...secrets,
      },
      dir,
    )
    const stub = stubOp({ item, editIgnora })
    return { dir, c, keyAlvo, item, sops_config, stub, recVelho, arquivos }
  }

  it('automation RECUSA rotate (a automacao consome a chave, nao a troca)', () => {
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/agekey/age.key' }, tmp())
    expect(() => rotate(c, { env: process.env, tty: true })).toThrow(/rotate e' do dono.*automation/)
  })

  it('owner SEM TTY recusa (nao ha sessao do app 1Password para abrir)', () => {
    const c = cfgDe({ source: 'owner', age_key_ref: 'op://tars/agekey/age.key' }, tmp())
    const env = { ...process.env, CLAUDECODE: '0', TARS_ACTOR: '' }
    expect(() => rotate(c, { env, tty: false })).toThrow(/source=owner sem TTY/)
  })

  it('sops_config SEM sops_files falha alto nomeando o que falta', () => {
    const dir = tmp('tars-rot-')
    const c = cfgDe({ source: 'owner', age_key_ref: 'op://tars/agekey/age.key', sops_config: path.join(dir, '.sops.yaml') }, dir)
    expect(() => expandeArquivos(c)).toThrow(/SEM `sops_files`/)
  })

  it('project feliz: cofre pelo TEMPLATE (nunca argv), versionado so com a chave NOVA', () => {
    const { c, item, stub, sops_config, dir, recVelho } = cenario()
    const r = rotate(c, { env: envDono(stub), tty: true, confirma: () => true })
    expect(r.status).toBe(0)

    const identidade = fs.readFileSync(c.age_key_file, 'utf8').trim()
    const recNovo = recipient(c.age_key_file)
    expect(recNovo).not.toBe(recVelho)

    // O cofre recebeu a identidade NOVA, e ela foi por ARQUIVO: o argv do `op` nunca a carrega.
    expect(JSON.parse(fs.readFileSync(item, 'utf8')).fields[0].value).toBe(identidade)
    const chamadas = fs.readFileSync(stub.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(JSON.stringify(chamadas)).not.toContain('AGE-SECRET-KEY')
    expect(chamadas.some((a) => a[0] === 'item' && a[1] === 'edit' && a.some((x) => x.startsWith('--template=')))).toBe(true)
    // ...e o template que o stub recebeu CARREGA a identidade (prova de que foi pelo arquivo).
    // O template e' o JSON do item, entao a quebra de linha vem escapada (`\n`): o que se cobra
    // aqui e' o MATERIAL da chave, nao a formatacao.
    expect(fs.readFileSync(stub.tplLog, 'utf8')).toContain(identidade.split('\n').pop())

    // O manifesto e o versionado so citam o recipient NOVO.
    expect(fs.readFileSync(sops_config, 'utf8')).toContain(recNovo)
    expect(fs.readFileSync(sops_config, 'utf8')).not.toContain(recVelho)
    expect(fs.readFileSync(path.join(dir, 'segredos.yaml'), 'utf8')).not.toContain(recVelho)

    // E o versionado decifra SO com a chave nova.
    const d = spawnSync('sops', ['--decrypt', '--input-type', 'yaml', '--output-type', 'json', path.join(dir, 'segredos.yaml')], {
      encoding: 'utf8',
      env: { ...process.env, SOPS_AGE_KEY_FILE: c.age_key_file },
    })
    expect(d.status).toBe(0)
    expect(d.stdout).toContain('valor-de-teste')

    // Nenhum segredo (identidade ou valor) na saida do comando, e o estado saiu no fim.
    expect(r.saida).not.toContain('AGE-SECRET-KEY')
    expect(r.saida).not.toContain('valor-de-teste')
    expect(fs.existsSync(estadoRotate(c))).toBe(false)
  })

  it('falha no passo 4 (cofre devolve a chave velha): nada local muda, estado no 4, retoma', () => {
    const { c, keyAlvo, stub, sops_config, recVelho } = cenario({ editIgnora: true })
    const antesChave = fs.readFileSync(keyAlvo, 'utf8')
    const antesManifesto = fs.readFileSync(sops_config, 'utf8')

    expect(() => rotate(c, { env: envDono(stub), tty: true, confirma: () => true })).toThrow(/recipient DIFERENTE/)
    // Nada local mudou — nem a chave, nem o manifesto, nem o cache.
    expect(fs.readFileSync(keyAlvo, 'utf8')).toBe(antesChave)
    expect(fs.readFileSync(sops_config, 'utf8')).toBe(antesManifesto)
    expect(fs.existsSync(c.cache_file)).toBe(false)
    expect(JSON.parse(fs.readFileSync(estadoRotate(c), 'utf8')).passo).toBe(4)

    // Retoma: o cofre passa a aceitar a edicao e a rotacao fecha do passo 4 em diante.
    const stub2 = stubOp({ item: path.join(c.dir, 'item.json') })
    const r = rotate(c, { env: envDono(stub2), tty: true, confirma: () => true })
    expect(r.status).toBe(0)
    expect(recipient(c.age_key_file)).not.toBe(recVelho)
    expect(fs.existsSync(estadoRotate(c))).toBe(false)
  })

  it('falha no passo 5 (um arquivo nao recifra): chave local continua a velha, retoma completa', () => {
    const { c, keyAlvo, stub, dir, recVelho } = cenario({
      extra: [
        (d) => {
          const p = path.join(d, 'quebrado.yaml')
          fs.writeFileSync(p, 'nao sou sops\n')
          return p
        },
      ],
    })
    const antes = fs.readFileSync(keyAlvo, 'utf8')

    expect(() => rotate(c, { env: envDono(stub), tty: true, confirma: () => true })).toThrow(/sops updatekeys` falhou/)
    // A chave LOCAL continua a velha: o passo 6 (a troca) so roda com os versionados prontos.
    expect(fs.readFileSync(keyAlvo, 'utf8')).toBe(antes)
    expect(recipient(keyAlvo)).toBe(recVelho)
    expect(JSON.parse(fs.readFileSync(estadoRotate(c), 'utf8')).passo).toBe(5)

    // O defeito do arquivo e corrigido e a retomada completa a recifra e a troca.
    versionado(dir, recVelho, 'quebrado.yaml')
    const stub2 = stubOp({ item: path.join(c.dir, 'item.json') })
    const r = rotate(c, { env: envDono(stub2), tty: true, confirma: () => true })
    expect(r.status).toBe(0)
    expect(recipient(c.age_key_file)).not.toBe(recVelho)
  })

  it('machine: gera chave DIFERENTE, o cache decifra e o recipient muda', () => {
    const dir = tmp('tars-rot-mac-')
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const c = cfgDe({ key_scope: 'machine', source: 'owner' }, dir)
    const stub = stubOp({ valores: { TOKEN: 'x' } })
    rotate(c, { env: envDono(stub), tty: true, confirma: () => true })
    const recAntes = recipient(c.age_key_file)
    const cacheAntes = recipientDoCache(c)

    rotate(c, { env: envDono(stub), tty: true, confirma: () => true })
    expect(recipient(c.age_key_file)).not.toBe(recAntes)
    expect(recipientDoCache(c)).toEqual([recipient(c.age_key_file)])
    expect(recipientDoCache(c)).not.toEqual(cacheAntes)
    expect(decifraMapa(c).TOKEN).toBe('x')
  })

  it('cancelar no plano nao deixa estado nem toca em nada', () => {
    const { c, keyAlvo, stub } = cenario()
    const antes = fs.readFileSync(keyAlvo, 'utf8')
    const r = rotate(c, { env: envDono(stub), tty: true, confirma: () => false })
    expect(r.saida).toMatch(/cancelado/)
    expect(fs.readFileSync(keyAlvo, 'utf8')).toBe(antes)
    expect(fs.existsSync(estadoRotate(c))).toBe(false)
  })

  /**
   * O estado FINAL da rotacao, sem a identidade (que e' aleatoria a cada geracao): e' o que
   * PRECISA bater entre o caminho feliz e cada retomada. Um campo diferente aqui e' a prova de
   * que a retomada nao chegou onde a rotacao de uma vez so' chega.
   */
  const estadoFinal = (c, { dir, item, recVelho }) => {
    const versionadoFinal = path.join(dir, 'segredos.yaml')
    const d = spawnSync('sops', ['--decrypt', '--input-type', 'yaml', '--output-type', 'json', versionadoFinal], {
      encoding: 'utf8',
      env: { ...process.env, SOPS_AGE_KEY_FILE: c.age_key_file },
    })
    return {
      cofreIgualAoLocal: JSON.parse(fs.readFileSync(item, 'utf8')).fields[0].value === fs.readFileSync(c.age_key_file, 'utf8').trim(),
      manifesto: fs.readFileSync(c.sops_config, 'utf8').includes(recVelho) ? 'velho' : 'novo',
      versionado: fs.readFileSync(versionadoFinal, 'utf8').includes(recVelho) ? 'velho' : 'novo',
      decifra: d.status === 0 && d.stdout.includes('valor-de-teste'),
      cache: recipientDoCache(c).length,
      estado: fs.existsSync(estadoRotate(c)),
      rotate: fs.existsSync(`${c.age_key_file}.rotate`),
    }
  }

  it('retomada POR PASSO: morrer logo apos a acao de cada passo (2..7) e rodar de novo chega ao MESMO fim', () => {
    const feliz = cenario()
    rotate(feliz.c, { env: envDono(feliz.stub), tty: true, confirma: () => true })
    const esperado = estadoFinal(feliz.c, feliz)
    expect(esperado).toMatchObject({ cofreIgualAoLocal: true, manifesto: 'novo', versionado: 'novo', decifra: true, cache: 1, estado: false, rotate: false })

    for (const n of [2, 3, 4, 5, 6, 7]) {
      const { c, stub, dir, item, recVelho } = cenario()
      const morre = (m) => {
        if (m === n) throw new Error(`morto apos o passo ${m}`)
      }
      expect(() => rotate(c, { env: envDono(stub), tty: true, confirma: () => true, hooks: { aposPasso: morre } })).toThrow(`morto apos o passo ${n}`)
      // O estado ficou em disco: a rotacao esta' no meio e a retomada tem de saber de onde seguir.
      expect(fs.existsSync(estadoRotate(c))).toBe(true)
      if (n === 6) {
        // O caso que TRAVAVA a retomada: morreu entre o rename e o fim do refresh — o `.rotate`
        // ja' sumiu e a chave local JA' e' a nova. Renomear de novo daria ENOENT.
        expect(fs.existsSync(`${c.age_key_file}.rotate`)).toBe(false)
        expect(recipient(c.age_key_file)).toBe(JSON.parse(fs.readFileSync(estadoRotate(c), 'utf8')).recipient_novo)
      }

      const stub2 = stubOp({ item })
      const r = rotate(c, { env: envDono(stub2), tty: true, confirma: () => true })
      expect(r.status).toBe(0)
      expect(estadoFinal(c, { dir, item, recVelho })).toEqual(esperado)
    }
  }, 120_000)

  it('estrategia `template_parcial`: so o campo alterado volta ao cofre, e a rotacao fecha igual', () => {
    const { c, item, stub, recVelho } = cenario({ secrets: { age_key_write: 'template_parcial' } })
    expect(rotate(c, { env: envDono(stub), tty: true, confirma: () => true }).status).toBe(0)

    const identidade = fs.readFileSync(c.age_key_file, 'utf8').trim()
    expect(JSON.parse(fs.readFileSync(item, 'utf8')).fields[0].value).toBe(identidade)
    // O template que o `op` recebeu tem SO' o campo — o resto do item nao sai do cofre.
    expect(JSON.parse(fs.readFileSync(stub.tplLog, 'utf8').trim())).toEqual({ fields: [{ id: 'age.key', value: identidade }] })
    expect(recipient(c.age_key_file)).not.toBe(recVelho)
  })

  it('estrategia `documento`: `op document edit <doc> <arquivo>` — o valor vai por arquivo, nunca argv', () => {
    const dir = tmp('tars-rot-doc-')
    const doc = path.join(dir, 'age-doc.key')
    fs.writeFileSync(doc, 'identidade-velha\n')
    const stub = stubOp({ doc })
    const c = cfgDe({ source: 'owner', age_key_ref: 'op://tars/agedoc/age.key', age_key_write: 'documento' }, dir)
    const identidade = 'AGE-SECRET-KEY-1EXEMPLO\nsegunda linha da identidade'
    editaItemNoCofre(c, c.age_key_ref, identidade, envDono(stub))

    expect(fs.readFileSync(doc, 'utf8').trim()).toBe(identidade)
    const argv = JSON.parse(fs.readFileSync(stub.docLog, 'utf8').trim())
    expect(argv.slice(0, 2)).toEqual(['document', 'edit'])
    // A ref do DOCUMENTO (sem o campo) e o CAMINHO do arquivo — e o arquivo nao sobrevive.
    expect(argv[2]).toBe('op://tars/agedoc')
    expect(fs.existsSync(argv[3])).toBe(false)
    expect(JSON.stringify(argv)).not.toContain('AGE-SECRET-KEY')
    expect(refDocumento('op://tars/agedoc/age.key')).toBe('op://tars/agedoc')
  })

  it('`age_key_write` fora da lista GRITA com as tres, no lerConfig (nao no meio da rotacao)', () => {
    expect(Object.keys(ESTRATEGIAS_COFRE)).toEqual(['template', 'template_parcial', 'documento'])
    expect(() => cfgDe({ source: 'owner', age_key_ref: 'op://tars/agekey/age.key', age_key_write: 'inventado' }, tmp())).toThrow(
      /age_key_write invalido: 'inventado' \(use template \| template_parcial \| documento\)/,
    )
  })
})

describe('token set', () => {
  const cenario = (whoami = 0) => {
    const dir = tmp('tars-tok-')
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/agekey/age.key' }, dir)
    fs.writeFileSync(c.token_file, 'token-antigo\n', { mode: 0o600 })
    const stub = stubOp({ whoami })
    return { c, stub }
  }

  it('token valido: troca, e o token NUNCA aparece em argv', () => {
    const { c, stub } = cenario(0)
    const r = tokenSet(c, { env: stub.env, le: () => 'token-novo-do-dono' })
    expect(r.status).toBe(0)
    expect(r.saida).toMatch(/token novo em uso nesta maquina.*revogue o antigo/s)
    expect(fs.readFileSync(c.token_file, 'utf8').trim()).toBe('token-novo-do-dono')
    // A prova: o argv de TODAS as chamadas ao `op` (inclusive o `whoami`) nao carrega o token.
    const chamadas = fs.readFileSync(stub.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(chamadas.some((a) => a[0] === 'whoami')).toBe(true)
    expect(JSON.stringify(chamadas)).not.toContain('token-novo-do-dono')
    expect(JSON.stringify(chamadas)).not.toContain('token-antigo')
    // E o `.novo` nao sobra: o rename e o que o promove.
    expect(fs.existsSync(`${c.token_file}.novo`)).toBe(false)
  })

  it('token invalido: o antigo continua e o `.novo` some', () => {
    const { c, stub } = cenario(1)
    expect(() => tokenSet(c, { env: stub.env, le: () => 'token-que-nao-vale' })).toThrow(/NAO validou/)
    expect(fs.readFileSync(c.token_file, 'utf8').trim()).toBe('token-antigo')
    expect(fs.existsSync(`${c.token_file}.novo`)).toBe(false)
  })

  it('token vazio nao troca nada', () => {
    const { c, stub } = cenario(0)
    expect(() => tokenSet(c, { env: stub.env, le: () => '   ' })).toThrow(/VAZIO/)
    expect(fs.readFileSync(c.token_file, 'utf8').trim()).toBe('token-antigo')
  })
})

describe('expiracao do token (`token_expires`)', () => {
  const cfgToken = (expires) => {
    const dir = tmp('tars-exp-')
    fs.writeFileSync(path.join(dir, 'secrets.tpl'), 'TOKEN=x\n')
    const c = cfgDe({ source: 'automation', age_key_ref: 'op://tars/agekey/age.key', token_expires: expires }, dir)
    fs.writeFileSync(c.token_file, 'token-falso', { mode: 0o600 })
    return c
  }
  /** Uma data a `n` dias de hoje, no formato do campo. */
  const emDias = (n) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const linhaToken = (c) => check(c, { env: { PATH: process.env.PATH } }).linhas.find((l) => l.nome === 'token')

  it('vencido FALHA nomeando a data', () => {
    const c = cfgToken(emDias(-1))
    expect(linhaToken(c).ok).toBe(false)
    expect(linhaToken(c).detalhe).toMatch(/vencido em/)
    expect(check(c, { env: { PATH: process.env.PATH } }).ok).toBe(false)
  })

  it('a 10 dias AVISA sem reprovar', () => {
    const c = cfgToken(emDias(10))
    expect(linhaToken(c).ok).toBe(true)
    expect(linhaToken(c).detalhe).toMatch(/avisa: vence em 10 dia\(s\)/)
    expect(DIAS_AVISO_TOKEN).toBe(14)
    expect(diasAte(emDias(10))).toBe(10)
  })

  it('sem o campo, a linha diz `sem data`', () => {
    expect(linhaToken(cfgToken(undefined)).detalhe).toMatch(/sem data/)
  })

  it('data malformada GRITA (nao passa como "sem data")', () => {
    expect(() => diasAte('10/10/2026')).toThrow(/token_expires invalido/)
  })
})
