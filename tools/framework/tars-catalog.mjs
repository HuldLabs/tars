// `tars catalog`: o catalogo disponivel e, num repo, o que ainda nao foi AVALIADO. So' le.
//
// O `adopt` diz se a instalacao esta' de pe; o `sync` so' traz o declarado. Ninguem respondia
// "o que do catalogo serve a este repo?", e item novo de versao nova passava sem ser visto.
// Cada item fica declarado, recusado (com o porque, em `.ai/catalogo-decisoes.json`) ou pendente.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const AREAS = [
  { area: 'gates', ficha: (n) => `${n}/GATE.md`, nome: (f) => (/\.(mjs|md)$/.test(f) ? null : f) },
  { area: 'skills', ficha: (n) => `${n}/SKILL.md`, nome: (f) => f },
  { area: 'guards', ficha: () => null, nome: (f) => (/^(test-|lib-)/.test(f) || !f.endsWith('.sh') ? null : f.replace(/\.sh$/, '')) },
  { area: 'governance', ficha: (n) => `${n}.md`, nome: (f) => (f.endsWith('.md') ? f.replace(/\.md$/, '') : null) },
]

/** A linha que descreve o item: `description:` do frontmatter, `O que cobra` ou o 1o texto. */
export function resumo(txt = '') {
  const d = /^description:\s*(.+)$/m.exec(txt)
  const c = /\*\*O que cobra\*\*\s*[—-]\s*(.+)/.exec(txt)
  const t = txt.split(/\r?\n/).find((l) => l.trim() && !/^(---|#|root:)/.test(l))
  return (d?.[1] ?? c?.[1] ?? t ?? '').replace(/^["']|["']$/g, '').slice(0, 160)
}

export function listar(tars) {
  return AREAS.flatMap(({ area, ficha, nome }) => {
    const dir = join(tars, '.ai', area)
    if (!existsSync(dir)) return []
    return readdirSync(dir).map(nome).filter(Boolean).sort().map((item) => {
      const f = ficha(item) && join(dir, ficha(item))
      return { area, item, resumo: f && existsSync(f) ? resumo(readFileSync(f, 'utf8')) : '' }
    })
  })
}

/** Junta catalogo, manifesto e decisoes. Declarado em qualquer hook de `[gates]` conta. */
export function avaliar(itens, manifest = {}, decisoes = {}) {
  // `agent_gates` tambem e' adocao: o sync copia e liga o gate (Endurance, 01/11).
  const gates = [...Object.values(manifest.gates ?? {}).flat(), ...(manifest.agentGates ?? [])]
  const declarados = (area) => (area === 'gates' ? gates : (manifest[area] ?? []))
  return itens.map((i) => {
    const d = decisoes[`${i.area}/${i.item}`]
    const estado = declarados(i.area).some((x) => String(x).replace(/\.sh$/, '') === i.item) ? 'adotado' : d ? 'recusado' : 'pendente'
    return { ...i, estado, porque: d?.porque ?? null }
  })
}

export function markdown(itens) {
  const linhas = ['# Catálogo do Tars', '', 'Gerado por `tars catalog --md`; não edite à mão.', '']
  for (const { area } of AREAS) {
    linhas.push(`## ${area}`, '', '| Item | O que é |', '|---|---|')
    for (const i of itens.filter((x) => x.area === area)) linhas.push(`| \`${i.item}\` | ${i.resumo.replace(/\|/g, '\\|')} |`)
    linhas.push('')
  }
  return linhas.join('\n')
}

export function lerDecisoes(project) {
  const f = join(project, '.ai', 'catalogo-decisoes.json')
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
}
