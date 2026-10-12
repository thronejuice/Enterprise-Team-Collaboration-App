import { defineConfig } from '@playwright/test';

/** Screenshots for docs/USER-MANUAL.md. Run on a demo database only: tests/e2e/run.sh -c playwright.manual.config.ts */
const hostname = process.env.DEMO_HOSTNAME ?? 'comms-demo.home.arpa';

export default defineConfig({
  testDir: '.',
  testMatch: 'manual-screenshots.spec.ts',
  timeout: 900_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: './results/manual-trace',
  use: {
    baseURL: `https://${hostname}`,
    ignoreHTTPSErrors: false,
    viewport: { width: 1280, height: 800 },
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--auto-accept-this-tab-capture',
        '--auto-select-tab-capture-source-by-title=Shared Content Slide',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
});
