import { nextTick, onMounted, onUnmounted, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useDraggable } from '@vueuse/core'

import { onResizeFrame, viewportHeight, viewportWidth } from './useViewport'

export interface PanelSize {
  width: number
  height: number
}

/** Computes a panel's starting position from the space available to it. */
export type PanelAnchor = (viewport: PanelSize, panel: PanelSize) => { x: number; y: number }

/** How close to an edge a released panel must be before it snaps flush. */
const SNAP_THRESHOLD = 24

/** Gap left between a panel and the viewport edge at its anchor. Sits
 *  above SNAP_THRESHOLD so a freshly anchored panel floats rather than
 *  immediately snapping flush. */
const PANEL_MARGIN = 32

/**
 * How far above true centre `anchorRightMiddle` starts, as a fraction of
 * viewport height.
 *
 * A panel is measured at its collapsed size on mount but grows downward
 * from that point as content appears. Centring on the collapsed height
 * would therefore leave the populated panel sitting well below centre,
 * so it starts higher to absorb the growth.
 */
const GROWTH_BIAS = 0.25

export const anchorTopCenter: PanelAnchor = (viewport, panel) => ({
  x: (viewport.width - panel.width) / 2,
  y: PANEL_MARGIN,
})

export const anchorRightMiddle: PanelAnchor = (viewport, panel) => ({
  x: viewport.width - panel.width - PANEL_MARGIN,
  y: Math.max(PANEL_MARGIN, (viewport.height - panel.height) / 2 - viewport.height * GROWTH_BIAS),
})

/**
 * Makes a floating panel draggable and edge-snapping.
 *
 * Positioning is viewport-relative — the consuming component must be
 * `position: fixed`. That is what makes snapping meaningful: with
 * `absolute`, the same maths would target the document's edges, so a
 * panel snapped "to the bottom" would scroll out of sight. Being out of
 * flow either way, it still leaves the workspace at full width.
 *
 * Positions are not persisted: panels return to their anchor on every
 * load, and are only clamped (never re-anchored) afterwards, so a panel
 * stays where it was dragged for the rest of the session.
 *
 * The elements are passed in rather than created here. A ref returned
 * from a composable does not bind to a `ref="name"` template attribute —
 * the component has to own it via `useTemplateRef`, or the panel silently
 * never receives its drag listeners.
 *
 * @param elements the panel root, and the grab area within it (the panel
 *                 is mostly controls, so dragging from anywhere would
 *                 swallow clicks meant for them)
 * @param anchor   where the panel starts
 */
export function useDraggablePanel(
  elements: {
    panel: MaybeRefOrGetter<HTMLElement | null | undefined>
    handle: MaybeRefOrGetter<HTMLElement | null | undefined>
  },
  anchor: PanelAnchor,
) {
  const { panel, handle } = elements

  const { x, y, isDragging, style } = useDraggable(panel, {
    handle,
    // Suppresses the native text-selection drag that would otherwise
    // start as the pointer moves with the button held.
    preventDefault: true,
    onEnd: settle,
  })

  /**
   * Read straight off the element rather than through `useElementSize`:
   * that relies on ResizeObserver, which is unavailable in jsdom, and the
   * size is only needed at a few discrete moments rather than reactively.
   */
  function panelSize(): PanelSize {
    const element = toValue(panel)
    return { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0 }
  }

  /**
   * Keeps the panel fully on screen, then pulls it flush to any edge it
   * came to rest near.
   *
   * Deliberately clamps rather than re-anchors, so resizing the window
   * never yanks a panel away from where it was dragged.
   */
  function settle() {
    const { width, height } = panelSize()
    const maxX = Math.max(0, viewportWidth.value - width)
    const maxY = Math.max(0, viewportHeight.value - height)

    let nextX = Math.min(Math.max(x.value, 0), maxX)
    let nextY = Math.min(Math.max(y.value, 0), maxY)

    if (nextX <= SNAP_THRESHOLD) nextX = 0
    else if (maxX - nextX <= SNAP_THRESHOLD) nextX = maxX

    if (nextY <= SNAP_THRESHOLD) nextY = 0
    else if (maxY - nextY <= SNAP_THRESHOLD) nextY = maxY

    x.value = nextX
    y.value = nextY
  }

  /** Places the panel at its anchor. Runs once, on mount. */
  function applyAnchor() {
    const start = anchor({ width: viewportWidth.value, height: viewportHeight.value }, panelSize())
    x.value = start.x
    y.value = start.y
    settle()
  }

  // After a tick, so the panel has been laid out and reports a real size.
  onMounted(() => nextTick(applyAnchor))

  /**
   * A panel does not keep the height it was anchored at: expanding a
   * section or revealing a property grows it downward from a position
   * chosen when it was shorter, until its lower half hangs past the bottom
   * of the window. Capping the height with `max-height` does not save it —
   * the overflowing part of the *box* is still off screen, so scrolling
   * inside the panel can never bring those controls back into reach.
   *
   * Re-settling on the panel's own size clamps it back into the window
   * without re-anchoring it, so it still stays wherever it was dragged.
   */
  let observer: ResizeObserver | null = null

  onMounted(() => {
    // jsdom has no ResizeObserver, and no layout for one to report on.
    if (typeof ResizeObserver === 'undefined') return

    const element = toValue(panel)
    if (!element) return

    // Throttled for the same reason as the window listener: this measures
    // the panel and then writes its position back.
    observer = new ResizeObserver(onResizeFrame(settle))
    observer.observe(element)
  })

  onUnmounted(() => observer?.disconnect())

  // Throttled: settle() measures the panel and then writes its position,
  // so running it on every raw resize event thrashes layout.
  watch([viewportWidth, viewportHeight], onResizeFrame(settle))

  // `settle` is exposed for panels that change their own dimensions —
  // switching layout leaves a position that may no longer fit.
  return { isDragging, style, settle }
}
