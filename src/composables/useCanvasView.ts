import { computed, ref } from 'vue'

import { VIEWPORT_HEIGHT, VIEWPORT_ID, VIEWPORT_WIDTH, getNode } from './useCanvasNodes'

/** A point in whichever space the caller says — window px, or canvas px. */
export interface ViewPoint {
  x: number
  y: number
}

export interface ViewSize {
  width: number
  height: number
}

/** How far zoomed in or out the canvas is allowed to go. */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

/** Space left around the design when "fit" centres it. */
const FIT_MARGIN = 64

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * Where canvas point (0, 0) currently renders, in window pixels.
 *
 * `.workspace` is `position: fixed; inset: 0` (see BuilderWorkspace.vue),
 * so its own top-left is always the window's — there is no separate
 * "workspace-local" space to convert through first, and `pan` can be
 * compared against `event.clientX/clientY` directly. If that ever stops
 * being true, every read of `pan` below needs revisiting alongside it.
 */
export const pan = ref<ViewPoint>({ x: 0, y: 0 })

/** How many window pixels one canvas pixel currently renders as. */
export const zoom = ref(1)

/**
 * The transform that turns canvas content into what is on screen.
 *
 * Applied to the layer that wraps the node tree — see
 * `.workspace__canvas` in BuilderWorkspace.vue, which also carries
 * `transform-origin: 0 0`. The two have to agree: origin `0 0` is what
 * makes `pan` mean "where canvas (0, 0) lands" rather than some other
 * point on the layer.
 */
export const canvasTransform = computed(
  () => `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
)

/**
 * A window point — typically straight off `event.clientX/clientY` — as a
 * canvas point.
 *
 * The function every consumer that turns a pointer *position* into
 * something to store must go through. `toCanvasDelta` below is its
 * sibling for a *difference* between two window points — a drag distance
 * rather than a place — which does not need `pan` at all, since pan is
 * constant for the length of a single gesture and cancels out of any
 * subtraction.
 */
export function toCanvasPoint(point: ViewPoint): ViewPoint {
  return {
    x: (point.x - pan.value.x) / zoom.value,
    y: (point.y - pan.value.y) / zoom.value,
  }
}

/** A window-pixel distance as the same distance in canvas pixels. */
export function toCanvasDelta(delta: ViewPoint): ViewPoint {
  return { x: delta.x / zoom.value, y: delta.y / zoom.value }
}

export function panBy(dx: number, dy: number): void {
  pan.value = { x: pan.value.x + dx, y: pan.value.y + dy }
}

/**
 * Zooms by `factor`, keeping `anchor` — a window point, typically the
 * pointer — visually still.
 *
 * Without re-solving `pan` here, zooming would always scale from canvas
 * (0, 0), so the design would leap sideways under a cursor that was not
 * sitting exactly on top of it.
 */
export function zoomBy(factor: number, anchor: ViewPoint): void {
  const next = clampZoom(zoom.value * factor)
  if (next === zoom.value) return

  const canvasAnchor = toCanvasPoint(anchor)
  zoom.value = next
  pan.value = {
    x: anchor.x - canvasAnchor.x * next,
    y: anchor.y - canvasAnchor.y * next,
  }
}

/** Back to the untransformed view: canvas (0, 0) at the window's, 100%. */
export function resetView(): void {
  pan.value = { x: 0, y: 0 }
  zoom.value = 1
}

/**
 * Centres `rect` (canvas px) inside a `window`-sized view, zoomed to fit
 * it with `margin` window px to spare.
 */
export function fitToRect(
  rect: { left: number; top: number; width: number; height: number },
  window: ViewSize,
  margin = FIT_MARGIN,
): void {
  const availableWidth = Math.max(1, window.width - margin * 2)
  const availableHeight = Math.max(1, window.height - margin * 2)
  const next = clampZoom(Math.min(availableWidth / rect.width, availableHeight / rect.height))

  zoom.value = next
  pan.value = {
    x: window.width / 2 - (rect.left + rect.width / 2) * next,
    y: window.height / 2 - (rect.top + rect.height / 2) * next,
  }
}

/**
 * Centres the design's own canvas — the common case of `fitToRect`, and
 * what runs once when the app loads.
 *
 * Reads the viewport node's current geometry rather than assuming
 * `VIEWPORT_WIDTH`/`VIEWPORT_HEIGHT` at canvas (0, 0): the viewport can be
 * moved and resized like any other frame now, and "Fit" fitting where it
 * used to be, or the size it used to be, would defeat the point of the
 * button the moment either had changed.
 */
export function fitToDocument(window: ViewSize): void {
  const node = getNode(VIEWPORT_ID)
  fitToRect(
    {
      left: node?.left ?? 0,
      top: node?.top ?? 0,
      width: node?.width ?? VIEWPORT_WIDTH,
      height: node?.height ?? VIEWPORT_HEIGHT,
    },
    window,
  )
}

/**
 * Pan and zoom for the infinite canvas.
 *
 * Module-level, like `useCanvasNodes`'s document: there is one canvas
 * view, so every caller — the workspace panning and zooming it, the
 * inspector measuring a node to seed a pin — has to agree on the same
 * `zoom`. Functions are also exported directly, the way `useCanvasNodes`
 * exports `getNode` and friends, for callers like `nodeMeasure.ts` that
 * are plain modules rather than components.
 */
export function useCanvasView() {
  return {
    pan,
    zoom,
    canvasTransform,
    toCanvasPoint,
    toCanvasDelta,
    panBy,
    zoomBy,
    resetView,
    fitToRect,
    fitToDocument,
  }
}
