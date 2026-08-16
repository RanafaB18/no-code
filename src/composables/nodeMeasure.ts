import { getNode, type NodeId } from './useCanvasNodes'
import { zoom } from './useCanvasView'

/** A box, in whatever space the caller rebased it onto. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Measuring a node, for the callers that legitimately need to.
 *
 * Deliberately outside the store: geometry in the store is *stated*, and
 * mixing measured values in would blur which is which. Deliberately
 * outside the workspace too, because the inspector needs it as well —
 * pinning an element where it currently stands means knowing where that
 * is, and duplicating this would let the two drift.
 *
 * Node ids are unique in the document, so scoping to `document` is
 * equivalent to scoping to the workspace and works from a panel that
 * knows nothing about the canvas's root element.
 */
export function nodeElement(id: NodeId | null | undefined): HTMLElement | null {
  if (!id) return null
  return document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
}

/**
 * Rebases a viewport-relative box onto `container`'s **padding box** —
 * the coordinate space both absolute offsets and workspace overlays live
 * in.
 *
 * Both rects are viewport-relative, so subtracting them cancels page
 * scroll — and unlike offsetLeft/offsetTop the result holds regardless of
 * which ancestor happens to be the offsetParent.
 *
 * `clientLeft`/`clientTop` are the container's own border widths, which
 * sit between its border box and the padding box the offsets resolve
 * from. Skip them and every child of a bordered frame lands short by the
 * border's width.
 *
 * A null container means "already in the right space" — the caller had
 * nothing to rebase onto.
 */
export function toLocal(box: Rect, container: HTMLElement | null): Rect {
  if (!container) return { ...box }

  const origin = container.getBoundingClientRect()
  return {
    left: box.left - origin.left - container.clientLeft,
    top: box.top - origin.top - container.clientTop,
    width: box.width,
    height: box.height,
  }
}

/**
 * Like `toLocal`, but the answer is in **canvas** pixels rather than
 * whatever screen size the box currently renders at.
 *
 * Not simply `toLocal`'s result divided by zoom afterwards.
 * `container.clientLeft`/`clientTop` (its own border width) are reported
 * in canvas units regardless of zoom — a CSS transform changes how an
 * element paints, never its own layout geometry — while `box` and the
 * container's `getBoundingClientRect()` are in screen units. Dividing the
 * whole difference by zoom would divide the already-canvas-unit border
 * width too, which only shows up once zoom is not 1: the screen part has
 * to be converted *before* the border is subtracted, not after.
 */
export function toCanvasLocal(box: Rect, container: HTMLElement): Rect {
  const z = zoom.value
  const origin = container.getBoundingClientRect()
  return {
    left: (box.left - origin.left) / z - container.clientLeft,
    top: (box.top - origin.top) / z - container.clientTop,
    width: box.width / z,
    height: box.height / z,
  }
}

/**
 * A node's box in **parent-local canvas** pixels — the same space its
 * pins live in, so a measurement can stand in for a pin the node does not
 * carry.
 */
export function measureNodeRect(id: NodeId): Rect | null {
  const element = nodeElement(id)
  const parent = nodeElement(getNode(id)?.parentId)
  if (!element || !parent) return null
  return toCanvasLocal(element.getBoundingClientRect(), parent)
}
