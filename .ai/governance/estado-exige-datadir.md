# Doutrina: servico com estado nao sobe sobre volume vazio

Servico com estado (banco, fila, cache persistente, indice) **nao sobe** quando o volume
que devia conter os dados esta' vazio. Subir assim e' pior que falhar: o processo fica verde
e serve um mundo novo, silenciosamente diferente do real.

Origem: seo-brain (`scripts/pg_preflight.sh`, 07/10 — so' a ideia, nada do projeto).

## O defeito

O `docker compose up` subiu, o healthcheck passou, a aplicacao conectou — e nao havia dados.
Nenhum erro, nenhum log: o Postgres tinha inicializado um **cluster novo** num datadir vazio
(diretorio errado, montagem que falhou, volume apagado). O sintoma so' apareceu depois, longe
da causa. Metade do tempo de diagnostico foi gasto procurando defeito na aplicacao.

## Causa raiz

O preflight checava se o **processo** estava de pe', nao se o **volume** era o certo. Volume
vazio e' indistinguivel de volume perdido — dos dois lados o mount existe. Faltava um
marcador que o servico deixasse na primeira inicializacao e passasse a **exigir** depois.

## Regra

Sempre que o servico sobe sobre volume persistente, ele passa por um preflight **antes** de
aceitar conexao:

1. O datadir carrega um marcador escrito na primeira inicializacao (`.initialized`).
2. Sem o marcador, o preflight **recusa** subir e grita — nomeia datadir, marcador e volume.
3. Excecao unica e explicita: o primeiro `init` **declara** que vai criar o datadir vazio
   (flag nomeada, nunca default). Recusa e' o padrao; init e' decisao.

O marcador vive **dentro** do volume (o volume e' o unico que sabe se persistiu), nunca numa
variavel de ambiente ou em arquivo do host.

```sh
# esboco — o marcador e' do servico, o volume e' do operador
[ -f "$DATADIR/.initialized" ] || { echo "FALHA: $DATADIR sem marcador; se e' init, use --init"; exit 1; }
```

## Quem cobra

O preflight roda no `up` do servico, antes de publicar a porta; a prova e'
subir com o volume vazio e **esperar exit != 0**.
