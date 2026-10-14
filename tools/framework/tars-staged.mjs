// O que o COMMIT julga: so' o que esta' no indice, so' o que o git rastreia.
//
// Porte da IDEIA da SEG-236/SEG-245 do segtools (tools/framework/git-index.mjs): o pre-commit
// julga o INDICE (o que o commit leva), nunca a arvore de trabalho. Num checkout compartilhado
// por varios workers, o arquivo rastreado e sujo de OUTRO worker entrava na conta de quem nunca
// o tocou e derrubava o commit alheio. As duas funcoes que fecham isso moram aqui pelo mesmo
// motivo: "o que o commit leva" e' uma pergunta sobre o indice, nao sobre cada gate.
//
// As duas regras do dono (14/10):
//  1. o gate julga `git diff --cached --name-only` (o staged), nunca a arvore;
//  2. e so' o que o git RASTREIA (`git ls-files`) — arquivo em `.cache/` ou gitignored nao e'
//     superfcie de gate nenhum, mesmo que apareca no disco.
//
// ERRA PARA O LADO QUE RODA (R4, falha alta): sem git, `stagedPaths` devolve `null` e quem
// chama decide — em `touchesStaged` isso significa RODAR, nunca pular. Um gate pulado por nao
// saber o que o commit leva seria o green falso.
//
// Pura na leitura: nunca escreve no repo.
import { spawnSync } from 'node:child_process'

/** Os caminhos que o COMMIT leva, relativos a raiz do projeto (`git diff --cached --name-only`).
 *
 *  SEM `--diff-filter`: aqui o DELETADO conta. A pergunta e' "o commit toca esta familia?", e
 *  APAGAR a fonte de um artefato gerado sem regerar o artefato e' justamente o drift a barrar.
 *  Gates que precisam LER o blob usam `--diff-filter=ACM` por conta propria — la' o deletado
 *  nao tem conteudo. Sao perguntas diferentes; nao unificar.
 *
 *  `null` = nao e' repo git (ou git ausente). Pura na leitura. */
export function stagedPaths(cwd) {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd, encoding: 'utf8' })
  if (r.status !== 0 || typeof r.stdout !== 'string') return null
  return r.stdout.split('\0').filter(Boolean)
}

/** O commit toca alguma das FAMILIAS do gate? E' o portao de RELEVANCIA (SEG-245).
 *
 *  `patterns` aceita tres formas, porque cada gate descreve a familia com a regua que ja' tem:
 *   - string: PREFIXO de diretorio/arquivo (`"tools/framework/"`);
 *   - RegExp: casamento no caminho relativo;
 *   - funcao `(rel) => boolean`: a propria regua da varredura (o gate passa a mesma funcao que
 *     decide o conjunto que ele varre — duas reguas divergiriam com o tempo).
 *
 *  Sem isso, o rascunho de OUTRO worker na arvore derrubava o commit de quem nunca o tocou. */
export function touchesStaged(staged, patterns) {
  if (staged === null) return true
  const list = Array.isArray(patterns) ? patterns : [patterns]
  return staged.some((rel) =>
    list.some((p) => (p instanceof RegExp ? p.test(rel) : typeof p === 'function' ? p(rel) : rel.startsWith(p))),
  )
}

/** O que o git RASTREIA, por caminho relativo (`git ls-files`). `null` = sem git.
 *
 *  Superfcie de gate nenhum inclui o que o git nao rastreia: `.cache/`, `node_modules/` e
 *  qualquer gitignored existem no disco do worker e nao entram em commit — julga-los seria
 *  reprovar por algo que o repo nunca vai ver (e ainda pagaria a leitura). */
export function trackedPaths(cwd) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' })
  if (r.status !== 0 || typeof r.stdout !== 'string') return null
  return new Set(r.stdout.split('\0').filter(Boolean))
}

/** O caminho `rel` esta' rastreado? Sem git (`null`), devolve `true`: nao julgar o que nao se
 *  pode saber — o mesmo lado seguro do `touchesStaged`. */
export function isTracked(tracked, rel) {
  return tracked === null || tracked.has(rel)
}
