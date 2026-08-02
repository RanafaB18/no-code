import { afterEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

/**
 * Unmount every mounted component after each test.
 *
 * Without this, wrappers stay mounted for the whole file, and several
 * things in this app are global rather than per-instance:
 *
 *  - `useToolShortcuts` binds a `keydown` listener to `window` per
 *    workspace, so N leaked workspaces toggle the armed tool N times on
 *    a single keypress. Tests asserting shortcut behaviour then pass or
 *    fail on whether N happens to be odd.
 *  - `useWorkspaceElements` holds module-level state, so every leaked
 *    workspace keeps re-rendering the same elements, multiplying any
 *    per-render measurement.
 *
 * Both are test-harness artifacts rather than product bugs — in the app
 * there is only ever one workspace — but they make tests depend on how
 * many tests ran before them.
 */
enableAutoUnmount(afterEach)
