import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests, for the things jsdom cannot answer.
 *
 * The vitest suite covers store logic and render isolation in
 * milliseconds; it is deliberately still the place for those. What it
 * cannot do is *layout* — jsdom has no box model, so every
 * getBoundingClientRect there returns zeros. Anything asserting where a
 * node actually lands belongs here, in a real browser.
 */
export default defineConfig({
  testDir: './e2e',

  // The canvas is a fixed 1440x1024 page. A viewport smaller than that
  // would put it behind a scrollbar and make every coordinate assertion
  // depend on where the page happened to be scrolled.
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 1200 },
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Fail the build rather than pass silently on a stray `.only`.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
