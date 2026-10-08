#!/usr/bin/env node
// `tars secrets` — o cofre do PROJETO: refresh | exec | check (porte do `secrets.mjs` do
// segtools, adaptado: la' o caminho era fixo, aqui tudo vem da tabela `[secrets]` do
// `.ai/tars.toml` — o Tars e' o catalogo, quem declara e' o consumidor).
//
// PORQUE EXISTE: hoje cada projeto consumidor reinventa o proprio cofre (caminho fixo,
// variavel de ambiente, token no `.env`). A regra e' a mesma em todo lugar — 1Password e' a
// fonte CANONICA, o dia a dia le um CACHE LOCAL CIFRADO (sops+age) FORA do repo — entao ela
// mora aqui, uma vez (R3), e o consumidor so' DECLARA.
//
// AS TRES PARTES (e o que cada uma NAO faz):
//   refresh  — o UNICO comando que abre o cofre (1Password). Grava a chave age e regrava o
//              cache cifrado a partir do template.
//   exec --  — decifra o cache EM MEMORIA e roda o filho com os segredos no env SO dele
//              (argv de verdade, sem shell: metacaractere e' DADO, nunca sintaxe).
//   check    — NAO abre o cofre: julga chave (0600) x recipient do cache x .sops versionado,
//              o template, se o cache decifra e se o ambiente de quem chama ja' esta' sujo.
//
// DEFAULTS NEUTROS: nada de "pablo" nem "dotfiles" — o nome do projeto vem do diretorio, e
// os caminhos de `~/.config/tars/<projeto>/` (Windows: `%APPDATA%\tars\<projeto>\`). Toda
// peca e' sobrescrevivel por projeto.
//
// NUNCA imprime valor de segredo — nem em erro, nem em log, nem em teste. O que sai e' o
// NOME da chave e o CAMINHO do arquivo.
//
// Uso:
//   tars secrets refresh               # regenera a chave e o cache pelo 1Password
//   tars secrets exec -- <cmd...>      # roda <cmd> com o cache decifrado no env
//   tars secrets check                 # julga o estado (nao abre o cofre)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { actor } from './tars-actor.mjs'

/**
 * O helper que materializa o env RESOLVIDO pelo `op run` como JSON (porte do
 * `secrets-inject.mjs` do segtools). NAO e' ponto de entrada: quem o roda e' o `op run`.
 */
const INJECT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tars-secrets-inject.mjs')

/** Os dois escopos da chave age: a do projeto (vem do cofre) ou a da MAQUINA (gerada aqui). */
export const ESCOPOS = ['project', 'machine']
/**
 * O binario do `op`. `TARS_SECRETS_OP` e' o SEAM de teste (mesmo espirito do
 * `SEGTOOLS_OP_BIN` do segtools): trocar o PATH nao basta no Windows — o libuv acha o
 * `op.exe` de verdade antes de qualquer `.cmd` do stub, e o teste abriria o cofre real.
 */
const opBin = () => process.env.TARS_SECRETS_OP || 'op'

/** De ONDE sai o segredo — sem fallback entre as duas: declarar e' obrigatorio. */
export const FONTES = ['automation', 'owner']
/** Arquivos de env que NUNCA chegam ao filho (nem o caminho da identidade age). */
export const ENV_PROIBIDO = ['OP_SERVICE_ACCOUNT_TOKEN', 'OP_CONNECT_HOST', 'OP_CONNECT_TOKEN', 'SOPS_AGE_KEY']

/** Erro de CONFIGURACAO/ambiente: falha alta (exit != 0), nunca "modo degradado". */
export class ErroConfig extends Error {}

// --- REDIGE: o erro do `op`/`sops` APARECE, o valor NUNCA ------------------------------
// Enquanto o processo roda, alguns valores de segredo estao em memoria (o token da service
// account, os valores decifrados do cache, a identidade no ambiente). Eles entram aqui para
// uma unica coisa: se um deles reaparecer no stderr de uma ferramenta, sai `***`. NAO e'
// lista de leitura nem de log — nada e' impresso A PARTIR dela.
const conhecidos = new Set()
/**
 * Registra um valor para redacao. O piso de 4 caracteres nao e' estetica: abaixo disso o
 * valor nao tem entropia (um `x`, um `1`) e trocar toda ocorrencia mutilaria a mensagem
 * sem esconder segredo nenhum.
 */
export function registra(v) {
  if (typeof v === 'string' && v.length >= 4) conhecidos.add(v)
}
/** Troca todo valor de segredo conhecido por `***`. Usado em stderr e em mensagem de erro. */
export function redige(texto = '') {
  let out = String(texto)
  for (const s of conhecidos) out = out.split(s).join('***')
  return out
}

/**
 * Toda referencia que vai para o `op` tem de ser `op://...` e e' conferida AQUI, antes do
 * spawn. Referencia invalida NAO e' ecoada: o argumento pode ser o segredo no lugar errado,
 * e a mensagem de erro nao pode virar o vazamento que ela denuncia.
 */
export function validaRef(ref) {
  if (!/^op:\/\/\S+$/.test(String(ref ?? ''))) {
    throw new ErroConfig('[secrets] referencia `op://` invalida (valor deliberadamente NAO ecoado)')
  }
  return String(ref)
}

/**
 * O UNICO caminho para o `op` e o `sops` (e o `age-keygen`). Tres coisas que nao podem ficar
 * espalhadas por call site (R3):
 *   1) toda ref `op://` do argv e' validada ANTES de chamar;
 *   2) o STDERR volta REDIGIDO — o erro aparece, o valor vira `***`. Nunca `>/dev/null`, que
 *      esconderia a causa junto com o valor. O stdout NAO e' redigido de proposito: e' por
 *      ele que passa o material cifrado do `sops --encrypt` e a saida de `age-keygen -y`;
 *      redigir ali corromperia o dado (e nenhum segredo em claro passa por stdout por desenho);
 *   3) sem shell: argv de verdade, nada reinterpretado.
 */
export function roda(bin, args, { env = process.env } = {}) {
  for (const a of args) {
    if (typeof a === 'string' && /op:\/\//.test(a)) validaRef(a)
  }
  registra(env.OP_SERVICE_ACCOUNT_TOKEN)
  registra(env.SOPS_AGE_KEY)
  const r = spawnSync(bin, args, { env, encoding: 'utf8' })
  if (r.stderr) r.stderr = redige(r.stderr)
  return r
}

/**
 * Chama o `op`. No Windows um `.cmd`/`.bat` (shim, comum quando o `op` vem por npm) NAO e'
 * executavel por CreateProcess: precisa do `cmd.exe`. O binario de verdade roda direto — so'
 * o shim paga o shell.
 */
function spawnOp(args, env) {
  const bin = opBin()
  const viaCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
  return viaCmd ? roda(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', bin, ...args], { env }) : roda(bin, args, { env })
}

/**
 * Onde moram chave, cache, template e token quando o projeto nao declara caminho. Um lugar
 * so' (R3): `TARS_SECRETS_DIR` troca a BASE (o teste aponta para um tmpfs) e o nome do
 * projeto e' o diretorio — nada de constante com nome de pessoa.
 */
export function configDir({ project = process.cwd(), env = process.env } = {}) {
  const base =
    env.TARS_SECRETS_DIR ||
    (process.platform === 'win32'
      ? path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tars')
      : path.join(os.homedir(), '.config', 'tars'))
  return path.join(base, path.basename(path.resolve(project)))
}

/**
 * Valida a tabela `[secrets]` e resolve os caminhos. TODA regra do desenho mora aqui (uma
 * so'), e cada violacao GRITA nomeando o que faltou (R4) — um `source` ausente nao pode
 * virar "usa o que der".
 */
export function lerConfig(secrets = {}, { project = process.cwd(), env = process.env } = {}) {
  const dir = configDir({ project, env })
  const key_scope = secrets.key_scope ?? 'project'
  if (!ESCOPOS.includes(key_scope)) {
    throw new ErroConfig(`[secrets] key_scope invalido: '${key_scope}' (use ${ESCOPOS.join(' | ')})`)
  }
  // `source` NAO tem default: escolher por conta propria seria decidir se o cofre abre de
  // forma NAO INTERATIVA (automation) ou com a mao do dono (owner) — e' decisao, nao default.
  if (!secrets.source) {
    throw new ErroConfig(`[secrets] source e' OBRIGATORIO (use ${FONTES.join(' | ')}; nao ha' fallback entre as fontes)`)
  }
  if (!FONTES.includes(secrets.source)) {
    throw new ErroConfig(`[secrets] source invalido: '${secrets.source}' (use ${FONTES.join(' | ')})`)
  }
  const age_key_ref = secrets.age_key_ref ?? null
  const sops_config = secrets.sops_config ?? null
  if (key_scope === 'project' && !age_key_ref) {
    throw new ErroConfig('[secrets] key_scope=project exige age_key_ref (a referencia `op://` da chave age no cofre)')
  }
  // A ref da chave vem SO' do manifesto: ela nunca e' lida do template (ver `confereTemplate`).
  if (key_scope === 'project') validaRef(age_key_ref)
  if (key_scope === 'machine' && age_key_ref) {
    throw new ErroConfig('[secrets] key_scope=machine PROIBE age_key_ref: a chave e\' gerada NA MAQUINA, nunca lida do cofre')
  }
  // Um `.sops.yaml` VERSIONADO com escopo de maquina seria uma segunda fonte de verdade: a
  // receita de cifra viajaria no git e a chave local nao a explicaria. Recusa alta.
  if (key_scope === 'machine' && sops_config) {
    throw new ErroConfig('[secrets] key_scope=machine PROIBE sops_config versionado (a receita mora so\' na chave gerada aqui)')
  }
  return {
    key_scope,
    source: secrets.source,
    age_key_ref,
    sops_config,
    dir,
    age_key_file: secrets.age_key_file ?? path.join(dir, 'age.key'),
    cache_file: secrets.cache_file ?? path.join(dir, 'secrets.sops.json'),
    template: secrets.template ?? path.join(dir, 'secrets.tpl'),
    token_file: secrets.token_file ?? path.join(dir, 'op-token'),
  }
}

/**
 * Quem pode abrir o cofre. `automation` le' o token da service account do ARQUIVO declarado;
 * `owner` so' a sessao do app 1Password — e por isso EXIGE mao humana: com ator=agent ou sem
 * TTY nao ha' sessao para usar, e fingir que ha' falharia longe da causa (R4).
 */
export function podeAbrirCofre(cfg, { env = process.env, tty = process.stdin.isTTY } = {}) {
  if (cfg.source !== 'owner') return
  if (actor({ env }) === 'agent') {
    throw new ErroConfig('[secrets] source=owner com ator=agent: o cofre abre pela sessao do app 1Password — agente NAO abre (use source=automation)')
  }
  if (!tty) {
    throw new ErroConfig('[secrets] source=owner sem TTY: a sessao do app 1Password nao existe aqui — rode no terminal do dono (use source=automation)')
  }
}

/** O token da service account: arquivo do dono. Ausente/vazio = falha ALTA, nunca "segue sem". */
export function lerToken(cfg, { fs: fsm = fs } = {}) {
  if (!fsm.existsSync(cfg.token_file)) {
    throw new ErroConfig(
      `[secrets] token da service account ausente em ${cfg.token_file}\n` +
        `[secrets] Com source=automation ele e' o unico passo manual: deixe o token em 0400 nesse caminho.`,
    )
  }
  const token = fsm.readFileSync(cfg.token_file, 'utf8').trim()
  if (!token) throw new ErroConfig(`[secrets] token VAZIO em ${cfg.token_file}`)
  registra(token) // se o `op` cuspir o token no stderr, sai `***`
  return token
}

/** O ambiente que abre o cofre: token da SA (automation) e Connect FORA — ele FALHA em vez de cair num Connect inexistente. */
function envDoCofre(cfg, base = process.env) {
  const env = { ...base }
  delete env.OP_CONNECT_HOST
  delete env.OP_CONNECT_TOKEN
  if (cfg.source === 'automation') env.OP_SERVICE_ACCOUNT_TOKEN = lerToken(cfg)
  return env
}

/** 0600 de verdade: no Windows a ACL e' que manda (`chmod` de la' nao protege nada). */
export function protegeArquivo(file) {
  if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o600)
    return
  }
  const r = spawnSync('icacls', [file, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`], { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new ErroConfig(`[secrets] nao consegui restringir a ACL de ${file}: ${(r.stderr || r.error?.message || '').trim()}`)
  }
}

/** O recipient da chave age (`age-keygen -y`) — o que o sops usa para cifrar o cache. */
export function recipient(keyFile) {
  const r = roda('age-keygen', ['-y', keyFile])
  if (r.status !== 0 || !r.stdout.trim()) {
    throw new ErroConfig(`[secrets] nao consegui derivar o recipient de ${keyFile}: ${(r.stderr || r.error?.message || '').trim()}`)
  }
  return r.stdout.trim()
}

/**
 * A chave do escopo. `machine`: gerada AQUI e, se ja' existe, nao se refaz (a chave local e' a
 * fonte — reabrir o cofre por ela seria a segunda fonte de verdade). `project`: vem do cofre e
 * e' lida EM TODA execucao do refresh — o `existsSync` NAO vale aqui: a chave no 1Password pode
 * ter trocado (rotacao, outra maquina), e um return antecipado manteria o cache cifrado para um
 * recipient que nao existe mais — falha longe da causa, na proxima decifra.
 *
 * O `op read` escreve num TEMPORARIO 0600 ao lado da chave e so' o rename (se ok) a substitui:
 * a chave atual nunca some nem fica meio-escrita se o `op` falhar.
 */
function garanteChave(cfg, env = process.env) {
  if (cfg.key_scope === 'machine') {
    if (fs.existsSync(cfg.age_key_file)) return
    fs.mkdirSync(path.dirname(cfg.age_key_file), { recursive: true, mode: 0o700 })
    // `age-keygen` herda o umask: o 0600 e' explicito logo depois.
    const r = roda('age-keygen', ['-o', cfg.age_key_file])
    if (r.status !== 0) {
      throw new ErroConfig(`[secrets] age-keygen nao gerou a chave da maquina em ${cfg.age_key_file}: ${(r.stderr || r.error?.message || '').trim()}`)
    }
    protegeArquivo(cfg.age_key_file)
    return
  }
  fs.mkdirSync(path.dirname(cfg.age_key_file), { recursive: true, mode: 0o700 })
  // `--out-file`, NUNCA stdout (ADR-013 do segtools): material de chave em pipe vaza para o
  // log de quem chamou o `op`. A ref vem do MANIFESTO — `validaRef` ja' a conferiu.
  validaRef(cfg.age_key_ref)
  const tmp = `${cfg.age_key_file}.novo`
  fs.rmSync(tmp, { force: true }) // sobra de um refresh morto no meio nao contamina o leitor
  try {
    const r = spawnOp(['read', '--out-file', tmp, cfg.age_key_ref], envDoCofre(cfg, env))
    if (r.status !== 0 || !fs.existsSync(tmp)) {
      throw new ErroConfig(
        `[secrets] o 1Password nao entregou a chave age (${cfg.age_key_ref}) em ${cfg.age_key_file}: ${(r.stderr || r.error?.message || '').trim()}`,
      )
    }
    protegeArquivo(tmp)
    fs.renameSync(tmp, cfg.age_key_file) // troca ATOMICA: a chave atual so' sai com a nova em maos
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

/**
 * O template so' tem UM lugar de segredo: `{{ op://... }}` dentro de um valor. O `op inject`
 * resolve QUALQUER `op://` do arquivo — inclusive num comentario e SEM as chaves duplas: um
 * `# nao usar op://cofre/item` viraria segredo resolvido no material cifrado. Pior: se o
 * template citar a ref da CHAVE age, a chave entra no cache. Os dois casos REPROVAM.
 */
export function confereTemplate(cfg, { fs: fsm = fs } = {}) {
  if (!fsm.existsSync(cfg.template)) return { ok: false, detalhe: `ausente: ${cfg.template}` }
  const txt = fsm.readFileSync(cfg.template, 'utf8')
  const foraDeBloco = txt.replace(/\{\{[^}]*\}\}/g, '')
  if (/op:\/\//.test(foraDeBloco)) {
    return { ok: false, detalhe: 'ha\' `op://` fora de `{{ }}` (comentario ou valor cru) — o `op inject` resolve qualquer um' }
  }
  if (cfg.age_key_ref && txt.includes(cfg.age_key_ref)) {
    return { ok: false, detalhe: 'o template cita a ref da CHAVE age — ela vem so\' do manifesto' }
  }
  return { ok: true, detalhe: 'nenhuma `op://` fora de `{{ }}`' }
}

/** Escrita ATOMICA (tmp + rename) e 0600: o cache nunca existe meio-escrito. */
function gravaCache(destino, conteudo) {
  fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 })
  const tmp = `${destino}.novo`
  fs.writeFileSync(tmp, conteudo, { mode: 0o600 })
  protegeArquivo(tmp)
  fs.renameSync(tmp, destino)
}

// O PID no nome do dir de texto claro e' o que permite ao refresh SEGUINTE decidir se um dir
// sobrou de um processo que ja' morreu — sem chutar idade e sem apagar o dir de um refresh
// concorrente (que estaria vivo, e cujo material seria truncado no meio).
const TMP_PREFIX = (pid) => `tars-secrets-${pid}-`
const TMP_NOME = /^tars-secrets-(\d+)-/

/**
 * Reapa o texto claro que um refresh ANTERIOR deixou para tras (porte do `reapResiduo` do
 * segtools). Existe porque o `finally` do refresh NAO roda quando o processo e' morto no meio
 * (`kill -9`, OOM, reboot do container): o material ficaria em tmp ALEM da vida do dono.
 * A decisao e' por PID, nao por idade: um dir cujo PID ainda existe pode estar sendo escrito
 * AGORA. Nome fora do padrao (esquema antigo, sem PID) NAO e' tocado — nao se sabe de quem e',
 * e apagar o dir de outro processo e' pior do que deixar um arquivo a mais.
 */
export function reapResiduo(dir, { fs: fsm = fs } = {}) {
  let nomes
  try {
    nomes = fsm.readdirSync(dir)
  } catch {
    return // dir indisponivel: nao ha' residuo a limpar
  }
  for (const n of nomes) {
    const m = TMP_NOME.exec(n)
    if (!m || Number(m[1]) === process.pid) continue
    let vivo = true
    try {
      process.kill(Number(m[1]), 0) // sinal 0 = so' checa se existe
    } catch (e) {
      vivo = e.code === 'EPERM' // EPERM = existe, mas nao e' nosso
    }
    if (vivo) continue
    fsm.rmSync(path.join(dir, n), { recursive: true, force: true })
  }
}

/**
 * `refresh` — o unico que abre o cofre. Ordem: quem pode abrir (owner/automation) -> template
 * -> chave -> `op run` do template -> sops -e para o recipient -> cache. Erros do `op`/`sops`
 * APARECEM redigidos (nada de `>/dev/null 2>&1` escondendo a causa).
 */
export function refresh(cfg, { env = process.env, tty = process.stdin.isTTY } = {}) {
  podeAbrirCofre(cfg, { env, tty })
  // Residuo de refresh MORTO sai antes de criar o proximo: o tmp nao sobrevive a reboot, mas
  // sobrevive a um `kill` — e o `finally` nao roda nesse caminho.
  reapResiduo(os.tmpdir())
  // O template e' conferido ANTES de abrir o cofre: um `op://` solto la' dentro so' apareceria
  // como material a mais no cache (inclusive a chave age), depois de ja' ter gasto cota do 1P.
  const t = confereTemplate(cfg)
  if (!t.ok) throw new ErroConfig(`[secrets] template reprovado: ${t.detalhe} (${cfg.template})`)
  garanteChave(cfg, env)
  const rec = recipient(cfg.age_key_file)

  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX(process.pid))), 'secrets.json')
  fs.writeFileSync(tmp, '', { mode: 0o600 })
  try {
    // `op run` (e NAO `op inject`): o `inject` resolve a referencia DENTRO do texto, e um valor
    // MULTILINHA quebra o formato — num template dotenv o parser de `KEY=VALUE` trunca no
    // primeiro \n EM SILENCIO (chave de assinatura quebrada, longe da causa). O `op run` entrega
    // o valor INTACTO no ambiente do filho, e o helper serializa o env resolvido em JSON — que
    // e' o unico jeito de a quebra de linha sobreviver ao cache.
    const inj = spawnOp(['run', `--env-file=${cfg.template}`, '--', process.execPath, INJECT, cfg.template, tmp], envDoCofre(cfg, env))
    if (inj.status !== 0) {
      throw new ErroConfig(
        `[secrets] o 1Password nao respondeu (ou uma referencia nao resolveu) — cache NAO atualizado.\n` +
          `[secrets] Template: ${cfg.template}\n` +
          `[secrets] Confira: cofre/campo existem, quem le' tem acesso ao cofre, e a cota nao esgotou. Cache anterior segue valido.`,
      )
    }
    const enc = roda('sops', ['--encrypt', '--input-type', 'json', '--output-type', 'json', '--age', rec, tmp])
    if (enc.status !== 0 || !enc.stdout.trim()) {
      throw new ErroConfig(`[secrets] sops nao cifrou o material do template: ${(enc.stderr || '').trim()} — cache NAO atualizado.`)
    }
    gravaCache(cfg.cache_file, enc.stdout)
  } finally {
    // O texto claro vive so' aqui: sai do disco em qualquer caminho (sucesso ou erro).
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true })
  }
  return { cache_file: cfg.cache_file, chaves: Object.keys(decifraMapa(cfg)).length }
}

/** O env do sops: a identidade vai por ARQUIVO (`SOPS_AGE_KEY_FILE`), nunca pelo ambiente. */
export function envComChave(cfg) {
  if (!fs.existsSync(cfg.age_key_file)) {
    throw new ErroConfig(`[secrets] chave age ausente em ${cfg.age_key_file} — rode \`tars secrets refresh\``)
  }
  const env = { ...process.env }
  delete env.SOPS_AGE_KEY
  env.SOPS_AGE_KEY_FILE = cfg.age_key_file
  return env
}

/** Decifra o cache para um MAPA em memoria. Nunca escreve o texto claro em disco. */
export function decifraMapa(cfg) {
  const r = roda('sops', ['--decrypt', '--input-type', 'json', '--output-type', 'json', cfg.cache_file], {
    env: envComChave(cfg),
  })
  if (r.status !== 0) throw new ErroConfig(`[secrets] falha ao decifrar o cache: ${(r.stderr || r.error?.message || '').trim()}`)
  const mapa = Object.fromEntries(Object.entries(JSON.parse(r.stdout || '{}')).map(([k, v]) => [k, String(v)]))
  // Os valores entram na redacao: daqui pra frente, se um deles reaparecer num stderr, sai `***`.
  for (const v of Object.values(mapa)) registra(v)
  return mapa
}

/**
 * O env do FILHO: os segredos do cache + o ambiente de quem chamou, MENOS o que aponta para a
 * fonte. Sem isto o filho herda o token da service account e qualquer processo seu abre o
 * cofre inteiro — o cofre deixa de ser o unico caminho.
 */
export function envDoFilho(mapa, { env = process.env, cfg } = {}) {
  const out = { ...env, ...mapa }
  for (const k of Object.keys(out)) if (k.startsWith('OP_')) delete out[k]
  for (const k of ENV_PROIBIDO) delete out[k]
  if (cfg?.age_key_file) out.SOPS_AGE_KEY_FILE = cfg.age_key_file
  return out
}

/**
 * `exec` — decifra em memoria e roda o filho por ARGV (sem shell). Com `shell: true` o Node
 * remontaria a linha numa string e todo metacaractere (`;`, `|`, `$( )`) deixaria de ser DADO
 * e viraria sintaxe — com os segredos ja' no ambiente. Quem precisa de shell pede um.
 */
export function exec(cfg, argv, { env = process.env, spawn = spawnSync } = {}) {
  if (!argv.length) throw new ErroConfig('uso: tars secrets exec -- <cmd> [args]')
  if (!fs.existsSync(cfg.cache_file)) {
    throw new ErroConfig(`[secrets] cache ausente em ${cfg.cache_file} — rode \`tars secrets refresh\``)
  }
  const r = spawn(argv[0], argv.slice(1), { stdio: 'inherit', env: envDoFilho(decifraMapa(cfg), { env, cfg }), shell: false })
  if (r.error) throw new ErroConfig(`[secrets] nao consegui executar '${argv[0]}': ${r.error.message}`)
  return { status: r.status ?? 1 }
}

/**
 * O que o `check` acusa no ambiente de quem chama: SO' o que APONTA para a fonte — um token de
 * sessao/SA, um Connect, a identidade age. Um `OP_*` qualquer (ex.: `OP_BILLING`, preferencias
 * do app) nao abre cofre nenhum, e acusa-lo seria ruido que ensina a ignorar a linha.
 */
export const AMBIENTE_ACUSADO = ['OP_SERVICE_ACCOUNT_TOKEN', 'OP_CONNECT_TOKEN', 'OP_CONNECT_HOST', 'SOPS_AGE_KEY']

/** Le SO os NOMES que apontam para a fonte — o valor nunca e' tocado. */
export const envSujoNomes = (env = process.env) =>
  Object.keys(env).filter((k) => k.startsWith('OP_SESSION_') || AMBIENTE_ACUSADO.includes(k))

/** Os recipients age declarados num `.sops.yaml` versionado (`creation_rules: age: ...`). */
export function recipientsDe(cfg, { fs: fsm = fs } = {}) {
  if (!cfg.sops_config || !fsm.existsSync(cfg.sops_config)) return []
  const txt = fsm.readFileSync(cfg.sops_config, 'utf8')
  return [...new Set([...txt.matchAll(/\bage\s*:\s*["']?([a-z0-9]{20,})["']?/gi)].map((m) => m[1]))]
}

/** O recipient gravado no cabecalho do cache cifrado (so' o METADADO sops: nunca o valor). */
export function recipientDoCache(cfg, { fs: fsm = fs } = {}) {
  if (!fsm.existsSync(cfg.cache_file)) return null
  try {
    const meta = JSON.parse(fsm.readFileSync(cfg.cache_file, 'utf8')).sops ?? {}
    return (meta.age ?? []).map((a) => a.recipient).filter(Boolean)
  } catch (e) {
    throw new ErroConfig(`[secrets] cache ilegivel como JSON sops: ${cfg.cache_file} (${e.message})`)
  }
}

/**
 * `check` — NAO abre o cofre: so' julga o que ja' esta' no disco e no ambiente. Cada linha e'
 * `{ nome, ok, detalhe }`; `ok:false` em qualquer uma = exit != 0.
 */
export function check(cfg, { env = process.env, fs: fsm = fs, decifra = decifraMapa } = {}) {
  const linhas = []
  const add = (nome, ok, detalhe = '') => linhas.push({ nome, ok, detalhe: redige(detalhe) })

  const temChave = fsm.existsSync(cfg.age_key_file)
  if (!temChave) add('chave', false, `ausente: ${cfg.age_key_file}`)
  else if (process.platform === 'win32') add('chave', true, `ACL do usuario (${cfg.age_key_file})`)
  else {
    const modo = fsm.statSync(cfg.age_key_file).mode & 0o777
    add('chave', modo === 0o600, modo === 0o600 ? '0600' : `modo ${modo.toString(8)} (esperado 600)`)
  }

  // `source=automation` depende do token em arquivo: sem ele nao ha' refresh, e o unico sintoma
  // seria um `op` recusando longe da causa. Le SO' para saber se esta' VAZIO (nada de conteudo).
  if (cfg.source === 'automation') {
    if (!fsm.existsSync(cfg.token_file)) add('token', false, `ausente: ${cfg.token_file}`)
    else if (!fsm.readFileSync(cfg.token_file, 'utf8').trim()) add('token', false, `VAZIO: ${cfg.token_file}`)
    else if (process.platform === 'win32') add('token', true, `ACL do usuario (${cfg.token_file})`)
    else {
      const modo = fsm.statSync(cfg.token_file).mode & 0o777
      const ok = modo === 0o400 || modo === 0o600
      add('token', ok, ok ? modo.toString(8).padStart(3, '0') : `modo ${modo.toString(8)} (esperado 400 ou 600)`)
    }
  }

  const t = confereTemplate(cfg, { fs: fsm })
  add('template', t.ok, t.detalhe)

  let rec = null
  if (temChave) {
    try {
      rec = recipient(cfg.age_key_file)
      add('recipient', true, rec)
    } catch (e) {
      add('recipient', false, e.message)
    }
  }

  if (!fsm.existsSync(cfg.cache_file)) add('cache', false, `ausente: ${cfg.cache_file}`)
  else {
    try {
      const doCache = recipientDoCache(cfg, { fs: fsm }) ?? []
      const bate = rec && doCache.length > 0 && doCache.every((r) => r === rec)
      add('cache', bate, bate ? 'recipient da chave' : `recipient do cache: ${doCache.join(', ') || '-'}`)
    } catch (e) {
      add('cache', false, e.message)
    }
  }

  if (cfg.sops_config) {
    const alvo = recipientsDe(cfg, { fs: fsm })
    const bate = rec && alvo.includes(rec)
    add('sops_config', bate, bate ? `${alvo.length} recipient(s)` : `nao declara o recipient da chave (${alvo.length} declarado(s))`)
  }

  if (fsm.existsSync(cfg.cache_file) && temChave) {
    try {
      decifra(cfg)
      add('decifra', true, `cache ok em ${cfg.cache_file}`)
    } catch (e) {
      add('decifra', false, e.message)
    }
  }

  const sujos = envSujoNomes(env)
  add('ambiente', sujos.length === 0, sujos.length ? `variaveis vazando: ${sujos.join(', ')}` : 'sem OP_*/SOPS_AGE_KEY')

  return { ok: linhas.every((l) => l.ok), linhas }
}

/** Tabela OK/FALHA — o caminho certo de cada linha, nunca um valor. */
export function format(r) {
  const largura = Math.max(...r.linhas.map((l) => l.nome.length))
  return [
    `tars secrets check: ${r.ok ? 'ok' : 'FALHA'}`,
    ...r.linhas.map((l) => `  ${(l.ok ? 'OK    ' : 'FALHA ')}${l.nome.padEnd(largura)}  ${l.detalhe}`),
  ].join('\n')
}

/** Modulo DONO do subcomando: o CLI so' chama; o julgamento fica aqui. */
export function run({ sub, rest = [], cfg, env = process.env, tty = process.stdin.isTTY }) {
  if (sub === 'refresh') {
    const r = refresh(cfg, { env, tty })
    return { saida: `tars secrets refresh: cache atualizado em ${r.cache_file} (${r.chaves} chave(s))`, status: 0 }
  }
  if (sub === 'exec') {
    const argv = rest[0] === '--' ? rest.slice(1) : rest
    return { status: exec(cfg, argv, { env }).status }
  }
  if (sub === 'check') {
    const r = check(cfg, { env })
    return { saida: format(r), status: r.ok ? 0 : 1 }
  }
  throw new ErroConfig(`uso: tars secrets <refresh|exec|check> (recebi '${sub ?? ''}')`)
}
