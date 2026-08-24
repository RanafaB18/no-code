import { ref } from 'vue'

import type { ViewPoint } from './useCanvasView'
import type { NodeId } from './useCanvasNodes'

/**
 * The frame currently being dragged, and how far it has come.
 *
 * Separate from the workspace's own gesture bookkeeping because the node
 * being dragged has to know: it draws itself translucent, and a frame its
 * parent lays out has to follow the pointer by a transform, since moving
 * it for real would reflow the row out from under the drag.
 *
 * Module-level for the same reason as `pan` and the armed tool — the
 * workspace writes it, the renderer reads it, and there is only ever one
 * drag in flight.
 */
export const draggingId = ref<NodeId | null>(null)

/**
 * How far the dragged frame has moved, in canvas pixels.
 *
 * Only used for a frame whose parent places it. One that positions itself
 * is moved by writing its offsets, so it is already where the pointer is
 * and adding this on top would move it twice.
 */
export const dragOffset = ref<ViewPoint>({ x: 0, y: 0 })

export function beginDrag(id: NodeId): void {
  draggingId.value = id
  dragOffset.value = { x: 0, y: 0 }
}

export function endDrag(): void {
  draggingId.value = null
  dragOffset.value = { x: 0, y: 0 }
}
