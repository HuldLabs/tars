// no-foreign-runtime — o `.ai/` copiado nao pode exigir runtime que o consumidor nao usa.
//
// B1.5 (plano de release do Tars, 14/10): "nada no ecossistema exige runtime de quem nao usa
// (transversal = binario unico)". A fonte e' o ego.md 2.2 (R4 do Endurance: "Runtime e' feature,
// nunca base") e o coleta-eco 5.6. O catalogo fala Node; uma regra/skill que manda `python3
// script.py` faz o consumidor instalar Python para SEGUIR a doutrina — o defeito exato.
//
// Julga o STAGED (git diff --cached) e so' o que o sync COPIA para o consumidor. O motor
// (tools/, bin/, .githooks/) fica de fora: o Tars e' do dono e roda o que precisar. As pastas de
// metodo do catalogo (docs/) tambem: o que o sync joga fora nao chega em quem consome.
//
// O que PASSAR pela regra nao pode ser silencio:
//   - `runtimes = ["python"]` em .ai/tars.toml e' a PROVA de que quem copia declarou o runtime;
//   - a linha com `tars:runtime-ok — <motivo>` e' isencao NOMEADA;
//   - o bloco cercado por ```tars:nao-copia``` e' receita que o leitor adapta, nao comando que roda.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const project = process.env.TARS_PROJECT ?? process.cwd()
const params = JSON.parse(process.env.TARS_GATE_PARAMS || '{}')
const allow = Array.isArray(params.allow) ? params.allow : []

// --- o que o sync COPIA para o consumidor ------------------------------------
// O criterio e' a pasta que existe no consumidor depois do sync; `.ai/base` e' o proprio
// destino. `.ai/tars.toml` fica de fora: e' o manifesto do PROJETO, ele DECLARA o runtime.
const COPIADO = ['.ai/rules/', '.ai/skills/', '.ai/governance/', '.ai/base/', 'templates/']

// --- a linguagem do catalogo: Node. O resto e' estrangeiro. -------------------
// Cada padrao exige fronteira de comando para nao pegar prosa, identificador ou URL
// (o `nosso.py` do exemplo, o `python` dentro de `cpython`, o `.php` do nome de arquivo).
const ESTRANGEIRO = [
  ['python', /\bpython(3(\.\d+)?)?\b\s+(?!do\b|de\b|no\b|na\b|em\b|da\b|para\b|e\b|ou\b|como\b|aqui\b|puro\b|nosso\b|instalad)[-\w./]/i],
  ['python', /\bpy\s+-3\b/i],
  ['python', /\b(uv\s+run|pip3?|poetry|pdm|pipenv|pytest)\b\s+[-\w./]/i],
  ['ruby', /\b(ruby|gem|bundle\s+exec)\b\s+[-\w./]/i],
  ['php', /\b(php|composer)\b\s+[-\w./]/i],
  ['perl', /\bperl\b\s+[-\w./]/i],
  ['powershell', /\b(pwsh|powershell)(\.exe)?\b\s+[-\w./]/i],
  ['R', /\bRscript\b\s+/],
]

// O escape NOMEADO: a linha diz POR QUE o runtime estrangeiro fica. Sem o motivo o gate
// reprova — "e' excecao" nao e' motivo, e o gate cobra o mesmo que cobra do `return ok`.
const ESCAPE = /\btars:runtime-ok\b\s*[—:-]?\s*\S/i

// Receita que o leitor adapta (o bloco `tars:nao-copia`), nao comando que o Tars roda.
const BLOCO_ISENTO = /^\s*(```|~~~).*tars:nao-copia/i

/** Linhas citadas como nao-executaveis: bloco isento e a linha do escape. */
function isento(linhas) {
  const isentas = new Set()
  let dentro = false
  for (let i = 0; i < linhas.length; i++) {
    if (BLOCO_ISENTO.test(linhas[i])) { dentro = !dentro; isentas.add(i); continue }
    if (dentro) { isentas.add(i); continue }
    if (ESCAPE.test(linhas[i])) isentas.add(i)
  }
  return isentas
}

/** Julga UM texto: "arquivo:linha — runtime" por invocacao estrangeira. */
export function julgaTexto(arquivo, texto) {
  const linhas = String(texto).split('\n')
  const isentas = isento(linhas)
  const achados = []
  for (let i = 0; i < linhas.length; i++) {
    if (isentas.has(i)) continue
    for (const [nome, padrao] of ESTRANGEIRO) {
      if (padrao.test(linhas[i])) { achados.push(arquivo + ':' + (i + 1) + ' — ' + nome); break }
    }
  }
  return achados
}

/** Os runtimes que o consumidor DECLAROU (a prova de que ele escolheu carregar). */
export function runtimesDeclarados(textoToml) {
  const declarados = []
  for (const m of String(textoToml).matchAll(/^\s*runtimes\s*=\s*\[([^\]]*)\]/gim)) {
    for (const item of m[1].split(',')) {
      const nome = item.trim().replace(/^["']|["']$/g, '').toLowerCase()
      if (nome) declarados.push(nome)
    }
  }
  return declarados
}

const mensagem = (achados) => [
  'NO-FOREIGN-RUNTIME: o `.ai/` copiado exige runtime que o consumidor nao usa (B1.5).',
  '',
  ...achados.map((a) => '  ' + a),
  '',
  '  O catalogo fala Node. Se o runtime for mesmo necessario, DECLARE-O em',
  '  `.ai/tars.toml` (`runtimes = ["python"]`) — o manifesto e a prova — ou',
  '  marque a linha com `tars:runtime-ok — <motivo>`. Ver',
  '  .ai/gates/no-foreign-runtime/GATE.md.',
  '',
].join('\n')

// --- CLI (pre-commit) -------------------------------------------------------
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'], { cwd: project, encoding: 'utf8' })
  if (r.status !== 0 || typeof r.stdout !== 'string') {
    console.error('gate no-foreign-runtime: sem git — NAO julguei o staged.')
    process.exit(1)
  }
  const arquivos = r.stdout
    .split('\0')
    .filter(Boolean)
    .filter((f) => COPIADO.some((p) => f.startsWith(p)) && !allow.some((x) => f.includes(x)))

  let declarados = []
  const manifesto = path.join(project, '.ai/tars.toml')
  if (existsSync(manifesto)) declarados = runtimesDeclarados(readFileSync(manifesto, 'utf8'))

  const achados = []
  for (const f of arquivos) {
    let texto
    try { texto = readFileSync(path.join(project, f), 'utf8') } catch { continue } // sumiu do disco: nada a julgar
    for (const a of julgaTexto(f, texto)) {
      if (declarados.some((d) => /\bpython/.test(d) && a.endsWith('— python'))) continue
      if (declarados.some((d) => /\b(ruby|php|perl|powershell|rscript)/.test(d) && a.toLowerCase().endsWith('— ' + d))) continue
      achados.push(a)
    }
  }
  if (achados.length) { console.error('\n' + mensagem(achados)); process.exit(1) }
  process.exit(0)
}
