import { defineConfig } from '@playwright/test';

const hostname = process.env.DEMO_HOSTNAME ?? 'comms-demo.home.arpa';

export default defineConfig({
  testDir: '.',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './results',
  use: {
    baseURL: `https://${hostname}`,
    // The mkcert root CA is installed into the container's NSS store by run.sh; HTTPS errors are NOT ignored.
    ignoreHTTPSErrors: false,
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
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
