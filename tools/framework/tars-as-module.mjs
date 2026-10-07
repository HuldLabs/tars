// Marca que os modulos DONOS (`tars-sync.mjs`, `tars-hooks.mjs`, `tars-promote.mjs`) estao
// sendo carregados como BIBLIOTECA pelo despachante `tars.mjs` — e nao como CLI.
//
// Por que existe (Incident: `dist/tars` perde um modulo em runtime): no `bun build --compile`
// todo modulo embutido responde o MESMO `import.meta.url` do entrypoint (`/$bunfs/root/tars`).
// O guard de auto-run `process.argv[1] === import.meta.url` virava verdadeiro em todos os
// modulos e o main deles rodava no import, antes do `tars.mjs` — `--help` respondia `sync`.
// Este arquivo e' importado ANTES dos donos, entao o `process.env` ja' esta marcado quando o
// corpo deles executa (import estatico e' sincrono e avalia na ordem escrita).
process.env.TARS_AS_MODULE = '1'
