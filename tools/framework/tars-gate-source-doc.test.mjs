// Tests for the `source-doc` gate (doctrine `code/code-as-doc`). The gate is a program: proven by exit code and
// message on a real git repo, never by reading its code.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DOC_GATE = path.join(HERE, "..", "..", ".ai", "gates", "source-doc", "gate.mjs");

function createRepoWithStagedFiles(filesByPath) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-source-doc-"));
  const runGit = (args) => spawnSync("git", args, { cwd: repoDir, encoding: "utf8" });
  runGit(["init", "-q"]);
  for (const [relativePath, content] of Object.entries(filesByPath)) {
    const absolutePath = path.join(repoDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
    runGit(["add", "--", relativePath]);
  }
  return repoDir;
}

function runSourceDocGate(repoDir, params = "") {
  const result = spawnSync(process.execPath, [SOURCE_DOC_GATE], {
    encoding: "utf8",
    env: { ...process.env, TARS_PROJECT: repoDir, TARS_GATE_PARAMS: params, TARS_GATE: "source-doc" },
  });
  return { status: result.status, stderr: result.stderr };
}

describe("gate source-doc: code as documentation", () => {
  it("fails a Python module without a module docstring", () => {
    const result = runSourceDocGate(createRepoWithStagedFiles({ "pkg/a.py": "import os\n" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/pkg\/a\.py:1: missing module docstring/);
  });

  it("fails a public function without a docstring and with a short name, on the same line", () => {
    const result = runSourceDocGate(createRepoWithStagedFiles({ "a.py": '"""Module."""\ndef f(x):\n    return x\n' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/a\.py:2: public function `f` needs a descriptive name; public def `f` has no docstring/);
  });

  it("accepts a documented module with a documented, descriptive public API and private helpers", () => {
    const pythonSource = [
      '"""Body metrics."""',
      "def calculate_body_mass_index(weight_kg: float, height_m: float) -> float:",
      '    """Return weight divided by height squared."""',
      "    return weight_kg / height_m ** 2",
      "def _square(value):",
      "    return value * value",
      "",
    ].join("\n");
    expect(runSourceDocGate(createRepoWithStagedFiles({ "metrics.py": pythonSource })).status).toBe(0);
  });

  it("does not ask docstrings of test functions nor of an empty package marker", () => {
    const repoDir = createRepoWithStagedFiles({ "pkg/__init__.py": "", "tests/test_x.py": '"""Tests."""\ndef test_ok():\n    assert True\n' });
    expect(runSourceDocGate(repoDir).status).toBe(0);
  });

  it("fails TOML and shell files without a header comment, and accepts them with one", () => {
    const failing = runSourceDocGate(createRepoWithStagedFiles({ "c.toml": "key = 1\n", "run.sh": "#!/bin/sh\necho hi\n" }));
    expect(failing.status).toBe(1);
    expect(failing.stderr).toMatch(/c\.toml:1: missing TOML purpose header comment/);
    expect(failing.stderr).toMatch(/run\.sh:1: missing shell header comment/);
    const passing = runSourceDocGate(createRepoWithStagedFiles({ "c.toml": "# What this controls.\nkey = 1\n", "run.sh": "#!/bin/sh\n# Says hi.\necho hi\n" }));
    expect(passing.status).toBe(0);
  });

  it("skips paths listed in `allow`", () => {
    const repoDir = createRepoWithStagedFiles({ "migrations/versions/0001.py": "x = 1\n" });
    expect(runSourceDocGate(repoDir, JSON.stringify({ allow: ["migrations/versions/"] })).status).toBe(0);
  });
});
