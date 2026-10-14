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
// TRES CAMADAS, merge CAMPO A CAMPO num lugar so' (`resolve`): (1) EMBUTIDO no Tars — so'
// estrutura, nomes de campo e caminhos LOCAIS (`~/.config/tars/<projeto>/`, Windows
// `%APPDATA%\tars\<projeto>\`); NENHUMA ref `op://` e nenhuma identidade, porque identidade
// nao viaja no catalogo. (2) PERFIL do usuario, FORA de repo (`~/.config/tars/profile.toml`,
// Windows `%APPDATA%\tars\profile.toml`) — e' onde as refs pessoais moram. (3) PROJETO
// (`.ai/tars.toml [secrets]`), que sobrescreve o perfil campo a campo. Comando que precisa de
// uma ref que nenhuma camada declarou FALHA ALTA nomeando o campo (nada de fallback mudo).
//
// DEFAULTS NEUTROS: nada de "pablo" nem "dotfiles" — o nome do projeto vem do diretorio.
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
import { parseToml } from './tars-sync.mjs'
// O scan RAPIDO do doctor (so' env e rc) reusa os MESMOS padroes do `secrets scan` — um lugar
// so' decide o que e' segredo (R3).
import { findSecretsIds } from './secrets-patterns.mjs'

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
export function roda(bin, args, { env = process.env, cwd } = {}) {
  for (const a of args) {
    if (typeof a === 'string' && /op:\/\//.test(a)) validaRef(a)
  }
  registra(env.OP_SERVICE_ACCOUNT_TOKEN)
  registra(env.SOPS_AGE_KEY)
  // `cwd` existe por um caso so': o `sops updatekeys` descobre o `.sops.yaml` subindo a partir
  // do diretorio de trabalho (nao do arquivo), e a recifra precisa achar o manifesto do projeto.
  const r = spawnSync(bin, args, { env, encoding: 'utf8', ...(cwd ? { cwd } : {}) })
  if (r.stderr) r.stderr = redige(r.stderr)
  return r
}

/**
 * Chama o `op`. No Windows um `.cmd`/`.bat` (shim, comum quando o `op` vem por npm) NAO e'
 * executavel por CreateProcess: precisa do `cmd.exe`. O binario de verdade roda direto — so'
 * o shim paga o shell.
 */
export function spawnOp(args, env) {
  const bin = opBin()
  const viaCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
  return viaCmd ? roda(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', bin, ...args], { env }) : roda(bin, args, { env })
}

/**
 * Os campos da config, com a UNICA coisa que os distingue: `ref: true` = guarda uma REFERENCIA
 * `op://` (identidade — nenhuma camada embutida a declara); `padrao(dir)` = caminho LOCAL
 * embutido. A tabela e' a SSOT do merge: acrescentar campo e' acrescentar linha aqui (R3).
 */
export const CAMPOS = {
  age_key_ref: { ref: true }, // a chave age do projeto no cofre
  bot: { ref: true }, // a identidade de automacao no cofre
  allowed_signers: { ref: true }, // o allowed_signers da assinatura de commit no cofre
  age_key_file: { padrao: (dir) => path.join(dir, 'age.key') },
  cache_file: { padrao: (dir) => path.join(dir, 'secrets.sops.json') },
  template: { padrao: (dir) => path.join(dir, 'secrets.tpl') },
  token_file: { padrao: (dir) => path.join(dir, 'op-token') },
  // A data de vencimento do token (`AAAA-MM-DD`): nem ref nem caminho — um FATO do token, que
  // ganha o merge campo a campo de graca por estar nesta tabela. Ausente = `sem data` no check.
  token_expires: {},
  // COMO a identidade entra no cofre (`ESTRATEGIAS_COFRE`): nem ref nem caminho — a escolha da
  // estrategia de escrita. Ausente = `template`, o caminho de hoje.
  age_key_write: {},
  // Quantos dias o cache pode envelhecer antes do `doctor` avisar (S3/dev.9). Ausente = 30:
  // um cache que ninguem recifra ha' um mes carrega a chave que o cofre ja' pode ter trocado.
  cache_max_dias: {},
  // `git_credential` (dev.19): o NOME da chave do cache que guarda o PAT, e a LISTA de HOSTS
  // (separados por virgula) para os quais o helper a ENTREGA. Sem a lista declarada o helper
  // nao entrega para host NENHUM — a negacao e' o default, e um host a mais so' entra por
  // declaracao explicita do dono. Ver `respostaCredential`.
  git_credential: {},
  git_hosts: {},
}

/** As camadas, da mais fraca para a mais forte. A ordem E' o merge (campo a campo). */
export const CAMADAS = ['embutido', 'perfil', 'projeto']

/** A BASE da config do usuario: `TARS_SECRETS_DIR` troca tudo (o teste aponta para um tmpfs). */
export function baseConfig({ env = process.env } = {}) {
  return (
    env.TARS_SECRETS_DIR ||
    (process.platform === 'win32'
      ? path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tars')
      : path.join(os.homedir(), '.config', 'tars'))
  )
}

/**
 * Onde moram chave, cache, template e token quando o projeto nao declara caminho. Um lugar
 * so' (R3): o nome do projeto e' o diretorio — nada de constante com nome de pessoa.
 */
export function configDir({ project = process.cwd(), env = process.env } = {}) {
  return path.join(baseConfig({ env }), path.basename(path.resolve(project)))
}

/** O PERFIL do usuario: FORA de repo (o projeto nunca o versiona), um por maquina. */
export function perfilFile({ env = process.env } = {}) {
  return path.join(baseConfig({ env }), 'profile.toml')
}

/**
 * Le o perfil do usuario. Ausente = `{}` (nao e' erro: quem exige uma ref e' o comando que
 * precisa dela). A tabela mora em `[secrets]`, igual a do projeto — assim o perfil pode
 * crescer para outras secoes sem colidir.
 */
export function lerPerfil({ env = process.env, fs: fsm = fs } = {}) {
  const f = perfilFile({ env })
  if (!fsm.existsSync(f)) return {}
  try {
    return parseToml(fsm.readFileSync(f, 'utf8')).secrets ?? {}
  } catch (e) {
    throw new ErroConfig(`[secrets] perfil ilegivel em ${f}: ${e.message}`)
  }
}

/**
 * Um PADRAO de ref por PROJETO (`<campo>_pattern`): o unico placeholder e' `{projeto}`,
 * resolvido pelo nome do diretorio do projeto. Sem o placeholder o padrao nao distingue
 * projeto nenhum — todos dividiriam a MESMA chave, e o erro so' apareceria longe (uma
 * chave compartilhada que ninguem percebe). Por isso aqui e' falha ALTA (R4).
 */
export function expandePadrao(campo, padrao, nomeProjeto) {
  if (!String(padrao).includes('{projeto}')) {
    throw new ErroConfig(
      `[secrets] o padrao do perfil precisa de {projeto}, senao todos os projetos dividem a chave (\`${campo}_pattern\`)`,
    )
  }
  return String(padrao).split('{projeto}').join(nomeProjeto)
}

/**
 * O MERGE, campo a campo, num lugar so'. Para cada campo vale a camada mais forte que o
 * declara (projeto > perfil > embutido) e fica gravada a ORIGEM (`_origem`) — e' o que o
 * `check` mostra e o que permite a mensagem de ref ausente nomear as tres camadas.
 *
 * Um campo de REF que nenhuma camada declara PRONTO pode vir de um padrao por projeto
 * (`<campo>_pattern`, tipicamente no perfil): a ref e' gerada com o `{projeto}` do `dir`, e
 * a origem gravada e' `perfil(padrao)` (ou `projeto(padrao)`). A ref pronta SEMPRE vence o
 * padrao; o projeto SEMPRE vence o perfil.
 *
 * EXCECAO: `key_scope=machine` IGNORA o padrao de `age_key_ref` (de QUALQUER camada). A chave
 * da maquina e' GERADA aqui — nao ha' ref a expandir, e um padrao que so' existe para nomear
 * uma ref no cofre nao pode virar "declaracao" que o proprio `check` reprova depois. So' uma
 * ref PRONTA (projeto ou perfil) e' declaracao em machine — e o `lerConfig` a recusa.
 */
function resolve(projeto, perfil, dir, nomeProjeto, key_scope) {
  const cfg = { _origem: {} }
  const camadas = [['projeto', projeto], ['perfil', perfil]]
  for (const [campo, def] of Object.entries(CAMPOS)) {
    for (const [camada, tabela] of camadas) {
      if (tabela[campo] !== undefined && tabela[campo] !== null) {
        cfg[campo] = tabela[campo]
        cfg._origem[campo] = camada
        break
      }
    }
    if (def.ref && campo === 'age_key_ref' && key_scope === 'machine' && cfg[campo] === undefined) {
      cfg._origem[campo] = 'n/a (machine)'
      continue
    }
    if (def.ref && cfg[campo] === undefined) {
      for (const [camada, tabela] of camadas) {
        const padrao = tabela[`${campo}_pattern`]
        if (padrao === undefined || padrao === null) continue
        cfg[campo] = expandePadrao(campo, padrao, nomeProjeto)
        cfg._origem[campo] = `${camada}(padrao)`
        break
      }
    }
    if (cfg[campo] === undefined && def.padrao) {
      cfg[campo] = def.padrao(dir)
      cfg._origem[campo] = 'embutido'
    }
  }
  return cfg
}

/** A ref `op://` do campo, vinda de QUALQUER camada — ausente GRITA nomeando o campo. */
function exigeRef(cfg, campo, env = process.env) {
  if (!cfg[campo]) {
    throw new ErroConfig(
      `[secrets] \`${campo}\` nao declarado em nenhuma camada (${CAMADAS.join(' | ')}): declare a ref \`op://\` (ou \`${campo}_pattern\` com \`{projeto}\`) no perfil (${perfilFile({ env })}) ou no \`.ai/tars.toml [secrets]\` do projeto`,
    )
  }
  return validaRef(cfg[campo])
}

/**
 * Valida a tabela `[secrets]` e resolve os caminhos. TODA regra do desenho mora aqui (uma
 * so'), e cada violacao GRITA nomeando o que faltou (R4) — um `source` ausente nao pode
 * virar "usa o que der".
 */
export function lerConfig(secrets = {}, { project = process.cwd(), env = process.env, perfil } = {}) {
  const dir = configDir({ project, env })
  const emPerfil = perfil ?? lerPerfil({ env })
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
  const cfg = resolve(secrets, emPerfil, dir, path.basename(dir), key_scope)
  const sops_config = secrets.sops_config ?? null
  // A ref da chave vem de QUALQUER camada (ref pronta OU padrao por projeto), mas nunca do
  // template (ver `confereTemplate`).
  if (key_scope === 'project') exigeRef(cfg, 'age_key_ref', env)
  // Em machine o PADRAO e' ignorado no merge (ver `resolve`): o que sobra aqui e' declaracao
  // EXPLICITA de ref (projeto ou perfil) — essa sim e' erro, porque a chave e' gerada na maquina.
  if (key_scope === 'machine' && cfg.age_key_ref) {
    throw new ErroConfig('[secrets] key_scope=machine PROIBE age_key_ref: a chave e\' gerada NA MAQUINA, nunca lida do cofre')
  }
  // Um `.sops.yaml` VERSIONADO com escopo de maquina seria uma segunda fonte de verdade: a
  // receita de cifra viajaria no git e a chave local nao a explicaria. Recusa alta.
  if (key_scope === 'machine' && sops_config) {
    throw new ErroConfig('[secrets] key_scope=machine PROIBE sops_config versionado (a receita mora so\' na chave gerada aqui)')
  }
  for (const campo of Object.keys(CAMPOS)) {
    if (CAMPOS[campo].ref && cfg[campo]) validaRef(cfg[campo])
  }
  // A estrategia de escrita no cofre e' escolha DECLARADA: um nome fora da lista falharia longe,
  // no meio da rotacao, ja' com o cofre aberto — entao a lista e' conferida aqui (R4).
  if (cfg.age_key_write && !Object.keys(ESTRATEGIAS_COFRE).includes(cfg.age_key_write)) {
    throw new ErroConfig(
      `[secrets] age_key_write invalido: '${cfg.age_key_write}' (use ${Object.keys(ESTRATEGIAS_COFRE).join(' | ')})`,
    )
  }
  // `sops_files` e' a LISTA de arquivos versionados a recifrar na rotacao (glob, relativo ao
  // PROJETO). Nao e' ref nem caminho local: ganha tratamento proprio, como o `sops_config`.
  const sops_files = secrets.sops_files ?? null
  return { ...cfg, key_scope, source: secrets.source, sops_config, sops_files, projeto: path.resolve(project), dir }
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

/**
 * O ambiente com que o `op` e' SPAWNADO: token da SA (automation) e Connect FORA — ele FALHA
 * em vez de cair num Connect inexistente. Em `automation` o desbloqueio por biometria e'
 * FORCADO a `false`: nao ha' dono nem dedo na frente do leitor nesse caminho, e deixa-lo
 * ligado faria o `op` pedir a mao humana — falha longe da causa. Com `owner` NADA e' forcado:
 * a sessao do app e' do dono, e a biometria e' escolha dele.
 */
export function envDoCofre(cfg, base = process.env) {
  const env = { ...base }
  delete env.OP_CONNECT_HOST
  delete env.OP_CONNECT_TOKEN
  if (cfg.source === 'automation') {
    env.OP_SERVICE_ACCOUNT_TOKEN = lerToken(cfg)
    env.OP_BIOMETRIC_UNLOCK_ENABLED = 'false'
  }
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
  // log de quem chamou o `op`. A ref vem de uma das CAMADAS — `validaRef` ja' a conferiu.
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
 * O template e' um env-file do `op run`: o UNICO lugar de segredo e' `KEY=op://...` — a ref
 * como VALOR INTEIRO de uma atribuicao. NAO e' `{{ op://... }}` (o `op run --env-file` entrega
 * ao filho o literal COM as chaves, nao o valor) nem `# op://...` num comentario: o `op run`
 * resolve QUALQUER `op://` do arquivo, entao um comentario viraria segredo a mais no material
 * cifrado. E se o template citar a ref da CHAVE age, a chave entra no cache. Todos REPROVAM.
 * So' `op://` de atribuicao conta — as demais linhas (comentario sem ref, `KEY=x` sem op://)
 * passam. A mensagem cita linha e NOME, nunca o valor.
 */
export function confereTemplate(cfg, { fs: fsm = fs } = {}) {
  if (!fsm.existsSync(cfg.template)) return { ok: false, detalhe: `ausente: ${cfg.template}` }
  const txt = fsm.readFileSync(cfg.template, 'utf8')
  const linhas = txt.split(/\r?\n/)
  // `export KEY=...` recusado: o env-file do `op run` tem UM formato (KISS) — `KEY=valor`. Um
  // `export` funcionaria por acidente no `op run` e mentiria sobre o formato em todo o resto.
  const iExport = linhas.findIndex((l) => /^\s*export\s+\S/.test(l))
  if (iExport !== -1) {
    return { ok: false, detalhe: `linha ${iExport + 1}: \`export\` nao e' aceito — use \`KEY=op://...\` (o env-file do \`op run\` tem formato unico)` }
  }
  // `KEY=op://...`: valor inteiro, opcionalmente entre aspas; o resto da linha (ate o fim) pode
  // ter espaco — um campo do 1Password pode chama-lo (`op://v/i/private key`).
  const refValida = /^\s*[A-Z_][A-Z0-9_]*\s*=\s*"?op:\/\/[^"\r\n]+"?\s*$/
  let achadas = 0
  for (let i = 0; i < linhas.length; i++) {
    const refs = (linhas[i].match(/op:\/\//g) || []).length
    if (refs === 0) continue
    achadas += refs
    if (!refValida.test(linhas[i])) {
      const nome = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(linhas[i])?.[1]
      return {
        ok: false,
        detalhe: `linha ${i + 1}${nome ? ` (\`${nome}\`)` : ''}: \`op://\` so' vale como valor inteiro de \`KEY=op://...\` — nem em comentario, nem no meio do valor, nem dentro de \`{{ }}\``,
      }
    }
    if (refs > 1) return { ok: false, detalhe: `linha ${i + 1}: mais de uma \`op://\` — cada linha e' uma chave` }
  }
  if (cfg.age_key_ref && txt.includes(cfg.age_key_ref)) {
    return { ok: false, detalhe: 'o template cita a ref da CHAVE age — ela vem so\' do manifesto' }
  }
  return { ok: true, detalhe: `${achadas} referencia(s) \`op://\` no formato \`KEY=op://...\`` }
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
 * O `stdin` do protocolo do git: o `git` manda `chave=valor\n` e NADA de interativo — le' o
 * fd 0 ate' o fim, sem eco e sem TTY. Separado de `leOculto` (que e' a pergunta secreta do
 * dono) porque a natureza e' outra: aqui o texto e' o PEDIDO, nao o segredo.
 */
export function leStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/**
 * O subcomando `git-credential` (dev.19): o `git` chama este helper como
 * `tars secrets git-credential <get|store|erase>` e manda os campos do pedido
 * (`protocol=`, `host=`, ...) pelo STDIN, uma linha `chave=valor` cada. O helper responde no
 * stdout o mesmo formato (`username=`, `password=`) — o protocolo esta em
 * https://git-scm.com/docs/gitcredentials#_helper_protocol.
 *
 * O que vale aqui, sem excecao:
 *   1. O PAT sai do CACHE cifrado (`decifraMapa`), nunca do `op` em tempo real: o `git` abre
 *      uma conexao por fetch e nao pode depender de biometria/1Password a cada uma.
 *   2. O host e' conferido CONTRA a lista declarada (`git_hosts`) — host sem declaracao nao
 *      recebe credencial nenhuma (resposta vazia, o `git` decide). A lista e' a unica coisa
 *      entre o cache inteiro e qualquer servidor que peca senha; entrega so' para o declarado.
 *   3. `store`/`erase` sao NO-OP: o cache e' a fonte e nao ha' o que gravar nem apagar por
 *      pedido do `git` (o `erase` de um 401 NAO derruba o cache). Sair 0 e' o contrato.
 *   4. A entrada do `git` NAO e' ecoada em mensagem de erro: e' dado de origem externa, e a
 *      regra e' nao ecoar entrada nao confiavel — o diagnostico cita o HOST, nunca o pedido cru.
 */
export function respostaCredential(cfg, entrada, { mapaLeitor = decifraMapa } = {}) {
  const campos = {}
  for (const bruta of String(entrada ?? '').split(/\r?\n/)) {
    const linha = bruta.replace(/\r$/, '')
    if (!linha.trim()) continue
    const i = linha.indexOf('=')
    if (i <= 0) continue
    campos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
  }
  const host = campos.host || ''
  // A lista de hosts vem declarada (`git_hosts`), resolvida pelo merge das camadas — nao ha'
  // default com nome de pessoa. Ausente = lista vazia = entrega para ninguem (negacao default).
  const declarados = String(cfg.git_hosts ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  if (!host || !declarados.includes(host.toLowerCase())) {
    return { saida: '', entregue: false, motivo: host ? 'host fora de `git_hosts`' : 'pedido sem `host`' }
  }
  if (!cfg.git_credential) {
    throw new ErroConfig('[secrets] `git_hosts` declarado mas `git_credential` (o NOME da chave do cache) nao — sem o nome nao ha o que ler')
  }
  // A chave no cache e' o NOME (nao uma ref `op://`): o cache e' plano (`KEY=valor`), e o
  // `refresh` copiou para la' o campo que o template resolveu. Um nome invalido nao e' ecoado.
  const nome = String(cfg.git_credential)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) {
    throw new ErroConfig('[secrets] git_credential precisa ser um NOME de variavel do cache (valor deliberadamente NAO ecoado)')
  }
  if (!fs.existsSync(cfg.cache_file)) {
    throw new ErroConfig(`[secrets] cache ausente em ${cfg.cache_file} — rode \`tars secrets refresh\``)
  }
  const mapa = mapaLeitor(cfg)
  const pat = mapa[nome]
  if (!pat) {
    throw new ErroConfig(`[secrets] \`${nome}\` nao esta' no cache — declare a ref no template e rode \`tars secrets refresh\``)
  }
  // O formato do protocolo: `username=` + `password=` + linha vazia encerrando.
  return { saida: `username=x-access-token\npassword=${pat}\n\n`, entregue: true, motivo: 'entregue' }
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

  // O token e' UMA linha so': o ARQUIVO (source=automation) e a DATA de vencimento sao fatos do
  // mesmo token. `source=automation` sem o arquivo nao tem refresh, e o unico sintoma seria um
  // `op` recusando longe da causa — le SO' para saber se esta' VAZIO (nada de conteudo).
  if (cfg.source === 'automation' || cfg.token_expires) {
    let okToken = true
    let detalheToken = 'sem data'
    if (cfg.source === 'automation') {
      if (!fsm.existsSync(cfg.token_file)) {
        okToken = false
        detalheToken = `ausente: ${cfg.token_file}`
      } else if (!fsm.readFileSync(cfg.token_file, 'utf8').trim()) {
        okToken = false
        detalheToken = `VAZIO: ${cfg.token_file}`
      } else if (process.platform === 'win32') {
        detalheToken = `ACL do usuario (${cfg.token_file})`
      } else {
        const modo = fsm.statSync(cfg.token_file).mode & 0o777
        okToken = modo === 0o400 || modo === 0o600
        detalheToken = okToken ? modo.toString(8).padStart(3, '0') : `modo ${modo.toString(8)} (esperado 400 ou 600)`
      }
    }
    if (cfg.token_expires) {
      const dias = diasAte(cfg.token_expires)
      // Vencido FALHA (o token morreu); perto de vencer AVISA (ainda funciona — reprovar aqui
      // pararia automacao que esta' viva por um fato que ainda nao aconteceu).
      if (dias < 0) {
        okToken = false
        detalheToken = `vencido em ${cfg.token_expires}`
      } else if (dias < DIAS_AVISO_TOKEN) {
        detalheToken += ` — avisa: vence em ${dias} dia(s) (${cfg.token_expires})`
      } else {
        detalheToken += ` — vence em ${dias} dia(s) (${cfg.token_expires})`
      }
    } else if (okToken) {
      // Sem `token_expires` a linha DIZ que nao ha' data — "sem data" e' diferente de "esta
      // tudo certo, nao sei ate' quando". Silencio aqui seria a data que ninguem nota faltar.
      detalheToken = 'sem data'
    }
    add('token', okToken, detalheToken)
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

  // A ORIGEM de cada ref (embutido | perfil | projeto) — nunca o valor: o que se julga aqui e'
  // de ONDE a declaracao veio, nao o que ela diz.
  const refs = Object.keys(CAMPOS).filter((c) => CAMPOS[c].ref)
  add('refs', true, refs.map((c) => `${c}=${cfg._origem?.[c] ?? 'nenhum'}`).join(' '))

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

// --- DOCTOR (S3, dev.9) -------------------------------------------------------------
// O `tars doctor` de um projeto que declara `[secrets]`/`[identity]` inclui TUDO do `check` e
// acrescenta so' o que o ATOR e o TEMPO explicam: a idade do cache, o transporte de quem
// commita (licao 7), o push de quem commita (licao 9) e um scan RAPIDO (env e rc; transcripts
// e git ficam no `scan` explicito). Tudo aqui e' PURO ou injetavel — o `op` nunca e' aberto.

/** Quantos dias o cache pode envelhecer antes do AVISO (o projeto pode declarar outro). */
export const CACHE_MAX_DIAS = 30

/** Dias desde a ultima escrita do cache; `null` quando nao ha' cache (o `check` ja' reprova). */
export function idadeCache(cfg, { fs: fsm = fs, agora = new Date() } = {}) {
  if (!fsm.existsSync(cfg.cache_file)) return null
  return Math.floor((agora.getTime() - fsm.statSync(cfg.cache_file).mtimeMs) / 86400000)
}

/** O socket do agente SSH do 1Password — o do DONO. Automacao nunca usa este caminho. */
export const ehAgente1Password = (sock) => /(^|[\\/])\.1password[\\/]/i.test(String(sock ?? ''))

/** O `oauth_token:` em texto no `hosts.yml` do `gh`: so' a PRESENCA da chave, nunca o valor. */
export function ghTokenEmTexto({ env = process.env, fs: fsm = fs } = {}) {
  // No win32 o `gh` usa o keyring (wincred); o caminho de texto e' o WSL/Linux sem keyring.
  if (process.platform === 'win32') return false
  const f = path.join(env.HOME || os.homedir(), '.config', 'gh', 'hosts.yml')
  if (!fsm.existsSync(f)) return false
  return fsm.readFileSync(f, 'utf8').split(/\r?\n/).some((l) => /^\s*oauth_token:\s*\S/.test(l))
}

/** O remote que o doctor julga (default: `origin`); `null` quando o repo nao tem um. */
export function remoteDoProjeto({ cwd = process.cwd(), nome = 'origin', git = spawnSync } = {}) {
  const r = git('git', ['remote', 'get-url', nome], { cwd, encoding: 'utf8' })
  return r.status === 0 ? String(r.stdout ?? '').trim() : null
}

/** `git rev-list @{u}..HEAD` — quantos commits locais ainda nao foram empurrados. */
export function commitsNaoEmpurrados({ cwd = process.cwd(), git = spawnSync } = {}) {
  const up = git('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd, encoding: 'utf8' })
  if (up.status !== 0) return { semUpstream: true, n: null }
  const r = git('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd, encoding: 'utf8' })
  return { semUpstream: false, n: Number(String(r.stdout ?? '').trim() || 0) }
}

/** Licao 7: o TRANSPORTE de quem commita. Ator humano nao e' julgado (o transporte e' dele). */
export function transportePorAtor({ ator, env = process.env, remote = null, ghTexto = false } = {}) {
  if (ator !== 'agent') return { nome: 'transporte', ok: true, detalhe: `ator ${ator} — transporte e' acao do dono` }
  if (/^(ssh:\/\/|git@)/.test(String(remote ?? ''))) {
    return { nome: 'transporte', ok: false, detalhe: `ator agente com remote SSH (${remote}) — use HTTPS com o token do bot (licao 7)` }
  }
  if (ehAgente1Password(env.SSH_AUTH_SOCK)) {
    return { nome: 'transporte', ok: false, detalhe: 'ator agente com SSH_AUTH_SOCK do agente do 1Password — esse agente SSH pertence ao dono (licao 7)' }
  }
  if (ghTexto) {
    return { nome: 'transporte', ok: false, detalhe: "gh com `oauth_token:` em texto no ~/.config/gh/hosts.yml (sem keyring) — use o credential helper do bot (licao 7)" }
  }
  return { nome: 'transporte', ok: true, detalhe: `HTTPS/sem agente do dono${remote ? ` (${remote})` : ''}` }
}

/** Licao 9: ator agente com commit local nao empurrado (ou sem upstream) = FALHA. */
export function pushPorAtor({ ator, commits } = {}) {
  if (ator !== 'agent') return { nome: 'push', ok: true, detalhe: `ator ${ator} — push so' com o dono presente (licao 9)` }
  if (!commits || commits.semUpstream) return { nome: 'push', ok: false, detalhe: 'branch sem upstream — o commit do agente nao foi empurrado (licao 9)' }
  if (commits.n > 0) return { nome: 'push', ok: false, detalhe: `${commits.n} commit(s) local(is) sem push (licao 9)` }
  return { nome: 'push', ok: true, detalhe: 'sem commit local pendente' }
}

/** Os rc que o scan rapido olha — so' arquivos de shell, nunca transcripts nem git. */
export const RC_FILES = ['.bashrc', '.zshrc', '.profile', '.bash_profile']

/** Licao 5/11: scan RAPIDO — so' env e rc; reporta NOMES, jamais o valor. */
export function scanRapido({ env = process.env, fs: fsm = fs } = {}) {
  const alvos = Object.entries(env)
    .filter(([, v]) => findSecretsIds(String(v ?? '')).length)
    .map(([k]) => k)
  const home = env.HOME || os.homedir()
  for (const rc of RC_FILES) {
    const f = path.join(home, rc)
    if (fsm.existsSync(f) && findSecretsIds(fsm.readFileSync(f, 'utf8')).length) alvos.push(rc)
  }
  return { nome: 'scan', ok: alvos.length === 0, detalhe: alvos.length ? `segredo em: ${alvos.join(', ')}` : 'env e rc limpos' }
}

/**
 * O doctor de SEGREDOS: tudo do `check` + idade do cache + transporte/push por ator + scan
 * rapido. Mesma forma do `check` (`{ ok, linhas }`), entao quem ja' consome uma consome a outra.
 */
export function doctor(cfg, {
  env = process.env,
  fs: fsm = fs,
  decifra = decifraMapa,
  ator = actor({ env }),
  cwd = process.cwd(),
  remoteNome = 'origin',
  git = spawnSync,
  remote,
  commits,
  gh,
  agora,
} = {}) {
  const base = check(cfg, { env, fs: fsm, decifra })
  const linhas = [...base.linhas]

  const max = Number(cfg.cache_max_dias ?? CACHE_MAX_DIAS)
  const dias = idadeCache(cfg, { fs: fsm, agora })
  if (dias !== null) {
    linhas.push(
      dias > max
        ? { nome: 'cache_idade', ok: true, detalhe: `AVISO: cache com ${dias} dia(s) (max ${max}) — rode \`tars secrets refresh\`` }
        : { nome: 'cache_idade', ok: true, detalhe: `${dias} dia(s) (max ${max})` },
    )
  }

  const rem = remote ?? remoteDoProjeto({ cwd, nome: remoteNome, git })
  const ghTexto = gh ?? ghTokenEmTexto({ env, fs: fsm })
  linhas.push(transportePorAtor({ ator, env, remote: rem, ghTexto }))
  linhas.push(pushPorAtor({ ator, commits: commits ?? commitsNaoEmpurrados({ cwd, git }) }))
  linhas.push(scanRapido({ env, fs: fsm }))

  return { ok: linhas.every((l) => l.ok), linhas }
}

/**
 * Le a tabela do PROJETO e roda o doctor de segredos. `null` quando o projeto nao declara
 * `[secrets]` nem `[identity]` — sem opt-in, o doctor nao inventa checagem nenhuma. Config
 * invalida vira FALHA (nao excecao): o doctor e' onde o erro precisa APARECER, nao derrubar.
 */
export function doctorDoProjeto(root, { env = process.env, fs: fsm = fs, ...rest } = {}) {
  const file = path.join(root, '.ai', 'tars.toml')
  if (!fsm.existsSync(file)) return null
  const tabs = parseToml(fsm.readFileSync(file, 'utf8'))
  if (!tabs.secrets && !tabs.identity) return null
  try {
    const cfg = lerConfig(tabs.secrets ?? {}, { project: root, env })
    return doctor(cfg, { env, fs: fsm, cwd: root, remoteNome: tabs.identity?.remote ?? 'origin', ...rest })
  } catch (e) {
    if (e instanceof ErroConfig) return { ok: false, linhas: [{ nome: 'secrets', ok: false, detalhe: e.message }] }
    throw e
  }
}

// --- ROTACAO DA CHAVE (rotate) E TROCA DO TOKEN (token set) ---------------------------
// Duas operacoes do DONO, com a mesma regra de ouro: o SEGREDO nunca passa por argv (ha'
// `ps`), o estado fica em DISCO para retomar (idempotencia), e nada local muda antes de o
// cofre confirmar. O `op` de verdade so' e' exercitado pelo dono; aqui tudo passa pelo
// mesmo `roda`/`spawnOp`, entao o stub de teste cobre o caminho inteiro.

/** Quantos dias antes do vencimento o `check` AVISA (nao reprova) que o token vai vencer. */
export const DIAS_AVISO_TOKEN = 14

/** Dias ate' a data `AAAA-MM-DD` (negativo = ja' venceu). Formato invalido GRITA (R4). */
export function diasAte(data, hoje = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? ''))
  if (!m) throw new ErroConfig(`[secrets] token_expires invalido: '${data}' (use AAAA-MM-DD)`)
  const alvo = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / 86400000)
}

/** O arquivo de ESTADO da rotacao: e' ele que faz `rodar de novo` RETOMAR, nao recomecar. */
export const estadoRotate = (cfg) => path.join(cfg.dir, 'rotate.state')

function leEstado(cfg) {
  const f = estadoRotate(cfg)
  if (!fs.existsSync(f)) return { passo: 0, recipient_velho: null, recipient_novo: null }
  try {
    return { passo: 0, recipient_velho: null, recipient_novo: null, ...JSON.parse(fs.readFileSync(f, 'utf8')) }
  } catch {
    return { passo: 0, recipient_velho: null, recipient_novo: null }
  }
}

/** Grava o estado 0600 de forma ATOMICA: um estado meio-escrito mentiria sobre o passo. */
function gravaEstado(cfg, st) {
  const f = estadoRotate(cfg)
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 })
  const tmp = `${f}.novo`
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2), { mode: 0o600 })
  protegeArquivo(tmp)
  fs.renameSync(tmp, f)
}

/** `op://cofre/item/campo` -> o ITEM (para `op item edit`) e o CAMPO a trocar. */
export function partesRef(ref) {
  const m = /^op:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(validaRef(ref))
  if (!m) {
    throw new ErroConfig("[secrets] a ref da chave precisa de `op://cofre/item/campo`: sem o campo nao da' para editar o item")
  }
  return { item: `op://${m[1]}/${m[2]}`, campo: m[3] }
}

/** O conteudo do arquivo da chave (a identidade `AGE-SECRET-KEY-1...`) — nunca ecoado fora. */
const identidadeDe = (arquivo) => fs.readFileSync(arquivo, 'utf8').trim()

/** Le a resposta [s/N] do TTY (sem eco de segredo: aqui so' entra `s`/`n`). */
export function perguntaTty(msg) {
  process.stdout.write(`${msg} [s/N] `)
  const b = Buffer.alloc(64)
  let n = 0
  try {
    n = fs.readSync(0, b, 0, b.length, null)
  } catch {
    n = 0
  }
  const r = b.subarray(0, n).toString('utf8').trim().toLowerCase()
  return r === 's' || r === 'sim' || r === 'y' || r === 'yes'
}

/** Le um segredo do stdin SEM eco (raw mode): o token novo nunca passa por argv nem por eco. */
export function leOculto(msg) {
  process.stdout.write(msg)
  const b = Buffer.alloc(1)
  const pedacos = []
  const cru = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function'
  if (cru) process.stdin.setRawMode(true)
  try {
    for (;;) {
      let n = 0
      try {
        n = fs.readSync(0, b, 0, 1, null)
      } catch {
        break
      }
      if (!n) break
      const c = b.toString('utf8')
      if (c === '\n' || c === '\r') break
      if (c === String.fromCharCode(3)) {
        process.stdout.write('\n')
        process.exit(130)
      }
      if (c === String.fromCharCode(127) || c === '\b') {
        pedacos.pop()
        continue
      }
      pedacos.push(c)
    }
  } finally {
    if (cru) process.stdin.setRawMode(false)
    process.stdout.write('\n')
  }
  return pedacos.join('')
}

/** Um arquivo 0600 dentro de um tmp que morre no `finally`: o material nunca fica para tras. */
export function comTmp(nome, conteudo, fn) {
  reapResiduo(os.tmpdir())
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX(process.pid)))
  try {
    const f = path.join(dir, nome)
    fs.writeFileSync(f, conteudo, { mode: 0o600 })
    protegeArquivo(f)
    return fn(f)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** O item do cofre como JSON (`op item get --format json`) — o que as estrategias de ITEM leem. */
function itemDoCofre(cfg, item, env) {
  const g = spawnOp(['item', 'get', item, '--format', 'json'], envDoCofre(cfg, env))
  if (g.status !== 0) {
    throw new ErroConfig(`[secrets] nao consegui ler o item ${item} do cofre: ${(g.stderr || g.error?.message || '').trim()}`)
  }
  try {
    return JSON.parse(g.stdout)
  } catch (e) {
    throw new ErroConfig(`[secrets] o item ${item} nao voltou como JSON: ${e.message}`)
  }
}

/**
 * O campo do item, gritando quando a ref aponta para um campo que nao existe.
 *
 * `criar` existe por UM caso: o `import` de um `.env` — ali o campo novo E' o trabalho, e
 * recusar um nome que ainda nao esta' no item tornaria o comando inutil. No caminho da
 * rotacao nada muda: sem `criar`, campo ausente continua falhando alto (uma ref que aponta
 * para o nada nao pode virar escrita silenciosa).
 */
function campoDoItem(doc, item, campo, { criar = false } = {}) {
  const alvo = (doc.fields || []).find((f) => f.id === campo || f.label === campo)
  if (alvo) return alvo
  if (!criar) {
    throw new ErroConfig(`[secrets] o item ${item} nao tem o campo '${campo}' — confira a ref \`age_key_ref\``)
  }
  const novo = { id: campo, label: campo, type: 'CONCEALED', value: '' }
  doc.fields = [...(doc.fields || []), novo]
  return novo
}

/**
 * Passo 3 — grava a identidade NOVA no item do 1Password. NUNCA por argv: o `op` so' ve o
 * CAMINHO de um template 0600, que morre no `finally`. Se o `op item edit` falhar, o item fica
 * como estava (o `op` e' transacional por item) — nenhum estado intermediario.
 *
 * `template` (DEFAULT): o JSON do item INTEIRO com o campo trocado — o caminho de hoje.
 */
function escreveItem(cfg, ref, identidade, env, opts) {
  const { item, campo } = partesRef(ref)
  const doc = itemDoCofre(cfg, item, env)
  campoDoItem(doc, item, campo, opts).value = identidade
  comTmp('item.json', JSON.stringify(doc), (tpl) => {
    const e = spawnOp(['item', 'edit', item, `--template=${tpl}`], envDoCofre(cfg, env))
    if (e.status !== 0) {
      throw new ErroConfig(`[secrets] o 1Password recusou gravar o item ${item}: ${(e.stderr || e.error?.message || '').trim()}`)
    }
  })
}

/**
 * Passo 3 — `template_parcial`: SO' o campo alterado no template. O item e' lido para conferir
 * que o campo existe (falha alta igual a` de cima), mas o que VOLTA ao cofre e' o minimo: o
 * resto do item nao sai daqui nem volta pela rede.
 */
function escreveItemParcial(cfg, ref, identidade, env, opts) {
  const { item, campo } = partesRef(ref)
  const alvo = campoDoItem(itemDoCofre(cfg, item, env), item, campo, opts)
  comTmp('item.json', JSON.stringify({ fields: [{ id: alvo.id, value: identidade }] }), (tpl) => {
    const e = spawnOp(['item', 'edit', item, `--template=${tpl}`], envDoCofre(cfg, env))
    if (e.status !== 0) {
      throw new ErroConfig(`[secrets] o 1Password recusou gravar o item ${item}: ${(e.stderr || e.error?.message || '').trim()}`)
    }
  })
}

/** A ref do DOCUMENTO (`op://cofre/documento`), com ou sem o campo atras — o campo nao se aplica. */
export function refDocumento(ref) {
  const m = /^op:\/\/([^/]+)\/([^/]+)(?:\/.+)?$/.exec(validaRef(ref))
  if (!m) throw new ErroConfig('[secrets] a ref do documento precisa de `op://cofre/documento`')
  return `op://${m[1]}/${m[2]}`
}

/**
 * Passo 3 — `documento`: `op document edit <doc> <arquivo>`, com a ref apontando para um
 * DOCUMENTO (sem campo). O valor tambem vai por ARQUIVO 0600, nunca por argv.
 */
function escreveDocumento(cfg, ref, identidade, env) {
  const doc = refDocumento(ref)
  comTmp('age.key', `${identidade}\n`, (f) => {
    const e = spawnOp(['document', 'edit', doc, f], envDoCofre(cfg, env))
    if (e.status !== 0) {
      throw new ErroConfig(`[secrets] o 1Password recusou gravar o documento ${doc}: ${(e.stderr || e.error?.message || '').trim()}`)
    }
  })
}

/**
 * A ESCRITA no cofre, atras de UMA interface (R3): cada estrategia faz a unica coisa que muda —
 * o jeito de gravar. Quem escolhe e' o campo `age_key_write`, e o default `template` e' o
 * caminho de HOJE, ate' a prova real com o cofre decidir. Nenhuma delas passa o valor por argv.
 */
export const ESTRATEGIAS_COFRE = {
  template: escreveItem,
  template_parcial: escreveItemParcial,
  documento: escreveDocumento,
}

/**
 * Grava um valor num campo do cofre pela estrategia declarada (`age_key_write`). `opts.criar`
 * so' vale para o `import` (campo novo e' o trabalho la'); o resto do modulo chama sem ele.
 */
export function editaItemNoCofre(cfg, ref, identidade, env, opts) {
  return ESTRATEGIAS_COFRE[cfg.age_key_write ?? 'template'](cfg, ref, identidade, env, opts)
}

/** Le a chave do cofre e devolve o recipient — `null` quando o cofre NAO entregou nada. */
function recipientDoCofre(cfg, env) {
  reapResiduo(os.tmpdir())
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX(process.pid)))
  const out = path.join(dir, 'age.key')
  try {
    const r = spawnOp(['read', '--out-file', out, cfg.age_key_ref], envDoCofre(cfg, env))
    if (r.status !== 0 || !fs.existsSync(out) || !fs.readFileSync(out, 'utf8').trim()) return null
    return recipient(out)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** O cofre JA' tem a chave NOVA? E' o que torna o passo 3 (escrita) e a retomada idempotentes. */
const cofreJaTem = (cfg, recipientNovo, env) => !!recipientNovo && recipientDoCofre(cfg, env) === recipientNovo

/** Passo 4 — CONFERE lendo a chave de volta do cofre: so' segue se o recipient for o NOVO. */
function confereCofre(cfg, recipientNovo, env) {
  const rec = recipientDoCofre(cfg, env)
  if (rec === null) {
    throw new ErroConfig(`[secrets] o cofre nao devolveu a chave (${cfg.age_key_ref}): nada local foi tocado`)
  }
  if (rec !== recipientNovo) {
    throw new ErroConfig('[secrets] o cofre devolveu uma chave com recipient DIFERENTE do novo — nada local foi tocado')
  }
}

/** Os arquivos versionados a recifrar: glob do manifesto, resolvido na raiz do PROJETO. */
export function expandeArquivos(cfg, { fs: fsm = fs } = {}) {
  if (!cfg.sops_config) return []
  const lista = cfg.sops_files
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new ErroConfig("[secrets] `sops_config` declarado SEM `sops_files`: sem a lista do que recifrar nao da' para rotacionar (nem para dizer o que mudou)")
  }
  const base = cfg.projeto ?? process.cwd()
  const casados = [...new Set(lista.flatMap((g) => fsm.globSync(g, { cwd: base })).map((f) => path.resolve(base, f)))]
  if (!casados.length) throw new ErroConfig(`[secrets] \`sops_files\` nao casou nenhum arquivo: ${lista.join(', ')}`)
  return casados
}

/** Uma identidade temporaria 0600 com as DUAS chaves (velha + nova) para o `sops updatekeys`. */
function comIdentidades(cfg, arquivoNova, fn) {
  reapResiduo(os.tmpdir())
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX(process.pid)))
  const kf = path.join(dir, 'identidades.key')
  try {
    fs.writeFileSync(kf, `${identidadeDe(cfg.age_key_file)}\n${identidadeDe(arquivoNova)}\n`, { mode: 0o600 })
    protegeArquivo(kf)
    return fn(kf)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Passo 5 — recifra os versionados: o `.sops.yaml` passa a declarar o recipient NOVO e cada
 * arquivo e' re-cifrado com `sops updatekeys`. Sem lista = falha alta (nunca "recifrei o que
 * achei"). A troca no `.sops.yaml` e' a UNICA escrita em arquivo do dono que o rotate faz.
 */
/**
 * O arquivo JA' esta' cifrado para o recipient NOVO (e nao cita mais o velho)? E' o que deixa a
 * retomada do passo 5 barata e segura: um `updatekeys` que abortou no meio do lote nao recifra
 * de novo o que ja' passou — so' o que falta.
 */
function jaRecifrado(a, recVelho, recNovo) {
  let txt
  try {
    txt = fs.readFileSync(a, 'utf8')
  } catch {
    return false
  }
  return txt.includes(recNovo) && !(recVelho && txt.includes(recVelho))
}

function recifra(cfg, recVelho, recNovo, arquivos, env) {
  if (!cfg.sops_config) return []
  const cfgTxt = fs.readFileSync(cfg.sops_config, 'utf8')
  // O manifesto passa a declarar o recipient NOVO ANTES do `updatekeys` (e' dele que o sops
  // le' a receita de cifra) — e o passo 7 confere que nenhum arquivo ficou para tras. Se a
  // troca JA' foi feita (retomada de um updatekeys que abortou no meio), nao se troca de novo.
  if (!cfgTxt.includes(recNovo)) {
    if (!cfgTxt.includes(recVelho)) {
      throw new ErroConfig(`[secrets] o \`.sops.yaml\` (${cfg.sops_config}) nao declara nem o recipient VELHO nem o NOVO — confira antes de recifrar`)
    }
    fs.writeFileSync(cfg.sops_config, cfgTxt.split(recVelho).join(recNovo))
  }
  return comIdentidades(cfg, `${cfg.age_key_file}.rotate`, (kf) => {
    const envSops = { ...env, SOPS_AGE_KEY_FILE: kf }
    for (const a of arquivos.filter((x) => !jaRecifrado(x, recVelho, recNovo))) {
      const u = roda('sops', ['updatekeys', '-y', a], { env: envSops, cwd: path.dirname(cfg.sops_config) })
      if (u.status !== 0) {
        throw new ErroConfig(`[secrets] \`sops updatekeys\` falhou em ${a}: ${(u.stderr || u.error?.message || '').trim()}`)
      }
    }
    return arquivos
  })
}

/**
 * Passo 7 — VERIFICA sem tocar em mais nada: o `check` passa, cada arquivo decifra SO' com a
 * chave NOVA (identidade velha OUT) e nenhum cita o recipient velho. Falha = para com o estado
 * preservado (o proximo `rotate` retoma daqui).
 */
function verificaRotate(cfg, recVelho, arquivos, env) {
  reapResiduo(os.tmpdir())
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX(process.pid)))
  const kf = path.join(dir, 'nova.key')
  try {
    fs.writeFileSync(kf, `${identidadeDe(cfg.age_key_file)}\n`, { mode: 0o600 })
    protegeArquivo(kf)
    for (const a of arquivos) {
      if (fs.readFileSync(a, 'utf8').includes(recVelho)) {
        throw new ErroConfig(`[secrets] ${a} ainda cita o recipient VELHO`)
      }
      const d = roda('sops', ['--decrypt', '--input-type', 'yaml', '--output-type', 'json', a], {
        env: { ...env, SOPS_AGE_KEY_FILE: kf },
      })
      if (d.status !== 0) throw new ErroConfig(`[secrets] ${a} nao decifra SO' com a chave nova — estado preservado para retomar`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const r = check(cfg, { env })
  if (!r.ok) throw new ErroConfig(`[secrets] o check reprovou depois da troca (estado preservado):\n${format(r)}`)
}

/** `key_scope=machine`: a chave e' LOCAL — nao ha' cofre a editar, so' apagar e refazer. */
function rotateMachine(cfg, { env, confirma }) {
  const onde = `chave ${cfg.age_key_file}\ncache ${cfg.cache_file}`
  if (!confirma(`tars secrets rotate (machine): apagar a chave e o cache desta MAQUINA e refazer?\n${onde}\n`)) {
    return { saida: 'tars secrets rotate: cancelado (nada foi tocado)', status: 0 }
  }
  fs.rmSync(cfg.age_key_file, { force: true })
  fs.rmSync(cfg.cache_file, { force: true })
  const r = refresh(cfg, { env, tty: true })
  return {
    saida: `tars secrets rotate (machine): chave e cache refeitos\n${onde}\ntars secrets rotate: ${r.chaves} chave(s) no cache`,
    status: 0,
  }
}

/**
 * `rotate` (escopo project) — oito passos, RETOMAVEIS. O estado em disco guarda o passo que
 * ainda precisa rodar: um erro no meio para ali, e rodar de novo continua DAQUELE passo. A
 * chave velha so' sai no passo 6 (depois de o cofre e os versionados ja' estarem no novo).
 *
 * RETOMAR e' POR PASSO: morrer logo depois da ACAO de qualquer passo (2..7) e' um caminho
 * previsto, e a segunda execucao termina no MESMO estado da primeira. Para isso cada passo se
 * pergunta "a acao ja' aconteceu?" antes de refaze-la — o `.rotate` existente e' reaproveitado
 * (passo 2), o cofre que ja' tem a chave nova nao se reescreve (3), o versionado ja' recifrado
 * e' pulado (5) e o rename so' roda se o `.rotate` ainda estiver la' (6, senao ENOENT e a
 * rotacao ficava presa). `hooks.aposPasso(n)` e' o ponto de morte dos testes.
 */
function rotateProject(cfg, { env, tty, confirma, hooks = {} }) {
  const st = leEstado(cfg)
  const arquivoNova = `${cfg.age_key_file}.rotate`
  const linhas = []
  const passo = (n) => {
    gravaEstado(cfg, { ...st, passo: n })
    st.passo = n + 1
  }
  // O ponto de MORTE dos testes: `hooks.aposPasso(n)` roda depois da ACAO do passo n (e antes do
  // marcador seguinte) — e' o unico jeito de provar que morrer ali nao trava a retomada.
  const apos = (n) => (hooks.aposPasso ? hooks.aposPasso(n) : undefined)
  // 1 PLANO — e' o unico ponto em que o dono VE o que vai mudar antes de mudar.
  if (st.passo <= 1) {
    if (!cfg.age_key_ref) throw new ErroConfig('[secrets] rotate precisa de `age_key_ref` (escopo project)')
    const arquivos = expandeArquivos(cfg)
    const recVelho = fs.existsSync(cfg.age_key_file) ? recipient(cfg.age_key_file) : null
    linhas.push(`tars secrets rotate: ref ${cfg.age_key_ref}`)
    linhas.push(`tars secrets rotate: recipient atual ${recVelho ?? '(sem chave local)'}`)
    if (cfg.sops_config) linhas.push(`tars secrets rotate: recifrar ${arquivos.join(', ')}`)
    if (!confirma(`tars secrets rotate: gerar chave nova e trocar no cofre?\n${linhas.join('\n')}\n`)) {
      fs.rmSync(estadoRotate(cfg), { force: true })
      return { saida: 'tars secrets rotate: cancelado (nada foi tocado)', status: 0 }
    }
    st.recipient_velho = recVelho
    passo(1)
  }
  const arquivos = expandeArquivos(cfg)
  const recNova = () => {
    const r = st.recipient_novo ?? (fs.existsSync(arquivoNova) ? recipient(arquivoNova) : null)
    if (!r) throw new ErroConfig('[secrets] rotate sem a chave NOVA (nem no estado, nem no `.rotate`) — confira o estado antes de retomar')
    return r
  }
  // 2 GERA — a chave nova nasce AO LADO da velha (`.rotate`): a velha so' sai no passo 6. Um
  // `.rotate` que JA' existe e' a chave DESTA rotacao (o passo 3 so' a usa depois do estado
  // dizer 3): reaproveita — gerar outra faria o cofre e os versionados apontarem para uma
  // chave que ninguem tem mais, e a retomada nao teria volta.
  if (st.passo <= 2) {
    passo(2)
    fs.mkdirSync(path.dirname(cfg.age_key_file), { recursive: true, mode: 0o700 })
    if (!fs.existsSync(arquivoNova)) {
      const g = roda('age-keygen', ['-o', arquivoNova])
      if (g.status !== 0) throw new ErroConfig(`[secrets] age-keygen nao gerou a chave nova: ${(g.stderr || g.error?.message || '').trim()}`)
      protegeArquivo(arquivoNova)
    }
    st.recipient_novo = recipient(arquivoNova)
    gravaEstado(cfg, st)
    apos(2)
  }
  // 3 COFRE — a identidade entra pelo TEMPLATE, nunca por argv. Se o cofre JA' tem a chave nova
  // (morreu entre a escrita e o passo 4), nao se escreve de novo; e se ele FICOU com a velha
  // (passo 4 falhou e o `op` recusou a gravacao), e' aqui que ele volta a ficar certo — o passo
  // 4 so' confere, nao grava, e sem esta reescrita a retomada nunca fecharia.
  if (st.passo <= 3) passo(3)
  if (st.passo <= 4) {
    if (!cofreJaTem(cfg, recNova(), env)) editaItemNoCofre(cfg, cfg.age_key_ref, identidadeDe(arquivoNova), env)
    apos(3)
    // 4 CONFERE — o cofre tem de devolver o recipient NOVO; senao para SEM tocar nada local.
    passo(4)
    confereCofre(cfg, recNova(), env)
    apos(4)
  }
  // 5 RECIFRA — versionados + `.sops.yaml`; o que ja' esta' no recipient NOVO e' pulado.
  if (st.passo <= 5) {
    passo(5)
    recifra(cfg, st.recipient_velho ?? recipienteAtual(cfg), recNova(), arquivos, env)
    apos(5)
  }
  // 6 TROCA LOCAL — o rename e' ATOMICO: a chave velha some so' aqui, e a nova ja' e' a do cofre.
  // Sem o `.rotate`, o rename JA' aconteceu (morreu entre ele e o fim do refresh): renomear de
  // novo daria ENOENT e prenderia a rotacao — entao confere que a chave local e' a NOVA e segue.
  if (st.passo <= 6) {
    passo(6)
    if (fs.existsSync(arquivoNova)) {
      fs.renameSync(arquivoNova, cfg.age_key_file)
      protegeArquivo(cfg.age_key_file)
    } else if (recipient(cfg.age_key_file) !== recNova()) {
      throw new ErroConfig("[secrets] o `.rotate` sumiu e a chave local NAO e' a nova — estado inconsistente: confira antes de retomar")
    }
    const r = refresh(cfg, { env, tty })
    linhas.push(`tars secrets rotate: cache regravado (${r.chaves} chave(s))`)
    apos(6)
  }
  // 7 VERIFICA — check ok, cada versionado decifra SO' com a nova, nenhum cita a velha.
  if (st.passo <= 7) {
    passo(7)
    verificaRotate(cfg, st.recipient_velho, arquivos, env)
    apos(7)
  }
  // 8 FIM — o estado e o tmp das identidades saem; fica so' o que o dono commita.
  fs.rmSync(estadoRotate(cfg), { force: true })
  fs.rmSync(arquivoNova, { force: true })
  reapResiduo(os.tmpdir())
  const aCommitar = [cfg.sops_config, ...arquivos].filter(Boolean)
  linhas.push(`tars secrets rotate: pronto (recipient ${st.recipient_novo})`)
  if (aCommitar.length) linhas.push(`tars secrets rotate: commite ${aCommitar.join(', ')}`)
  linhas.push('tars secrets rotate: as outras maquinas pegam no proximo refresh; ate la o check delas acusa recipient desatualizado')
  linhas.push('tars secrets rotate: o historico do item no 1Password guarda o valor velho (esperado)')
  return { saida: linhas.join('\n'), status: 0 }
}

/** O recipient da chave local — usado so' como fallback se o estado perdeu o velho. */
const recipienteAtual = (cfg) => (fs.existsSync(cfg.age_key_file) ? recipient(cfg.age_key_file) : null)

/**
 * `rotate` — so' o DONO roda (a automacao nao tem por que trocar a propria chave). `source`
 * diferente de `owner` RECUSA alto; `owner` ainda passa por `podeAbrirCofre` (ator + TTY).
 */
export function rotate(cfg, { env = process.env, tty = process.stdin.isTTY, confirma = perguntaTty, hooks = {} } = {}) {
  if (cfg.source !== 'owner') {
    throw new ErroConfig("[secrets] rotate e' do dono: `source=automation` nao rotaciona (a automacao consome a chave, nao a troca)")
  }
  podeAbrirCofre(cfg, { env, tty })
  return cfg.key_scope === 'machine' ? rotateMachine(cfg, { env, confirma }) : rotateProject(cfg, { env, tty, confirma, hooks })
}

/**
 * `token set` — troca o token da service account. O token NOVO vem do stdin OCULTO (nunca
 * argv, nunca eco) e so' substitui o antigo depois de `op whoami` aceita-lo SOZINHO (sem
 * sessao do app, biometria off): se nao validar, o antigo continua e o `.novo` some.
 */
export function tokenSet(cfg, { env = process.env, le = leOculto, spawn = spawnOp } = {}) {
  const novo = String(le('tars secrets token set: cole o TOKEN NOVO (nao aparece no terminal): ') ?? '').trim()
  if (!novo) throw new ErroConfig('[secrets] token VAZIO — nada foi trocado')
  registra(novo)
  const alvo = `${cfg.token_file}.novo`
  fs.mkdirSync(path.dirname(cfg.token_file), { recursive: true, mode: 0o700 })
  fs.rmSync(alvo, { force: true })
  fs.writeFileSync(alvo, `${novo}\n`, { mode: 0o600 })
  protegeArquivo(alvo)
  const envNovo = { ...env, OP_SERVICE_ACCOUNT_TOKEN: novo, OP_BIOMETRIC_UNLOCK_ENABLED: 'false' }
  for (const k of Object.keys(envNovo)) if (k.startsWith('OP_SESSION_')) delete envNovo[k]
  delete envNovo.OP_CONNECT_HOST
  delete envNovo.OP_CONNECT_TOKEN
  let ok = false
  try {
    ok = spawn(['whoami'], envNovo).status === 0
  } catch {
    ok = false
  }
  if (!ok) {
    fs.rmSync(alvo, { force: true })
    throw new ErroConfig('[secrets] o token novo NAO validou (`op whoami` recusou) — o antigo continua em uso')
  }
  fs.renameSync(alvo, cfg.token_file)
  protegeArquivo(cfg.token_file)
  return {
    saida:
      'tars secrets token set: token novo em uso nesta maquina; revogue o antigo no 1Password SO depois de rodar isto em todas as maquinas de automacao',
    status: 0,
  }
}

/** Modulo DONO do subcomando: o CLI so' chama; o julgamento fica aqui. */
export function run({ sub, rest = [], cfg, env = process.env, tty = process.stdin.isTTY, confirma, le }) {
  if (sub === 'rotate') return rotate(cfg, { env, tty, confirma })
  if (sub === 'token') {
    const acao = rest[0]
    if (acao !== 'set') throw new ErroConfig(`uso: tars secrets token set (recebi '${acao ?? ''}')`)
    return tokenSet(cfg, { env, le })
  }
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
  // `git-credential` (dev.19): o helper que o `git` chama. A entrada do protocolo vem pelo
  // STDIN — `le` e' injetavel para o teste nao depender do console.
  if (sub === 'git-credential') {
    const verb = rest[0]
    if (verb === 'store' || verb === 'erase') return { saida: '', status: 0 } // no-op: o cache e' a fonte
    if (verb !== 'get') throw new ErroConfig(`uso: tars secrets git-credential <get|store|erase> (recebi '${verb ?? ''}')`)
    const r = respostaCredential(cfg, (le ?? leStdin)())
    return { saida: r.saida, status: 0 }
  }
  throw new ErroConfig(`uso: tars secrets <refresh|exec|check|rotate|token|git-credential> (recebi '${sub ?? ''}')`)
}
