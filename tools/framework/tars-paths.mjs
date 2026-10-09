// Caminho de item do catalogo — SEMPRE com `/`, em qualquer sistema (R3: um lugar so').
//
// PORQUE EXISTE (Incident: chave de lock divergente entre Linux e Windows): o `destOf` montava
// a chave do `.ai/tars.lock` com `path.join`, que no win32 separa com `\`. O consumidor Windows
// gravava `gates\\commit-msg` no lock e o Linux (ou o CI, ou o repo compartilhado) comparava com
// `gates/commit-msg`: o `tars sync --check` acusava DRIFT FALSO num projeto intocado, e a
// familia D (poda de saida orfa, que casa a chave do lock contra `skills/<nome>`) nao
// reconhecia skill nenhuma. Caminho de catalogo e' identificador, nao caminho de disco: ele
// nao pode depender de quem o escreveu.
//
// O que NAO muda: o caminho de DISCO (join de `project`, `tars`, `.ai`) continua com o
// separador da plataforma — quem abre arquivo usa `node:path.join`. So' o identificador
// gravado/comparado (lock, drift, poda, chaves de dedupe) passa por aqui.

/**
 * Normaliza UM caminho para separador `/`. Idempotente: o que ja' e' `/` volta igual, e
 * `a//b`/`a/./b` nao aparecem porque a entrada vem de `relative`/`join` do node.
 */
export const posix = (p) => String(p).replace(/\\/g, '/')

/**
 * Junta partes com `/` — a versao de `node:path.join` que NAO depende da plataforma. E' o
 * que `destOf`/`sourceOf` usam para montar a chave: no win32 o `join` do node devolveria
 * `gates\commit-msg` e o lock divergiria do Linux.
 */
export const joinPosix = (...parts) => posix(parts.filter((p) => p !== '' && p != null).join('/'))
