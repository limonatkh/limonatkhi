// Playwright settings for the Lemonat tests (see tests/README.md).
// Three groups:
//   blocking      must pass before a pull request is merged
//   known-issues  bugs that already exist in the game, written as test.fail() (documented, never blocking)
//   unstable      tests that did not pass every time; they run and report, but do not block (see tests/README.md)
//   baseline      not a test: rewrites tests/baseline/*.json (npm run baseline)
const { defineConfig } = require('@playwright/test');

const PORT = 8765;

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,                       // WebGL in software (swiftshader) is slow; one page at a time is the most stable
  retries: 0,                       // a test that needs a retry is unstable: it goes to the "unstable" group instead
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'blocking', testDir: 'tests/e2e', grepInvert: /@unstable/ },
    { name: 'unstable', testDir: 'tests/e2e', grep: /@unstable/ },
    { name: 'known-issues', testDir: 'tests/known-issues' },
    { name: 'baseline', testDir: 'tests/tools' },         // npm run baseline: rewrites tests/baseline/*.json (on purpose only)
  ],
  webServer: {
    command: `node tests/helpers/server.js ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
