<!--
Modelo do PR FINAL de versão (doutrina `.ai/governance/release.md`, passo 1).
Título: `<emoji> <tipo>(<repo>): <resumo da versão> — v<X.Y.Z[-dev.N]>`
Ex.: `✨ feat(tars): self-update e upgrade real — v0.0.1-dev.23`
O merge deste PR pelo dono é o aval para o coord cortar a tag `v<versão>`.
-->

## Versão `v<X.Y.Z[-dev.N]>`

**Fonte da versão:** `<package.json | pyproject.toml | VERSION>` = `<versão>` (igual ao topo do CHANGELOG).

### O que entra
- <a mudança, como o consumidor a vê>

### Bugs reportados que fecha
- <repo> (<data>): <o bug, com a reprodução ou o link>

### Prova
- <suíte: N passaram, falhas e o motivo de cada uma>
- <prova real: comando e saída que mostram a mudança funcionando>

### Depois do merge (o coord faz)
- [ ] tag `v<versão>` anotada, como Daneel, sobre o commit de merge
- [ ] CI até a Release: artefatos provados, upgrade real, Release por último, tags da imagem depois
- [ ] conferir a página da Release (pré-release, assets, notas, digest)
- [ ] o Tars primeiro: `tars self-update` no container e `tars sync --upgrade` no próprio repo
- [ ] avisar os coords consumidores (`templates/AVISO-CONSUMIDORES.tpl.md`)
