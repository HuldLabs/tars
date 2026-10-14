// Materializa o CATALOGO embutido e devolve sua raiz — o `TARS_HOME` do binario sozinho.
//
// PORQUE (fatia 2a, item 2): o binario publicado (asset / imagem `FROM scratch`) roda num
// ambiente SEM checkout do Tars e SEM `TARS_HOME`. `tars-embedded.mjs` (gerado em build) traz
// versao + arquivos; aqui eles sao escritos num diretorio de CACHE (uma vez por versao) e a
// raiz resultante vira o `TARS_HOME` — assim `sync`, `doctor` e `hooks` acham o catalogo.
//
// IDEMPOTENTE (mantra): a pasta leva a versao no nome; se a sentinela existe, nao reescreve.
// O cache e' do USUARIO (`~/.cache/tars/...`), nunca do repo — o binario nao pode escrever
// ao lado de si (imagem `FROM scratch` e' somente leitura).
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ARQUIVOS, VERSION } from './tars-embedded.mjs'

/** Raiz do cache de catalogos embutidos. `TARS_EMBED_CACHE` permite isolamento em teste. */
export function raizCache(env = process.env) {
  const base = env.TARS_EMBED_CACHE ?? join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'tars', 'catalog')
  return join(base, VERSION)
}

/**
 * Escreve o catalogo embutido no cache (se ainda nao estiver la') e devolve a raiz.
 * Devolve `null` quando o modulo gerado esta vazio (build sem `task build:embed`).
 */
export function materializar({ env = process.env } = {}) {
  const nomes = Object.keys(ARQUIVOS)
  if (!nomes.length) return null
  const raiz = raizCache(env)
  const sentinela = join(raiz, '.ai', 'VERSION')
  if (existsSync(sentinela)) return raiz
  // Escrita ATOMICA por arquivo: o cache so' e' considerado pronto quando a sentinela
  // (`.ai/VERSION`, o marcador de catalogo) existe. Duas execucoes concorrentes escrevem o
  // mesmo conteudo — idempotente por construcao.
  for (const [rel, conteudo] of Object.entries(ARQUIVOS)) {
    const dest = join(raiz, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, conteudo)
    // Guardas e hooks do git precisam ser executaveis (o `cp` do sync preserva o modo).
    if (/\.(sh|mjs)$/.test(rel) || rel.includes('/guards/') || rel.startsWith('tools/')) {
      try { chmodSync(dest, 0o755) } catch { /* melhor esforco: FS sem modo */ }
    }
  }
  return raiz
}
