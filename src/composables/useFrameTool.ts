import { ref } from 'vue'

import { DISPLAY_VALUES, type DisplayValue } from './styleSchema'

/**
 * The `display` the Frame tool will stamp on the next element it draws.
 *
 * Module-level for the same reason as the armed tool: the toolbar sets
 * it, the workspace reads it at creation time, and the keyboard shortcut
 * arms with whatever is currently chosen — all three have to agree.
 *
 * Choosing a display deliberately does *not* arm the tool. Picking what
 * to draw and deciding to draw it are separate actions.
 */
export const frameDisplay = ref<DisplayValue>('block')

export function useFrameTool() {
  function setDisplay(value: DisplayValue) {
    frameDisplay.value = value
  }

  return { display: frameDisplay, displays: DISPLAY_VALUES, setDisplay }
}
