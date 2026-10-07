#!/usr/bin/env python3
"""Renomeacao em massa com SIMULACAO obrigatoria — `AGENTS.md` §5.

A ferramenta existe por causa de dois estragos reais no mesmo dia: o `ebf85db3` trocou
`e2e@segtools.local` por `e2e@sofon.local` (a troca pegou a PALAVRA SOLTA, nao o token
pedido) e editou o comentario de uma migration ja aplicada; o `7e09c38` corrompeu 32 hashes
do lockfile pela mesma via. O modo de falha e' sempre o mesmo: um `sed -i`/substituicao
global passando por cima de arquivo de lock, dado de identidade e migration versionada.

Aqui o padrao e' um TOKEN EXATO — por padrao literal (`re.escape`), nao expressao regular
solta — e a simulacao e' o caminho normal: sem `--apply` nada e' gravado. Com `--apply`, a
gravacao so acontece se a MESMA execucao nao achar (a) token fora do padrao — o nucleo do
token aparecendo numa forma diferente da pedida, que e' a "palavra solta" do `ebf85db3` — e
(b) arquivo-alvo sujo na arvore (`git status --porcelain`), porque sobrescrever o que outro
worker ainda esta editando perde o que ele escreveu.

Exclusoes embutidas (nunca lidas como alvo, nem para contar):
    caminho  `*.lock`, `bun.lock`, `package-lock.json`, `*.sops`, `.copier-answers.yml`,
             `**/migrations/**` (versionadas), `HANDOFF*.md`, `DELIVERED.md`, e os diretorios
             que git nao rastreia (`.git`, `node_modules`, `.cache`, `.next`, ...);
    doc      material vendored/historico de terceiro: `.agents/skills/**` (a skill do shadcn e'
             copia fiel, com `@/components/ui` dentro de proposito) e o snapshot de referencia
             `docs/reference/fabber-ui/**` + `docs/REFERENCE-MANIFEST.md`;
    linha    `"integrity":` / `"hash":` (valores de hash de lockfile);
    trecho   identidade (`*@*.local` — e-mail/handle), inclusive contra a "palavra solta".

Uso:
    python3 tools/framework/rename.py '"@segtools/' '"@sofon/'            so' SIMULA e lista
    python3 tools/framework/rename.py '"@segtools/' '"@sofon/' --apply    simula e grava
    python3 tools/framework/rename.py --regex '^\\s*@segtools/' 'X' --apply
    ... --root DIR      varre outra raiz (teste; precisa ser repo git)
    ... --allow-loose   libera token sem fronteira (palavra solta) no `--apply`

Saida: por token casado, a contagem, e os arquivos. Codigo de saida 1 = recusa (nada gravado).
"""
from __future__ import annotations

import argparse
import dataclasses
import pathlib
import re
import subprocess
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

# --- Exclusoes embutidas (AGENTS.md §5) ------------------------------------------------------
# Nome exato do arquivo: lock/hash/historico que a substituicao global ja estragou uma vez.
EXCLUDED_NAMES = {
    "bun.lock": "lockfile de dependencias",
    "package-lock.json": "lockfile de dependencias",
    ".copier-answers.yml": "respostas do scaffolding (hash de versao)",
    "DELIVERED.md": "historico de entrega",
}
EXCLUDED_SUFFIXES = {
    ".lock": "lockfile de dependencias",
    ".sops": "segredo cifrado (sops+age)",
}
# Diretorios que o git nao rastreia: alem de ruido, `node_modules` traria lockfiles alheios.
EXCLUDED_DIRS = {".git", "node_modules", ".cache", ".next", ".venv", "dist", "build", "coverage"}
# `**/migrations/**`: migration aplicada e' imutavel — o `ebf85db3` editou o comentario da 0050.
EXCLUDED_DIR_PARTS = {"migrations"}
# Doc/vendored (AGENTS.md §5): a skill do shadcn e' copia fiel de terceiro e o snapshot do Fabber
# e' referencia de outro projeto — o `@/components/ui` sobrevive neles de proposito. Foi por esses
# arquivos que o `--apply` da #SEG-722 recusou (o nucleo do token la' aparece fora da forma pedida).
EXCLUDED_PATH_PREFIXES = {
    ".agents/skills/": "skill vendored (material de terceiro)",
    "docs/reference/fabber-ui/": "snapshot de referencia do Fabber",
}
EXCLUDED_PATH_EXACT = {
    "docs/REFERENCE-MANIFEST.md": "manifesto de referencia (historico)",
}
# Valor de hash dentro de arquivo: a linha inteira sai de escopo (o `7e09c38` mexeu em `integrity`).
HASH_LINE = re.compile(r'"(?:integrity|hash)"\s*:')
# Identidade: e-mail/handle. O trecho casado aqui nunca e' alvo, e o proprio nucleo do token
# dentro dele nao conta como variante (senao `"@segtools/` recusaria por causa do e-mail).
IDENTITY = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.local\b")
# Fronteira do token: o que o usuario poe de cada lado para dizer "e' ESTE token, nao a palavra".
BOUNDARY_CHARS = "\"'`/\\()[]{}<>,;:=| \t"
# `--apply` para quando o nucleo do token aparece fora da forma pedida (a palavra solta).
MAX_VARIANTS_PRINTED = 20


@dataclasses.dataclass
class FilePlan:
    """Um arquivo com ocorrencia: o texto lido e o texto que a gravacao escreveria."""

    rel: str
    path: pathlib.Path
    text: str
    new_text: str
    count: int


@dataclasses.dataclass
class Scan:
    """Resultado da varredura — a unica fonte da gravacao (simulacao e apply na mesma execucao)."""

    files: list[FilePlan]
    tokens: Counter
    variants: list[tuple[str, int, str]]
    scanned: int
    excluded: Counter
    loose_token: bool


def excluded_path(rel: str) -> str | None:
    """Motivo da exclusao por CAMINHO, ou `None` se o arquivo e' alvo legitimo."""
    for prefix, reason in EXCLUDED_PATH_PREFIXES.items():
        if rel.startswith(prefix):
            return reason
    if rel in EXCLUDED_PATH_EXACT:
        return EXCLUDED_PATH_EXACT[rel]
    parts = rel.split("/")
    name = parts[-1]
    if name in EXCLUDED_NAMES:
        return EXCLUDED_NAMES[name]
    for suffix, reason in EXCLUDED_SUFFIXES.items():
        if name.endswith(suffix):
            return reason
    if name.startswith("HANDOFF") and name.endswith(".md"):
        return "handoff (historico)"
    for part in parts[:-1]:
        if part in EXCLUDED_DIR_PARTS:
            return "migration versionada"
        if part in EXCLUDED_DIRS:
            return "diretorio fora do git"
    return None


def overlaps(span: tuple[int, int], others: list[tuple[int, int]]) -> bool:
    """Os dois intervalos se cruzam? (usado contra os trechos de identidade)."""
    return any(span[0] < end and start < span[1] for start, end in others)


def token_core(token: str) -> str:
    """O nucleo do token: as fronteiras (aspas, barra, espaco) fora.

    `"@segtools/` -> `@segtools` — exatamente a forma solta que o `ebf85db3` trocou por engano.
    Token sem fronteira nenhuma (`segtools`) devolve ele mesmo, e o `--apply` recusa.
    """
    return token.strip(BOUNDARY_CHARS)


def tracked_files(root: pathlib.Path) -> list[str]:
    """Os arquivos rastreados pelo git — a lista de candidatos (e' ela que o pre-commit ve')."""
    done = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    return [p for p in done.stdout.decode("utf-8", "surrogateescape").split("\0") if p]


def read_text(path: pathlib.Path) -> str | None:
    """Texto do arquivo, ou `None` se for binario/ilegivel (nada a renomear em binario)."""
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if b"\0" in raw:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def scan(
    root: pathlib.Path,
    pattern: re.Pattern[str],
    replacement: str,
    regex: bool,
    literal: str | None = None,
) -> Scan:
    """Varre os arquivos rastreados e monta o plano. NAO grava nada — nem um byte.

    `literal` e' o token CRU (o texto que o operador digitou), nao o `pattern.pattern`: no modo
    literal o padrao ja' vem escapado (`re.escape`), e comparar o texto com `\\.\\./ui/` nao acha
    nada — foi o "0 ocorrencias" fantasma que a #SEG-722 encontrou (`--regex` achava 26).
    """
    files: list[FilePlan] = []
    tokens: Counter = Counter()
    variants: list[tuple[str, int, str]] = []
    excluded: Counter = Counter()
    scanned = 0
    # O token cru governa as duas leituras que o `pattern.pattern` trai no modo literal: o nucleo
    # (palavra solta) e a busca barata por arquivo.
    raw = pattern.pattern if regex else (literal if literal is not None else pattern.pattern)
    core = token_core(raw)
    loose = core == raw
    # Busca barata por arquivo antes do trabalho por linha: a maioria dos 4 mil arquivos nao tem
    # nada a ver com o token, e o `finditer` linha a linha (mais a varredura de identidade em cada
    # linha) levava ~2 min no repo inteiro. `in`/`search` sobre o texto todo e' o corte grosso.
    literal = None if regex else raw

    for rel in tracked_files(root):
        reason = excluded_path(rel)
        if reason:
            excluded[reason] += 1
            continue
        path = root / rel
        text = read_text(path)
        if text is None:
            continue
        scanned += 1
        has_token = pattern.search(text) is not None if regex else literal in text
        has_core = (not loose) and core in text
        if not has_token and not has_core:
            continue
        out: list[str] = []
        hits_here = 0
        for lineno, line in enumerate(text.splitlines(keepends=True), 1):
            if HASH_LINE.search(line):
                out.append(line)
                continue
            identity = [m.span() for m in IDENTITY.finditer(line)]
            hits = [m for m in pattern.finditer(line) if not overlaps(m.span(), identity)]
            if core and not loose:
                # Nucleo presente sem ser coberto por um casamento exato = a palavra solta.
                for m in re.finditer(re.escape(core), line):
                    if overlaps(m.span(), identity):
                        continue
                    if any(overlaps(m.span(), [h.span()]) for h in hits):
                        continue
                    variants.append((rel, lineno, m.group(0)))
            if not hits:
                out.append(line)
                continue
            hits_here += len(hits)
            for m in hits:
                tokens[m.group(0)] += 1
            new = line
            for m in reversed(hits):
                piece = m.expand(replacement) if regex else replacement
                new = new[: m.start()] + piece + new[m.end():]
            out.append(new)
        if hits_here:
            files.append(FilePlan(rel, path, text, "".join(out), hits_here))
    return Scan(files, tokens, variants, scanned, excluded, loose)


def dirty_targets(root: pathlib.Path, rels: list[str]) -> dict[str, str]:
    """Arquivos-alvo com alteracao NA ARVORE (`git status --porcelain`), por caminho.

    Copia do que outro worker ainda esta editando nao e' sobrescrita. Arquivo novo (`??`) nao
    tem historico a perder; os alvos, porem, saem do indice, entao o caso nem aparece.
    """
    if not rels:
        return {}
    done = subprocess.run(
        ["git", "-C", str(root), "status", "--porcelain", "-z", "--", *rels],
        check=True,
        capture_output=True,
    )
    dirty: dict[str, str] = {}
    chunks = done.stdout.decode("utf-8", "surrogateescape").split("\0")
    i = 0
    while i < len(chunks):
        chunk = chunks[i]
        i += 1
        if not chunk:
            continue
        code, path = chunk[:2], chunk[3:] if chunk[2:3] == " " else chunk[2:]
        if code[0] in "RC":  # rename/copia: o proximo registro e' o caminho de origem
            i += 1
        if code != "??":
            dirty[path] = code
    return dirty


def render(scan_result: Scan, pattern_text: str, replacement: str, root: pathlib.Path, mode: str) -> str:
    """O relatorio: por token casado a contagem, e os arquivos (AC-01)."""
    lines = [f"== rename — {mode} =="]
    lines.append(f"padrao:       {pattern_text!r}")
    lines.append(f"troca:        {replacement!r}")
    lines.append(f"raiz:         {root}")
    lines.append(f"arquivos varridos: {scan_result.scanned}   (excluidos por regra: {sum(scan_result.excluded.values())})")
    for reason, n in sorted(scan_result.excluded.items()):
        lines.append(f"  excluido  {n:4d}  {reason}")
    if not scan_result.files:
        lines.append("")
        lines.append("nenhuma ocorrencia — nada a fazer.")
        return "\n".join(lines)
    lines.append("")
    lines.append("ocorrencias por token casado:")
    for token, n in sorted(scan_result.tokens.items()):
        lines.append(f"  {token!r}  {n}")
    lines.append("")
    lines.append("arquivos:")
    for plan in sorted(scan_result.files, key=lambda p: p.rel):
        lines.append(f"  {plan.rel}  {plan.count}")
    total = sum(p.count for p in scan_result.files)
    lines.append(f"total: {total} ocorrencias em {len(scan_result.files)} arquivos")
    return "\n".join(lines)


def render_variants(scan_result: Scan, pattern_text: str, prefix: str) -> str:
    """As ocorrencias do nucleo fora da forma pedida — o que o `--apply` recusa."""
    lines = [f"{prefix}: token fora do padrao (o pedido foi {pattern_text!r}, literal)"]
    for rel, lineno, token in scan_result.variants[:MAX_VARIANTS_PRINTED]:
        lines.append(f"  {rel}:{lineno}  {token!r}")
    restante = len(scan_result.variants) - MAX_VARIANTS_PRINTED
    if restante > 0:
        lines.append(f"  ... e {restante} outra(s)")
    lines.append("  nomeie o token exato, ou corrija/ignore o arquivo — nada foi gravado.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="rename.py",
        description="Renomeacao em massa com simulacao obrigatoria e exclusoes embutidas (AGENTS.md §5).",
        epilog="sem --apply nada e' gravado; com --apply, a gravacao exige simulacao limpa e arvore limpa.",
    )
    parser.add_argument("token", help="o token EXATO a trocar (literal por padrao; regex so' com --regex)")
    parser.add_argument("replacement", help="o texto que entra no lugar")
    parser.add_argument("--apply", action="store_true", help="grava (exige simulacao limpa na MESMA execucao)")
    parser.add_argument("--regex", action="store_true", help="trata o token como expressao regular (ancore voce mesmo)")
    parser.add_argument("--root", default=str(ROOT), help="raiz da varredura (default: a raiz do repo)")
    parser.add_argument("--allow-loose", action="store_true", help="libera token sem fronteira (palavra solta) no --apply")
    args = parser.parse_args(argv)

    root = pathlib.Path(args.root).resolve()
    if not (root / ".git").exists():
        print(f"rename: {root} nao e' repo git — a varredura e o gate de arvore suja dependem dele.", file=sys.stderr)
        return 1
    if "\n" in args.token or "\n" in args.replacement:
        print("rename: token/troca com quebra de linha nao e' suportado (a exclusao por linha perderia o sentido).", file=sys.stderr)
        return 1
    if not args.token:
        print("rename: token vazio.", file=sys.stderr)
        return 1

    try:
        pattern = re.compile(args.token if args.regex else re.escape(args.token))
    except re.error as exc:
        print(f"rename: token invalido como regex: {exc}", file=sys.stderr)
        return 1

    try:
        result = scan(root, pattern, args.replacement, args.regex, args.token)
    except subprocess.CalledProcessError as exc:
        print(f"rename: git falhou na varredura: {exc}", file=sys.stderr)
        return 1

    print(render(result, args.token, args.replacement, root, "SIMULACAO (nada gravado)" if not args.apply else "SIMULACAO + APLICACAO"), flush=True)

    if not args.apply:
        if result.variants:
            print("", file=sys.stderr)
            print(render_variants(result, args.token, "rename: AVISO (--apply recusaria)"), file=sys.stderr)
        return 0

    # --- Gravacao: so' passa com a simulacao DESTA execucao limpa (AGENTS.md §5) -------------
    if result.loose_token and not args.allow_loose:
        print("", file=sys.stderr)
        print(
            f"rename: RECUSADO — {args.token!r} e' palavra solta: sem fronteira (aspas, barra, espaco) "
            "o token casa dentro de qualquer coisa. Nomeie o token exato ou use --allow-loose.",
            file=sys.stderr,
        )
        return 1
    if result.variants:
        print("", file=sys.stderr)
        print(render_variants(result, args.token, "rename: RECUSADO"), file=sys.stderr)
        return 1
    if not result.files:
        print("rename: nada a gravar (nenhuma ocorrencia).", file=sys.stderr)
        return 0

    try:
        dirty = dirty_targets(root, [p.rel for p in result.files])
    except subprocess.CalledProcessError as exc:
        print(f"rename: git falhou no status: {exc}", file=sys.stderr)
        return 1
    if dirty:
        print("", file=sys.stderr)
        print("rename: RECUSADO — arquivo-alvo sujo na arvore (`git status --porcelain`):", file=sys.stderr)
        for rel, code in sorted(dirty.items()):
            print(f"  {code}  {rel}", file=sys.stderr)
        print("  encene ou descarte a alteracao antes de gravar — nada foi gravado.", file=sys.stderr)
        return 1

    # `newline=""`: escreve os bytes lidos, sem a traducao de fim de linha do text mode
    # (num checkout com CRLF, o `write_text` cru trocaria o arquivo inteiro, nao so' o token).
    for plan in result.files:
        with plan.path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(plan.new_text)
    print("", file=sys.stderr)
    print(f"rename: gravados {len(result.files)} arquivo(s).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
