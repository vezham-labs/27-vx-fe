import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src',
  outputDir: './test-output',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' }
})
