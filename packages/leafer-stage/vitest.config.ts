import { resolve } from 'path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'leafer-stage',
    include: ['./tests/unit/**/*.spec.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@tmagic/core': resolve(__dirname, '../core/src'),
    },
  },
})
