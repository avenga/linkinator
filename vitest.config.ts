import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/test.*.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/cli.ts' // CLI is tested by calling it using `execa` and asserting the output
      ]
    },
  },
});
