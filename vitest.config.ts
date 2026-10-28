import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// lib/slots.ts still builds slots in the server's local timezone, so tests
// pin it to the clinic's zone to stay deterministic on any machine / CI.
process.env.TZ = 'Asia/Kolkata'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
