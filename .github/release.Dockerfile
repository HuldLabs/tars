# Imagem OCI do binario do Tars — SO' o executavel, sobre a base minima que ele exige.
#
# O binario NAO e' compilado aqui: o workflow o compila no runner (cross-compile por alvo,
# `bun-linux-<arch>-musl`) e o passa no contexto de build como `tars.amd64` / `tars.arm64`.
# Cada PLATAFORMA pega o seu por `$TARGETARCH` — o buildx o injeta por plataforma.
#
# PORQUE `alpine` e NAO `scratch` (medido, 14/10): o `bun build --compile` do Bun 1.4.2 NAO
# produz um executavel 100% estatico em nenhum dos alvos (`bun-linux-*-musl` ainda tem
# `PT_INTERP` = `/lib/ld-musl-<arch>.so.1` e precisa de `libstdc++.so.6`). Numa imagem
# `FROM scratch` o container morre em `exec /tars: no such file or directory` — sem loader
# nao ha' como o kernel iniciar o processo. A base `alpine` + `libstdc++` e' o MINIMO que
# roda: ~7 MB, sem shell no caminho de execucao, sem pacote de aplicacao. Se o Bun passar a
# emitir estatico de verdade, troque por `FROM scratch` — o resto do arquivo nao muda.
FROM alpine:3.20

# O `libstdc++.so.6` e' a UNICA dependencia de runtime do binario musl (vem do Zig/Bun). O
# `alpine` traz musl; o `libstdc++` e' o pacote que falta.
RUN apk add --no-cache libstdc++

ARG TARGETARCH
COPY tars.${TARGETARCH} /tars

# Labels OCI: a origem aponta o pacote do GHCR para o repo (link no GitHub Packages).
LABEL org.opencontainers.image.source="https://github.com/huldlabs/tars"
LABEL org.opencontainers.image.title="tars"
LABEL org.opencontainers.image.description="Tars — o catalogo de metodo: camada .ai, gates/hooks e processo de sessao"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENTRYPOINT ["/tars"]
CMD ["--help"]
