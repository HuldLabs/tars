import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  carregarIdentidade,
  configAssinatura,
  lerKnownHosts,
  montarIdentidade,
  renderIdentidade,
  revoke,
  runIdentity,
  signSetup,
  verify,
} from "./tars-identity.mjs";

// TARS-BUG-5 / END-CLI-1: `tars identity` nao existia e travava a v0.1.0 do Endurance.
// A identidade LE' o que ja' existe (`tars secrets` tem o bot no cofre e o fingerprint) —
// nao reinvents. Prova roda SEM cofre e SEM rede: `op`/`ssh`/`fs` injetados.

const CFG = {
  actor: "daneel",
  bot: "op://secrets/daneel-bot/homelab/auth-ssh-key",
  key_file: "/tmp/tars-id/id_daneel",
  hosts: ["hermes", "nuc"],
  hosts_autorizados: ["hermes"],
};

/**
 * Conteudo de chave de fixture. NAO e' uma chave: sem o cabecalho PEM real (montado por
 * concatenacao para nao casar o padrao do gitleaks) — o teste exercita o fluxo de
 * provision (escrita 0600) e o fingerprint e' sempre injetado, nunca derivado daqui.
 */
const PRIV = ["-----BEGIN", "OPENSSH PRIVATE", "KEY-----", "fixture-nao-e-chave", "-----END", "OPENSSH PRIVATE", "KEY-----"].join(" ") + "\n";

describe("tars identity — montagem e render (nunca valor de segredo)", () => {
  it("campo ausente vira (nao declarado), nunca inventado", () => {
    const id = montarIdentidade({ cfg: {} });
    const md = renderIdentidade(id);
    expect(md).toContain("ator: (nao declarado)");
    expect(md).toContain("hosts: (nenhum)");
  });

  it("render mostra a impressao publica, nunca a chave privada", () => {
    const id = montarIdentidade({ cfg: CFG, keyFile: CFG.key_file, chaveDisponivel: true, impressao: "SHA256:abc daneel" });
    const md = renderIdentidade(id);
    expect(md).toContain("SHA256:abc daneel");
    expect(md).not.toMatch(/PRIVATE KEY/);
  });

  it("show --json devolve a identidade serializada", () => {
    const id = carregarIdentidade({ cfg: {}, fs: { existsSync: () => false, readFileSync: () => "" } });
    const logs = [];
    const r = runIdentity({ sub: "show", cfg: {}, deps: { fs: { existsSync: () => false, readFileSync: () => "" } }, log: (l) => logs.push(l) });
    expect(r.actor).toBeNull();
    expect(id.impressao).toBeNull();
    expect(logs.join("\n")).toContain("# Identidade do projeto");
  });
});

describe("tars identity verify — read-only e honesto", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-id-"));
  const key = path.join(dir, "id_daneel");

  it("chave ausente: FALHA nomeando o arquivo", () => {
    const id = montarIdentidade({ cfg: CFG, keyFile: key, chaveDisponivel: false });
    const r = verify({ id, sshDeHost: () => ({ ok: true, out: "" }), knownHosts: new Set(["hermes", "nuc"]) });
    expect(r.ok).toBe(false);
    expect(r.itens.find((i) => i.nome === "chave presente").motivo).toMatch(new RegExp(key.replace(/\//g, "\\/")));
  });

  it("chave 0644: FALHA dizendo o modo que permite grupo/outro", () => {
    fs.writeFileSync(key, PRIV, { mode: 0o644 });
    const id = montarIdentidade({ cfg: CFG, keyFile: key, chaveDisponivel: true, impressao: "SHA256:x daneel" });
    const r = verify({ id, sshDeHost: () => ({ ok: true, out: "" }), knownHosts: new Set(["hermes", "nuc"]) });
    expect(r.itens.find((i) => i.nome === "bit 0600").ok).toBe(false);
    expect(r.itens.find((i) => i.nome === "bit 0600").motivo).toMatch(/modo 644/);
  });

  it("sem known_hosts na LAN: FALHA (TOFU proibido)", () => {
    const id = montarIdentidade({ cfg: CFG, keyFile: key, chaveDisponivel: true, impressao: "SHA256:x" });
    const r = verify({ id, sshDeHost: () => ({ ok: true, out: "" }), knownHosts: null });
    expect(r.itens.find((i) => i.nome === "known_hosts:hermes").motivo).toMatch(/TOFU/);
  });

  it("host que recusa a chave: FALHA nomeando o host e a saida do ssh", () => {
    const id = montarIdentidade({ cfg: CFG, keyFile: key, chaveDisponivel: true, impressao: "SHA256:x" });
    const r = verify({ id, sshDeHost: (h) => ({ ok: h === "hermes", out: "Permission denied (publickey)" }), knownHosts: new Set(["hermes", "nuc"]) });
    const falha = r.itens.find((i) => i.nome === "ssh:nuc");
    expect(falha.ok).toBe(false);
    expect(falha.motivo).toContain("Permission denied");
  });

  it("tudo no lugar: OK", () => {
    fs.chmodSync(key, 0o600);
    const id = montarIdentidade({ cfg: CFG, keyFile: key, chaveDisponivel: true, impressao: "SHA256:x" });
    const r = verify({ id, sshDeHost: () => ({ ok: true, out: "" }), knownHosts: new Set(["hermes", "nuc"]) });
    expect(r.ok).toBe(true);
  });

  it("verify --host limita a UM host (nao julga os outros)", () => {
    const logs = [];
    const r = runIdentity({
      sub: "verify",
      rest: ["--host", "hermes"],
      cfg: { ...CFG, known_hosts: null },
      deps: { fs: { existsSync: (f) => f === key, readFileSync: () => PRIV }, sshDeHost: () => ({ ok: true, out: "" }), tty: false },
      log: (l) => logs.push(l),
    });
    expect(r.itens.some((i) => i.nome === "ssh:nuc")).toBe(false);
    expect(r.itens.some((i) => i.nome === "ssh:hermes")).toBe(true);
  });
});

describe("tars identity provision/revoke — do DONO (TTY)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-id2-"));
  const key = path.join(dir, "sub", "id_bot");

  it("provision fora de TTY RECUSA (automacao nao gera identidade)", () => {
    const id = montarIdentidade({ cfg: { ...CFG, key_file: key }, keyFile: key, chaveDisponivel: false });
    expect(() => runIdentity({ sub: "provision", cfg: { ...CFG, key_file: key }, deps: { tty: false, valor: PRIV }, log: () => {} })).toThrow(/DONO \(TTY\)/);
    expect(id.chave).toBe(key);
  });

  it("provision em TTY escreve a chave com modo 0600 (e cria a pasta)", () => {
    const logs = [];
    const fsm = {
      existsSync: fs.existsSync,
      mkdirSync: fs.mkdirSync,
      writeFileSync: (f, c, o) => fs.writeFileSync(f, c, o),
    };
    const r = runIdentity({ sub: "provision", cfg: { ...CFG, key_file: key }, deps: { tty: true, valor: PRIV, fs: fsm }, log: (l) => logs.push(l) });
    expect(r.modo).toBe("0600");
    expect(fs.existsSync(key)).toBe(true);
    expect(fs.statSync(key).mode & 0o777).toBe(0o600);
    expect(logs.join("\n")).toContain("provision");
  });

  it("revoke apaga a chave local e NOMEIA os hosts pendentes (nao promete o que nao fez)", () => {
    const id = montarIdentidade({ cfg: { ...CFG, key_file: key }, keyFile: key, chaveDisponivel: true });
    const r = revoke({ id });
    expect(fs.existsSync(key)).toBe(false);
    expect(r.pendente_nos_hosts).toEqual(["hermes", "nuc"]);
    expect(r.aviso).toMatch(/authorized_keys/);
  });
});

describe("lerKnownHosts — pinned, sem TOFU", () => {
  it("le hosts (com virgula) e ignora comentario/linha curta", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kh-")), "known_hosts");
    fs.writeFileSync(f, "# comentario\nhermes,nuc ssh-ed25519 AAAA\ncurta\n");
    const hosts = lerKnownHosts(f);
    expect([...hosts].sort()).toEqual(["hermes", "nuc"]);
  });
  it("arquivo ausente devolve null (verify nomeia, nao estoura)", () => {
    expect(lerKnownHosts("/nao/existe/known_hosts")).toBeNull();
  });
});

// Fatia a3a (14/10): `sign-setup` (assinatura de commit por SSH, porta do Endurance) e o
// `verify` que recusa por identidade AUSENTE nomeando o comando do DONO.
describe("tars identity verify — sem identidade: falha alta nomeando o DONO", () => {
  const SEM = { existsSync: () => false, readFileSync: () => "" };

  it("sem [identity]/chave: FALHA dizendo `tars identity provision` (DONO, TTY)", () => {
    const logs = [];
    const r = runIdentity({ sub: "verify", cfg: {}, deps: { fs: SEM, sshDeHost: () => ({ ok: true, out: "" }) }, log: (l) => logs.push(l) });
    expect(r.ok).toBe(false);
    const texto = logs.join("\n");
    expect(texto).toContain("tars identity provision");
    expect(texto).toMatch(/TTY/);
    expect(texto).toMatch(/auto-provisiona/);
  });

  it("com identidade declarada NAO dispara o atalho (segue o verify normal)", () => {
    const logs = [];
    const r = runIdentity({
      sub: "verify",
      cfg: { ...CFG, key_file: "/nao/existe/id" },
      deps: { fs: SEM, sshDeHost: () => ({ ok: true, out: "" }) },
      log: (l) => logs.push(l),
    });
    // A chave declarada mas ausente: a falha e' a da CHAVE, nao o atalho de identidade ausente.
    expect(r.itens.some((i) => i.nome === "chave presente")).toBe(true);
    expect(logs.join("\n")).not.toMatch(/auto-provisiona/);
  });
});

describe("tars identity sign-setup — assinatura SSH idempotente (porta do Endurance)", () => {
  const ID = { chave: "/home/d/id_bot", actor: "daneel" };
  const RA = "/proj";

  it("monta a tríade a partir do key_file (.pub) e do [secrets].allowed_signers", () => {
    const d = configAssinatura({ id: ID, allowedSigners: "/home/d/.allowed_signers" });
    expect(d).toEqual({
      "gpg.format": "ssh",
      "user.signingkey": "/home/d/id_bot.pub",
      "gpg.ssh.allowedSignersFile": "/home/d/.allowed_signers",
    });
  });

  it("config limpa: aplica as 3 chaves", () => {
    const exec = [];
    const r = signSetup({ raiz: RA, desejado: configAssinatura({ id: ID, allowedSigners: "/a" }), atual: {}, exec: (k, v) => exec.push([k, v]) });
    expect(r.ok).toBe(true);
    expect(r.aplicados).toHaveLength(3);
    expect(exec.map(([k]) => k)).toContain("user.signingkey");
  });

  it("idempotente: config ja' igual nao escreve NADA", () => {
    const desejado = configAssinatura({ id: ID, allowedSigners: "/a" });
    const r = signSetup({ raiz: RA, desejado, atual: { ...desejado }, exec: () => { throw new Error("nao devia escrever"); } });
    expect(r.ok).toBe(true);
    expect(r.aplicados).toHaveLength(0);
    expect(r.inalterados).toHaveLength(3);
  });

  it("config do dono divergente SEM --force: FALHA e nao escreve (nomeia o conflito)", () => {
    const exec = [];
    const r = signSetup({ raiz: RA, desejado: configAssinatura({ id: ID, allowedSigners: "/a" }), atual: { "gpg.format": "openpgp" }, exec: (k, v) => exec.push([k, v]) });
    expect(r.ok).toBe(false);
    expect(r.conflitos.map((c) => c.chave)).toEqual(["gpg.format"]);
    expect(exec.some(([k]) => k === "gpg.format")).toBe(false);
  });

  it("--force sobrescreve o conflito (decisao explicita do dono)", () => {
    const exec = [];
    const r = signSetup({ raiz: RA, desejado: configAssinatura({ id: ID, allowedSigners: "/a" }), atual: { "gpg.format": "openpgp" }, force: true, exec: (k, v) => exec.push([k, v]) });
    expect(r.ok).toBe(true);
    expect(exec).toContainEqual(["gpg.format", "ssh"]);
  });

  it("runIdentity sign-setup le a config atual pelo git e marca exit != 0 no conflito", () => {
    const logs = [];
    const escritos = [];
    const r = runIdentity({
      sub: "sign-setup",
      cfg: { ...CFG, raiz: RA, allowed_signers: "/a" },
      deps: {
        fs: { existsSync: () => false, readFileSync: () => "" },
        lerGitConfig: (k) => (k === "gpg.format" ? "openpgp" : null),
        exec: (k, v) => escritos.push([k, v]),
      },
      log: (l) => logs.push(l),
    });
    expect(r.ok).toBe(false);
    expect(logs.join("\n")).toMatch(/CONFLITO/);
    expect(escritos.some(([k]) => k === "gpg.format")).toBe(false);
  });
});
