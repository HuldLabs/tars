// Tabela tipo -> emoji (INV-GIT-2, portada do Fabber). Fonte única usada pelos hooks e pelo cliff.
export const TYPES = {
  feat: "✨", fix: "🐛", docs: "📝", style: "💄", refactor: "♻️", perf: "⚡", test: "✅",
  build: "📦", ci: "👷", chore: "🔧", revert: "⏪", wip: "🚧", hotfix: "🚑", security: "🔒",
  deps: "⬆️", i18n: "🌐", init: "🎉", release: "🔖", merge: "🔀",
};
export const EMOJI = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
// <emoji>? <type>(scope)?!?: <descrição>
export const SUBJECT_RE = new RegExp("^(?:(" + Object.values(TYPES).join("|") + ")\\s+)?(" + Object.keys(TYPES).join("|") + ")(\\([a-z0-9_/-]+\\))?!?:\\s+\\S.*$");
export const MAX_SUBJECT = 72;
