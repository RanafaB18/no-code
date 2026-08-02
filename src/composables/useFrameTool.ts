import { ref } from 'vue'

import { LAYOUT_VALUES } from './styleSchema'
import type { NodeLayout } from './useCanvasNodes'

/**
 * The default a new frame is drawn with.
 *
 * `none` means the frame imposes no layout, so *its children* position
 * themselves at the coordinates they were drawn at — which is what makes
 * drawing WYSIWYG. A frame set to flex or grid arranges its children
 * instead, discarding their drawn positions.
 */
export const DEFAULT_FRAME_LAYOUT: NodeLayout = 'none'

/**
 * The layout the Frame tool will stamp on the next frame it draws.
 *
 * Module-level for the same reason as the armed tool: the toolbar sets
 * it, the workspace reads it at creation time, and the keyboard shortcut
 * arms with whatever is currently chosen — all three have to agree.
 *
 * Choosing a layout deliberately does *not* arm the tool. Picking what to
 * draw and deciding to draw it are separate actions.
 */
export const frameLayout = ref<NodeLayout>(DEFAULT_FRAME_LAYOUT)

export function useFrameTool() {
  function setLayout(value: NodeLayout) {
    frameLayout.value = value
  }

  return { layout: frameLayout, layouts: LAYOUT_VALUES, setLayout }
}
