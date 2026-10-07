#!/usr/bin/env python3
"""Garante que a memória nativa do Claude Code seja um symlink para .ai/memory/agent/ (ADR-019 rev. 2).

A fonte é o repo; a pasta da ferramenta é só um ponteiro. Funciona em Linux, macOS e Windows
(no Windows, symlink sem admin exige o Modo de Desenvolvedor; Python >= 3.8 já pede a flag).
Idempotente: sem nada a fazer, sai calado. Nunca derruba a sessão: falha vira aviso em stderr, exit 0.

Roda sozinho no hook SessionStart (.ai/hooks.jsonc) e em `task ai:setup`.

Uso: ensure_memory_link.py [--project-dir DIR] [--claude-home DIR]
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


def warn(msg: str) -> None:
    print(f"ensure-memory-link: {msg}", file=sys.stderr)


def project_dir(arg: str | None) -> str:
    if arg:
        return arg
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return env
    try:
        return subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
    except Exception:
        return os.getcwd()


def encode(project: str) -> str:
    """O Claude Code nomeia a pasta do projeto trocando todo caractere não alfanumérico por '-'."""
    return re.sub(r"[^A-Za-z0-9]", "-", project)


def ensure(project: str, claude_home: Path) -> int:
    target = Path(project) / ".ai" / "memory" / "agent"
    if not target.is_dir():
        warn(f"sem {target} (repo sem camada de memória) - nada a fazer")
        return 0

    link = claude_home / "projects" / encode(project) / "memory"
    if link.is_symlink():
        return 0

    try:
        link.parent.mkdir(parents=True, exist_ok=True)
        if link.is_dir():
            # Pasta real: o que for novo vai para o repo (sem sobrescrever) e o original vira backup.
            for item in link.iterdir():
                dest = target / item.name
                if item.is_file() and not dest.exists():
                    shutil.copy2(item, dest)
            backup = link.with_name(f"memory.bak-{time.strftime('%Y%m%d%H%M%S', time.gmtime())}")
            link.rename(backup)
            warn(f"memória local copiada para {target}; original guardado em {backup}")
        os.symlink(target, link, target_is_directory=True)
    except OSError as exc:
        hint = " (no Windows, ative o Modo de Desenvolvedor)" if os.name == "nt" else ""
        warn(f"não criei o link {link} -> {target}: {exc}{hint}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-dir")
    ap.add_argument("--claude-home")
    args = ap.parse_args()
    home = Path(args.claude_home or os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
    try:
        return ensure(project_dir(args.project_dir), home)
    except Exception as exc:  # nunca derruba a sessão
        warn(f"erro inesperado: {exc}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
