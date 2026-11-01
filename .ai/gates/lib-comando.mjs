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
  let s = linhas.join('\n').replace(/((?:^|\s)(?:-m|--message)\s+)("[^"]*"|'[^']*')/g, '$1_')
  // echo/printf so' imprimem: todo argumento citado do segmento e' texto. Canalizado para um
  // shell, o texto vira comando e segue julgado (Endurance, 01/11: `printf '%s' 'git add -A'`).
  if (!/\|\s*(?:ba|z|da)?sh\b/.test(s)) {
    s = s.replace(/(?:^|[\s;&|])(?:echo|printf)\b[^;&|\n]*/g, (seg) => seg.replace(/"[^"]*"|'[^']*'/g, '_'))
  }
  return s.replace(/["']/g, ' ')
}
