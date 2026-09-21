import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4179'

export default defineConfig({
  testDir: './frontend/e2e',
  testMatch: 'sprint-2/**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    locale: 'en-GB',
    timezoneId: 'Asia/Colombo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node frontend/node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 4179 --strictPort',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://sprint2-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sprint2-public-placeholder',
      VITE_AI_ASSISTANT_ENABLED: 'true',
    },
  },
})
