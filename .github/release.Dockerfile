# Imagem OCI do binario do Tars — SO' o executavel, sobre a base minima que ele exige.
#
# O binario NAO e' compilado aqui: o workflow o compila no runner (`bun-linux-<arch>`, GLIBC)
# e o passa no contexto de build como `tars.amd64` / `tars.arm64`. Cada PLATAFORMA pega o seu
# por `$TARGETARCH` — o buildx o injeta por plataforma.
#
# PORQUE GLIBC (14/10): o asset da Release e o binario da imagem sao o MESMO arquivo, e quem
# consome e' glibc (Ubuntu/WSL, devcontainer Debian do Endurance via `COPY --from`). A primeira
# tentativa da dev.19 compilou para musl e usou `alpine`: o binario nao rodava no runner nem
# nas maquinas ("No such file or directory" = loader ausente). O `bun build --compile` nao
# emite estatico, entao `FROM scratch` nao serve; `debian:bookworm-slim` traz glibc e
# libstdc++, as unicas dependencias de runtime do binario.
FROM debian:bookworm-slim

ARG TARGETARCH
# --chmod: o upload/download-artifact do Actions PERDE o bit de execucao (zip); sem ele o
# container morre em `exec /tars: permission denied` (smoke da v0.0.1-dev.19, 14/10).
COPY --chmod=0755 tars.${TARGETARCH} /tars

# Labels OCI: a origem aponta o pacote do GHCR para o repo (link no GitHub Packages).
LABEL org.opencontainers.image.source="https://github.com/huldlabs/tars"
LABEL org.opencontainers.image.title="tars"
LABEL org.opencontainers.image.description="Tars — o catalogo de metodo: camada .ai, gates/hooks e processo de sessao"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENTRYPOINT ["/tars"]
CMD ["--help"]
