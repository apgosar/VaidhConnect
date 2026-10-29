import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// lib/slots.ts still builds slots in the server's local timezone, so tests
// pin it to the clinic's zone to stay deterministic on any machine / CI.
process.env.TZ = 'Asia/Kolkata'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  // Next's tsconfig keeps JSX as-is for its own compiler; tests need it compiled.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    env: { PATIENT_PIN_SECRET: 'unit-test-secret-unit-test-secret-0123456789' },
  },
})
