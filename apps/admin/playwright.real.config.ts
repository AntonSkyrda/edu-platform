import { defineConfig, devices } from '@playwright/test';

// Fixed, dedicated loopback ports deliberately fail when already occupied.
export default defineConfig({
  testDir: './e2e-real',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/real', open: 'never' }],
  ],
  outputDir: 'test-results/real',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/test/admin-e2e-server.cjs',
      url: 'http://127.0.0.1:3101/health/ready',
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    },
    {
      command:
        'pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      env: { VITE_API_URL: 'http://127.0.0.1:3101', NODE_ENV: 'production' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
