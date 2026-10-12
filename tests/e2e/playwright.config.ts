import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const hostname = process.env.DEMO_HOSTNAME ?? 'comms-demo.home.arpa';

// The "What's new" dialog is modal and would cover every page in the other tests, so they start as if it had been seen.
// Its own test (profile-offboarding scenario 9) overrides this with an empty storage state.
const appVersion = JSON.parse(readFileSync(path.join(__dirname, '../../apps/web/package.json'), 'utf8')).version as string;
export const WHATS_NEW_SEEN = { name: 'nexus:whats-new-seen', value: appVersion };

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
    storageState: { cookies: [], origins: [{ origin: `https://${hostname}`, localStorage: [WHATS_NEW_SEEN] }] },
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
