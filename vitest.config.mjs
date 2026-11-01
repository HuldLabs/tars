import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Os testes criam diretorio em os.tmpdir() e nao apagam: em 01/11 eram ~12 mil pastas no
    // /tmp do container. O setup da a cada rodada um TMPDIR proprio e o apaga no fim.
    globalSetup: './tools/framework/vitest-tmpdir.mjs',
  },
})
