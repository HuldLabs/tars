#!/usr/bin/env python3
"""Teste do `tools/framework/rename.py` — cada exclusao e cada recusa, exercitadas em fixture.

Regra sem teste e' sugestao (mesma forma do `business-rules.test.mjs`): aqui as exclusoes
embutidas e as duas recusas do `--apply` RODAM de verdade sobre um repo git temporario, e o
arquivo excluido e' conferido byte a byte depois da gravacao — nao basta a ferramenta dizer
que pulou. Cobre os tres criterios de aceite da SEG-675:
    AC-01  sem `--apply` nada muda (conteudo e `git status`) e a saida lista a contagem;
    AC-02  lockfile, `.sops`, migration, `HANDOFF.md`, `DELIVERED.md`, `integrity`/`hash` e
           `e2e@segtools.local` nunca sao alterados;
    AC-03  arquivo-alvo modificado na arvore faz o `--apply` sair com codigo != 0.

E os dois defeitos que a #SEG-722 achou e nao corrigiu (SEG-723):
    AC-01  o pre-filtro do modo literal compara com o token CRU: `../ui/` acha o mesmo que o
           `--regex` (antes comparava com `pattern.pattern`, ja' escapado, e dava "0 ocorrencias");
    AC-02  doc/vendored (`.agents/skills/**`, `docs/reference/fabber-ui/**`,
           `docs/REFERENCE-MANIFEST.md`) saem de escopo — o `--apply` do token `"@/components/ui/`
           passa a ser aceito e o material vendored fica byte a byte.

Rodar:  python3 tools/framework/rename_test.py
"""
from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = pathlib.Path(__file__).resolve().parent / "rename.py"
# O git do teste nao pode herdar hooks nem assinatura da configuracao de quem roda a suite.
GIT_OVERRIDES = ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"]


def git(root: pathlib.Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *GIT_OVERRIDES, *args],
        check=True,
        capture_output=True,
        text=True,
    )


class Fixture:
    """Repo git minimo e descartavel: e' ele que o `git ls-files`/`git status` da ferramenta le."""

    def __init__(self) -> None:
        self.root = pathlib.Path(tempfile.mkdtemp(prefix="rename-fixture-"))
        git(self.root, "init", "-q", "-b", "main")
        git(self.root, "config", "user.email", "teste@sofon.local")
        git(self.root, "config", "user.name", "teste")

    def write(self, rel: str, text: str) -> pathlib.Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def commit(self, message: str = "fixture") -> None:
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", message)

    def run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(TOOL), *args, "--root", str(self.root)],
            capture_output=True,
            text=True,
        )

    def read(self, rel: str) -> str:
        # `newline=""`: sem ele o text mode traduz CRLF para LF na LEITURA, e o teste de fim de
        # linha abaixo nao veria o que a ferramenta gravou.
        with (self.root / rel).open("r", encoding="utf-8", newline="") as handle:
            return handle.read()

    def read_bytes(self, rel: str) -> bytes:
        return (self.root / rel).read_bytes()

    def porcelain(self) -> str:
        return git(self.root, "status", "--porcelain").stdout

    def close(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)


class RenameTest(unittest.TestCase):
    def setUp(self) -> None:
        self.addCleanup(self._cleanup)
        self.fx = Fixture()

    def _cleanup(self) -> None:
        self.fx.close()

    # --- AC-01 -------------------------------------------------------------------------------
    def test_simulacao_nao_grava_e_lista_a_contagem(self) -> None:
        self.fx.write("src/a.ts", 'import x from "@x/pkg";\nimport y from "@x/other";\n')
        self.fx.write("src/b.ts", 'export * from "@x/pkg";\n')
        self.fx.commit()
        antes = {rel: self.fx.read(rel) for rel in ("src/a.ts", "src/b.ts")}
        status_antes = self.fx.porcelain()

        feito = self.fx.run('"@x/', '"@y/')

        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertIn("SIMULACAO", feito.stdout)
        # Contagem por token casado e por arquivo (AC-01).
        self.assertIn("'\"@x/'  3", feito.stdout)
        self.assertIn("src/a.ts  2", feito.stdout)
        self.assertIn("src/b.ts  1", feito.stdout)
        self.assertIn("total: 3 ocorrencias em 2 arquivos", feito.stdout)
        self.assertEqual({rel: self.fx.read(rel) for rel in antes}, antes, "a simulacao gravou")
        self.assertEqual(self.fx.porcelain(), status_antes, "a simulacao mexeu na arvore")

    # --- AC-02, por caminho ------------------------------------------------------------------
    def test_apply_nao_toca_lock_sops_migration_handoff(self) -> None:
        alvo = 'const p = "@x/pkg";\n'
        self.fx.write("src/a.ts", alvo)
        excluidos = {
            "bun.lock": '"@x/pkg"\n',
            "package-lock.json": '"@x/pkg"\n',
            "dep.lock": '"@x/pkg"\n',
            "secrets/dev.sops": '"@x/pkg"\n',
            ".copier-answers.yml": '"@x/pkg"\n',
            # o app (config [app].dir) tem as migrations aplicadas — imutaveis.
            "apps/hub/db/migrations/0050_actor_is_test.sql": '-- "@x/pkg"\n',
            "HANDOFF.md": '"@x/pkg"\n',
            "DELIVERED.md": '"@x/pkg"\n',
        }
        for rel, texto in excluidos.items():
            self.fx.write(rel, texto)
        self.fx.commit()
        antes = {rel: self.fx.read(rel) for rel in excluidos}

        feito = self.fx.run('"@x/', '"@y/', "--apply")

        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertIn('"@y/pkg"', self.fx.read("src/a.ts"), "o alvo legitimo nao mudou")
        for rel, texto in antes.items():
            self.assertEqual(self.fx.read(rel), texto, f"{rel} foi alterado")

    # --- AC-02, valor de hash ----------------------------------------------------------------
    def test_apply_nao_toca_linha_de_integrity_nem_hash(self) -> None:
        self.fx.write("src/a.ts", 'const p = "@x/pkg";\n')
        self.fx.write("deps.json", '{\n  "integrity": "@x/pkg",\n  "name": "@x/pkg"\n}\n')
        self.fx.write("lock.json", '{\n  "hash": "@x/pkg"\n}\n')
        self.fx.commit()
        hash_antes = self.fx.read("lock.json")

        feito = self.fx.run('"@x/', '"@y/', "--apply")

        self.assertEqual(feito.returncode, 0, feito.stderr)
        # O corte e' por LINHA: a do hash sai de escopo, a vizinha de nome comum segue alvo.
        self.assertIn('"integrity": "@x/pkg"', self.fx.read("deps.json"), "linha de integrity foi tocada")
        self.assertIn('"name": "@y/pkg"', self.fx.read("deps.json"))
        self.assertEqual(self.fx.read("lock.json"), hash_antes, "linha de hash foi tocada")

    # --- AC-02, identidade -------------------------------------------------------------------
    def test_apply_nao_toca_email_local_nem_o_conta_como_variante(self) -> None:
        self.fx.write("src/real.ts", 'import x from "@segtools/hub";\n')
        self.fx.write("src/mail.ts", 'export const E2E = "e2e@segtools.local";\n')
        self.fx.commit()
        mail_antes = self.fx.read("src/mail.ts")

        feito = self.fx.run('"@segtools/', '"@sofon/', "--apply")

        # Se o e-mail contasse como ocorrencia do nucleo, o `--apply` recusaria por "token fora
        # do padrao" (rc 1). Passar com rc 0 e' a prova de que a identidade saiu do escopo.
        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertEqual(self.fx.read("src/mail.ts"), mail_antes, "o e-mail .local foi alterado")
        self.assertIn('"@sofon/hub"', self.fx.read("src/real.ts"))

    # --- AC-03 -------------------------------------------------------------------------------
    def test_apply_recusa_arvore_suja_no_alvo(self) -> None:
        self.fx.write("src/a.ts", 'const p = "@x/pkg";\n')
        self.fx.commit()
        self.fx.write("src/a.ts", 'const p = "@x/pkg";\n// editando\n')
        sujo = self.fx.read("src/a.ts")

        feito = self.fx.run('"@x/', '"@y/', "--apply")

        self.assertNotEqual(feito.returncode, 0, "gravou com a arvore suja")
        self.assertIn("sujo", feito.stderr)
        self.assertIn("src/a.ts", feito.stderr)
        self.assertEqual(self.fx.read("src/a.ts"), sujo, "o arquivo foi gravado mesmo assim")

    # --- recusa: palavra solta ---------------------------------------------------------------
    def test_apply_recusa_palavra_solta(self) -> None:
        self.fx.write("src/a.ts", "const p = segtools;\n")
        self.fx.commit()

        feito = self.fx.run("segtools", "sofon", "--apply")

        self.assertNotEqual(feito.returncode, 0, "aceitou token sem fronteira")
        self.assertIn("palavra solta", feito.stderr)
        self.assertIn("segtools", self.fx.read("src/a.ts"))
        # A saida documentada: quem sabe o que faz libera com --allow-loose.
        liberado = self.fx.run("segtools", "sofon", "--apply", "--allow-loose")
        self.assertEqual(liberado.returncode, 0, liberado.stderr)
        self.assertIn("sofon", self.fx.read("src/a.ts"))

    # --- recusa: token fora do padrao --------------------------------------------------------
    def test_apply_recusa_token_fora_do_padrao(self) -> None:
        self.fx.write("src/a.ts", 'const p = "@x/pkg";\n')
        self.fx.write("src/outro.ts", "const q = '@x/outro';\n")
        self.fx.commit()
        outro_antes = self.fx.read("src/outro.ts")

        feito = self.fx.run('"@x/', '"@y/', "--apply")

        self.assertNotEqual(feito.returncode, 0, "aplicou com a palavra solta presente")
        self.assertIn("token fora do padrao", feito.stderr)
        self.assertIn("src/outro.ts:1", feito.stderr)
        self.assertEqual(self.fx.read("src/outro.ts"), outro_antes)
        self.assertIn('"@x/pkg"', self.fx.read("src/a.ts"), "gravou parte antes de recusar")

    # --- gravacao byte a byte -----------------------------------------------------------------
    def test_apply_preserva_fim_de_linha_crlf(self) -> None:
        # O `write_text` do text mode traduz fim de linha: num checkout com CRLF ele reescreveria o
        # arquivo INTEIRO (diff de toda linha) em vez de so' o token. A gravacao usa `newline=""`.
        self.fx.write("src/a.ts", 'const p = "@x/pkg";\r\nconst q = 1;\r\n')
        self.fx.commit()

        feito = self.fx.run('"@x/', '"@y/', "--apply")

        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertEqual(
            self.fx.read_bytes("src/a.ts"),
            b'const p = "@y/pkg";\r\nconst q = 1;\r\n',
            "a gravacao trocou o fim de linha do arquivo",
        )

    # --- SEG-723, defeito 1: o pre-filtro do modo literal ------------------------------------
    def test_literal_acha_o_mesmo_que_o_regex_com_ponto_no_token(self) -> None:
        # O pre-filtro barato comparava o texto com `pattern.pattern` — o token JA' escapado pelo
        # `re.escape` (`\.\./ui/`) — e o ponto escapado nao existe em texto nenhum: a simulacao
        # anunciava "0 ocorrencias" enquanto o `--regex` achava 26 em 22 arquivos no repo real.
        self.fx.write("src/a.ts", 'import x from "../ui/badge";\nimport y from "../ui/button";\n')
        self.fx.write("src/b.ts", 'export * from "../ui/card";\n')
        self.fx.commit()

        literal = self.fx.run("../ui/", "../primitives/")
        regex = self.fx.run("--regex", r"\.\./ui/", "../primitives/")

        self.assertEqual(literal.returncode, 0, literal.stderr)
        self.assertEqual(regex.returncode, 0, regex.stderr)
        self.assertIn("total: 3 ocorrencias em 2 arquivos", literal.stdout)
        self.assertIn("total: 3 ocorrencias em 2 arquivos", regex.stdout)

    def test_literal_e_regex_aplicam_o_mesmo_resultado(self) -> None:
        # O outro lado do defeito: nao basta CONTAR igual — com o pre-filtro cego o `--apply`
        # literal gravava "nada a gravar" e o operador concluia que nao havia o que trocar.
        self.fx.write("src/a.ts", 'import x from "../ui/badge";\n')
        self.fx.commit()

        feito = self.fx.run("../ui/", "../primitives/", "--apply")

        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertEqual(self.fx.read("src/a.ts"), 'import x from "../primitives/badge";\n')

    # --- SEG-723, defeito 2: doc/vendored fora do escopo (AGENTS §5) -------------------------
    VENDORED = {
        # A skill do shadcn e' copia fiel de terceiro: o `@/components/ui` fica nela de proposito.
        ".agents/skills/shadcn/SKILL.md": "# shadcn — importe de `@/components/ui/button`\n",
        ".agents/skills/shadcn/cli.md": "o alias de UI e' `@/components/ui`\n",
        ".agents/skills/shadcn/rules/composition.md": "use `@/components/ui/button`\n",
        ".agents/skills/shadcn/rules/forms.md": "`@/components/ui/form`\n",
        # Referencia historica do Fabber (o projeto de origem), nao codigo nosso.
        "docs/REFERENCE-MANIFEST.md": "| `@/components/ui` | primitivas |\n",
        "docs/reference/fabber-ui/components.json": '{"aliases": {"ui": "@/components/ui"}}\n',
    }

    def test_apply_aceita_o_caso_da_722_sem_tocar_doc_vendored(self) -> None:
        # O caso real da #SEG-722: o token pedido tem aspa, mas o NUCLEO `@/components/ui` aparece
        # sem aspa no material vendored/historico — o `--apply` recusava por "token fora do padrao"
        # e o operador acabou trocando por fora da ferramenta.
        self.fx.write("src/view.tsx", 'import { Button } from "@/components/ui/button";\n')
        for rel, texto in self.VENDORED.items():
            self.fx.write(rel, texto)
        self.fx.commit()
        antes = {rel: self.fx.read(rel) for rel in self.VENDORED}

        feito = self.fx.run('"@/components/ui/', '"@sofon/ui/primitives/', "--apply")

        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertIn('"@sofon/ui/primitives/button"', self.fx.read("src/view.tsx"))
        for rel, texto in antes.items():
            self.assertEqual(self.fx.read(rel), texto, f"{rel} (vendored/doc) foi alterado")

    def test_doc_vendored_sai_por_caminho_e_o_gate_segue_armado(self) -> None:
        # Controle negativo: o MESMO conteudo do material vendored fora do caminho excluido continua
        # recusando — quem salva o vendored e' a exclusao de caminho, nao um afrouxamento do gate.
        self.fx.write("src/copia-do-skill.md", "# importe de `@/components/ui/button`\n")
        for rel, texto in self.VENDORED.items():
            self.fx.write(rel, texto)
        self.fx.commit()

        recusa = self.fx.run('"@/components/ui/', '"@sofon/ui/primitives/', "--apply")

        self.assertNotEqual(recusa.returncode, 0, "aplicou com o nucleo do token fora do padrao")
        self.assertIn("token fora do padrao", recusa.stderr)
        self.assertIn("src/copia-do-skill.md:1", recusa.stderr)

        # E a simulacao nomeia a exclusao — o operador ve' que os arquivos sairam, nao que sumiram.
        simulado = self.fx.run('"@/components/ui/', '"@sofon/ui/primitives/')
        self.assertIn("skill vendored (material de terceiro)", simulado.stdout)
        self.assertIn("snapshot de referencia do Fabber", simulado.stdout)
        self.assertIn("manifesto de referencia (historico)", simulado.stdout)

    def test_apply_allow_loose_no_token_sem_aspa_preserva_o_vendored(self) -> None:
        # O token sem fronteira (a forma que a AC-02 escreve) e' "palavra solta" para o §5: a saida
        # e' nomear o token exato, e o `--allow-loose` e' a liberacao documentada.
        self.fx.write("src/view.tsx", 'import { Button } from "@/components/ui/button";\n')
        for rel, texto in self.VENDORED.items():
            self.fx.write(rel, texto)
        self.fx.commit()
        antes = {rel: self.fx.read(rel) for rel in self.VENDORED}

        solto = self.fx.run("@/components/ui", "@/ui/components", "--apply")
        self.assertNotEqual(solto.returncode, 0, "aceitou token sem fronteira")
        self.assertIn("palavra solta", solto.stderr)

        liberado = self.fx.run("@/components/ui", "@/ui/components", "--apply", "--allow-loose")
        self.assertEqual(liberado.returncode, 0, liberado.stderr)
        self.assertIn('"@/ui/components/button"', self.fx.read("src/view.tsx"))
        for rel, texto in antes.items():
            self.assertEqual(self.fx.read(rel), texto, f"{rel} (vendored/doc) foi alterado")

    # --- nada a fazer ------------------------------------------------------------------------
    def test_sem_ocorrencia_sai_zero(self) -> None:
        self.fx.write("src/a.ts", 'const p = "@x/pkg";\n')
        self.fx.commit()

        feito = self.fx.run('"@nada/', '"@outro/')

        self.assertEqual(feito.returncode, 0, feito.stderr)
        self.assertIn("nada a fazer", feito.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
