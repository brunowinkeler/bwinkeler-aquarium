import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:8787';

// The whole system runs locally: `wrangler dev` serves the built PWA, /tv/ and the API.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'pt-BR' } }],
  webServer: {
    command: 'npm run dev:e2e -w @bwinkeler-aquarium/backend',
    url: `${baseURL}/health/live`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
