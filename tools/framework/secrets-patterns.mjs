// Lista UNICA de padroes de SEGREDO em texto puro, compartilhada por:
//   - `.githooks/pre-commit` (guarda de CONTEUDO, bloco 2b) — julga o diff staged;
//   - `tools/framework/ai-memory.mjs` (add/--doctor) — recusa segredo na memoria.
// O hook e' shell e nao importa JS: ele le este arquivo por `node --print` e monta
// o `grep -E`. Assim a lista mora so' aqui (antes estava duplicada no hook).
// Origem: bloco "guarda de CONTEUDO" do .githooks/pre-commit + familia do
// .ai/guards/block-secret-dump.sh. Porte da IDEIA (nao do motor) do Fabber.
export const SECRET_PATTERNS = [
  { id: "pem-private-key", label: "chave privada (PEM)", re: "-----BEGIN [A-Z ]*PRIVATE KEY-----" },
  { id: "aws-access-key-id", label: "AWS access key id", re: "AKIA[0-9A-Z]{16}" },
  { id: "aws-secret", label: "AWS secret access key", re: "(aws_secret_access_key|AWS_SECRET_ACCESS_KEY)[[:space:]]*[:=]" },
  { id: "github-token", label: "GitHub token", re: "(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}" },
  { id: "slack-token", label: "Slack token", re: "xox[abprs]-[A-Za-z0-9-]{10,}" },
  { id: "gitlab-pat", label: "GitLab PAT", re: "glpat-[A-Za-z0-9_-]{20,}" },
  { id: "google-api-key", label: "Google API key", re: "AIza[0-9A-Za-z_-]{35}" },
  { id: "age-secret-key", label: "chave age (AGE-SECRET-KEY)", re: "AGE-SECRET-KEY-[0-9A-Z]{10,}" },
  // Atribuicao generica: so' conta com valor literal (nao op://, ${VAR}, placeholder).
  {
    id: "generic-literal",
    label: "atribuicao generica de segredo com valor literal",
    re: "(secret|passwd|password|api[_-]?key|access[_-]?token|private[_-]?key)[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9/+_-]{16,}",
    ignoreRe: "op://|\\$\\{?[A-Za-z_]|example|placeholder|<[a-z]+|xxx+|redacted",
  },
];

/** Compila os padroes para o formato grep ERE (usado pelo hook e pelo --doctor). */
export function secretRegexes() {
  return SECRET_PATTERNS.map((p) => ({ id: p.id, label: p.label, re: new RegExp(p.re, "i") }));
}

/**
 * Procura segredo em QUALQUER linha do texto. Retorna a lista de rotulos casados
 * (vazia = limpo). O `generic` respeita o `ignoreRe` (sem valor literal = nao e' segredo).
 */
export function findSecrets(text) {
  const hits = [];
  for (const line of String(text).split(/\r?\n/)) {
    for (const p of SECRET_PATTERNS) {
      const re = new RegExp(p.re, "i");
      if (!re.test(line)) continue;
      if (p.ignoreRe && new RegExp(p.ignoreRe, "i").test(line)) continue;
      hits.push(p.label);
    }
  }
  return [...new Set(hits)];
}
