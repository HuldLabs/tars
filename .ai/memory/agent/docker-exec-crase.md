---
name: docker-exec-crase
description: Crase e $ dentro de docker exec ... bash -c "..." sao expandidos antes do comando; usar script em arquivo
metadata:
  type: feedback
---

Comando passado a `docker exec ... bash -c "..."` (ou `-lc`) com crase ou `$` entre aspas duplas é expandido pelo shell que monta a linha, antes de chegar ao container: a crase EXECUTA o trecho, e `$VAR` vira o valor do lado errado. Mensagem de commit, PR ou heredoc com crase vai em arquivo, e o comando com lógica vai num script (`docker exec ... bash /caminho/script.sh`).

**Why:** em 14/10/2026 o texto com crase de uma mensagem rodou como comando; reescrito em 01/11/2026 porque o arquivo original ficou zerado (só bytes nulos) depois de um crash.

**How to apply:** nada de crase ou `$` dentro de `bash -c` com aspas duplas; use script em arquivo, com nome por tarefa ([[script-por-tarefa]]).
