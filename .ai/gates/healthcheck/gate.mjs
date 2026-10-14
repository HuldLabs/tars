// healthcheck — `--version` NAO e' healthcheck: prova que o binario responde, nao que o
// servico esta' de pe. Um crash-loop passa nesse teste (B6.1, plano de 14/10).
//
// A fonte e' o achado 12 da coleta do homelab (14/10): o healthcheck da receita de
// telemetria era `openobserve --version` — o container reiniciava em LACO e o compose
// o declarava SAUDAVEL, porque o binario respondia antes de morrer. O `depends_on:
// condition: service_healthy` liberava o proximo servico contra um servico que nao
// estava la'. A prova certa e' bater na PORTA: `GET /healthz` de dentro do container.
//
// O gate julga a FORMA na declaracao de saude de arquivos de operacao (compose, ficha,
// receita, script de post-apply): o `test:` / `healthcheck:` / `HEALTHCHECK` / comando de
// post-apply que SO' pergunta a versao REPROVA. Julgamento por token do COMANDO (nao por
// regex solta de texto): `--version` dentro de comentario, string de log ou nome de campo
// nao conta — e o que o parser nao entender e' DITO, nunca passa calado.
//
// Parametros (opcionais, no `[gates.params.healthcheck]` do .ai/tars.toml):
//   allow = lista de trechos de caminho isentos (ex.: ["docs/", "receitas/exemplo/"])

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')
const allow = Array.isArray(params.allow) ? params.allow : []

// O que declarar saude: o nome do campo em yaml/toml (healthcheck, test, HEALTHCHECK) e o
// passo de post-apply (assert_health, aguarda_saudavel, wait_healthy).
const DECLARA_SAUDE = /\b(healthcheck|health_check|HEALTHCHECK|healthz|saude|saudavel|healthy|post[_-]?apply)\b/i
// As formas que NAO provam saude: perguntar a versao ou a propria existencia do binario.
const SO_VERSION = /(^|[\s;&|`$("'])(--version|-V|--help|-h)([\s;&|`$)"']|$)/

/** Os comandos de um texto, um por linha (comentario de yaml # sai). */
function comandos(texto) {
  return texto
    .split('\n')
    .map((l, i) => ({ linha: i + 1, texto: l.replace(/#.*$/, '').trim() }))
    .filter((l) => l.texto)
}

/**
 * Julga UM arquivo: "arquivo:linha — motivo" por declaracao de saude que so' olha a
 * versao. Lista vazia = o arquivo passa; null = NAO julgado (o chamador grita).
 */
export function julgaArquivo(arquivo, texto) {
  const achados = []
  const linhas = texto.split('\n')
  let declarando = null
  for (const { linha, texto: corpo } of comandos(texto)) {
    const abre = corpo.match(DECLARA_SAUDE)
    if (abre) declarando = linha
    // Dentro de um bloco de saude, ou na propria linha que o abre: so' --version e' achado.
    if (declarando === null) continue
    if (SO_VERSION.test(corpo) && !/healthz|\/health|\/livez|\/readyz|curl|wget|nc |socket|tcp/i.test(corpo)) {
      achados.push(arquivo + ':' + linha + ' — healthcheck que so pergunta a versao (--version); o crash-loop passa')
    }
    // O bloco termina quando a indentacao volta ao nivel do dono do campo.
    const dono = linhas[declarando - 1].match(/^\s*/)[0].length
    const atual = linhas[linha - 1].match(/^\s*/)[0].length
    if (linha !== declarando && atual <= dono) declarando = null
  }
  return achados
}

/**
 * Julga um projeto de verdade: todo arquivo de operacao sob a raiz, com a mesma
 * declaracao de saude. Ignora o que nao e' arquivo de operacao.
 */
export function julgaProjeto(raiz) {
  const r = spawnSync('git', ['-C', raiz, 'ls-files', '-z'], { encoding: 'utf8' })
  if (r.status !== 0 || typeof r.stdout !== 'string') return null
  const arquivos = r.stdout.split('\0').filter(Boolean)
  const OPERACAO = /(^|\/)(compose|docker-compose|.*\.compose|.*health.*)[^/]*[.](ya?ml|toml|py|mjs|cjs|sh)$/i
  const achados = []
  for (const f of arquivos) {
    if (!OPERACAO.test(f) || allow.some((x) => f.includes(x))) continue
    let texto
    try { texto = readFileSync(raiz + '/' + f, 'utf8') } catch { continue }
    achados.push(...julgaArquivo(f, texto))
  }
  return achados
}

const mensagem = (achados) => [
  'HEALTHCHECK: `--version` NAO prova saude (B6.1).',
  '',
  ...achados.map((a) => '  ' + a),
  '',
  '  Passe a bater na porta: `GET /healthz` de DENTRO do container',
  '  (ex.: `test: ["CMD", "curl", "-fsS", "http://127.0.0.1:5080/healthz"]`),',
  '  e faca o post-apply ASSERTAR o mesmo endpoint. Ver .ai/gates/healthcheck/GATE.md.',
  '',
].join('\n')

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const raiz = project
  const staged = spawnSync('git', ['-C', raiz, 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'], { encoding: 'utf8' })
  const alvo = staged.status === 0 && staged.stdout ? staged.stdout.split('\0').filter(Boolean)
    : (spawnSync('git', ['-C', raiz, 'ls-files', '-z'], { encoding: 'utf8' }).stdout || '').split('\0').filter(Boolean)
  if (!alvo.length) {
    console.error('gate healthcheck: git nao respondeu — NAO julguei.')
    process.exit(1)
  }
  const achados = []
  for (const f of alvo) {
    if (allow.some((x) => f.includes(x))) continue
    if (!/\.(ya?ml|toml|py|mjs|cjs|sh)$/i.test(f)) continue
    let texto
    try { texto = readFileSync(raiz + '/' + f, 'utf8') } catch { continue }
    const julgado = julgaArquivo(f, texto)
    if (julgado === null) { console.error('gate healthcheck: ' + f + ' — nao julgado.'); continue }
    achados.push(...julgado)
  }
  if (achados.length) { console.error('\n' + mensagem(achados)); process.exit(1) }
  process.exit(0)
}
