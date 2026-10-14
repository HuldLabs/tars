Tars v<versão> publicada: https://github.com/HuldLabs/tars/releases/tag/v<versão>
O repo e a imagem do Tars são públicos: atualizar não precisa de token nem de PAT
(se esbarrar no limite de taxa do GitHub, o self-update tenta de novo com GH_TOKEN ou `gh auth token`).

Como atualizar (nunca compile o Tars):
1. tars self-update
   (Se o seu tars for anterior à dev.23 e não tiver o comando, baixe uma vez à mão:
   V=<versão>; cd /tmp && curl -fsSLO https://github.com/HuldLabs/tars/releases/download/v$V/tars-linux-amd64 && curl -fsSLO https://github.com/HuldLabs/tars/releases/download/v$V/sha256sums && sha256sum -c --ignore-missing sha256sums && install -m 0755 tars-linux-amd64 ~/.local/bin/tars
   Use tars-linux-arm64 em ARM e os -musl em Alpine.)
2. No repo: tars sync --upgrade
3. tars upgrade-notes --from <sua versão anterior>
4. tars doctor (tem de sair sem PHANTOM e sem DRIFT)

Conferir:
- tars --version mostra <versão>;
- <checagem própria desta versão, tirada do CHANGELOG — ex. dev.26: grep -c "lib-json.sh ausente" .ai/base/guards/block-secret-dump.sh dá 1>;
- no .claude/settings.json, o PreToolUse do Bash tem só block-destructive-commands e block-secret-dump.
Imagem (para quem embute o Tars, como o Endurance): ghcr.io/huldlabs/tars@<digest da Release>, sempre por digest.

O que mudou para você: <resumo da seção "O que o consumidor faz" do CHANGELOG da versão>

Em caso de dúvida, bug ou problema, fale com o coord do Tars.
