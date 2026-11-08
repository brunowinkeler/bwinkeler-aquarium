import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL points the same suite at a deployed origin (post-deploy smoke); no local server then.
const remoteBaseURL = process.env.E2E_BASE_URL;
const baseURL = remoteBaseURL ?? 'http://127.0.0.1:8787';

// By default the whole system runs locally: `wrangler dev` serves the built PWA, /tv/ and the API.
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
  webServer: remoteBaseURL
    ? undefined
    : {
        command: 'npm run dev:e2e -w @bwinkeler-aquarium/backend',
        url: `${baseURL}/health/live`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
