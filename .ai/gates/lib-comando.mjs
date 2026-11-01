// O comando sem o que comprovadamente e' TEXTO: corpo de heredoc e o argumento entre aspas de
// -m/--message/echo/printf. As aspas que sobram sao do comando e viram espaco, para
// `bash -c "git add -A"` seguir julgado. Par JS do `so_comando` de `.ai/guards/lib-json.sh`:
// mesma regra, mesmos casos de teste (Endurance, 01/11).
export function soComando(cmd) {
  const linhas = []
  let fim = null
  for (const l of String(cmd ?? '').split('\n')) {
    if (fim !== null) {
      if (l === fim) fim = null
      continue
    }
    const h = /<<-?\s*["']?([A-Za-z_]\w*)["']?/.exec(l)
    if (h) fim = h[1]
    linhas.push(l)
  }
  return linhas
    .join('\n')
    .replace(/((?:^|\s)(?:-m|--message|echo|printf)(?:\s+-[a-z]+)*\s+)("[^"]*"|'[^']*')/g, "$1''")
    .replace(/["']/g, ' ')
}
