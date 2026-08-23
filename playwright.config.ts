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

  // The canvas is a fixed 1440x1024 page, and there is no browser
  // scrollbar to fall back on — the workspace pans and zooms internally
  // rather than participating in page scroll.
  //
  // The canvas is also only the cell between the docked rails, so at this
  // window it is roughly 1100x1150: enough for most of the design at zoom
  // 1, but not all 1440 of its width. A test that needs to reach further
  // than that should `zoomTo(page, 0.5)` first, or pan the part it cares
  // about into the cell — widening the window here is the last resort,
  // since every coordinate in the suite is already relative to the cell
  // or to the design's own box.
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 1200 },
    trace: 'on-first-retry',
  },

  // `devices['Desktop Chrome']` carries its own `viewport`, and a
  // project's `use` is applied after (so it wins over) the top-level one
  // above — spread the device first and the override second, or every
  // test silently runs at the device preset's 1280x720 instead of the
  // 1600x1200 asked for above. That was invisible until a test finally
  // needed to reach past x≈1280, which none had before.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1200 } },
    },
  ],

  // Fail the build rather than pass silently on a stray `.only`.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
