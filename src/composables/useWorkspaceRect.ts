import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

import { onResizeFrame, viewportHeight, viewportWidth } from './useViewport'
import type { ViewPoint, ViewSize } from './useCanvasView'

/**
 * Where `.workspace` sits, in client pixels.
 *
 * The canvas used to own the whole window, so a client coordinate *was* a
 * workspace one and nothing had to convert between the two. Docking the
 * rails moved the canvas off the window's corner, and this is what the
 * two spaces are reconciled through — see `toWorkspacePoint`.
 *
 * Measured rather than derived from the rail widths on purpose: the CSS
 * owns the layout, and a second copy of those numbers here would be a
 * second thing to keep in step with it.
 */
export const workspaceOrigin = ref<ViewPoint>({ x: 0, y: 0 })

/** The canvas cell's own size, in client pixels. Zero until measured. */
export const workspaceRect = ref<ViewSize>({ width: 0, height: 0 })

/**
 * The size "fit" should centre a design inside.
 *
 * Falls back to the window whenever the cell has not been measured, which
 * covers two real cases rather than being defensive for its own sake: a
 * fit that runs before the first layout, and jsdom, which has no layout to
 * report and would otherwise hand every unit test a zero-sized view.
 */
export const workspaceSize = computed<ViewSize>(() => {
  const { width, height } = workspaceRect.value
  if (width > 0 && height > 0) return { width, height }
  return { width: viewportWidth.value, height: viewportHeight.value }
})

/**
 * A client point — typically straight off `event.clientX/clientY` — as a
 * workspace point.
 *
 * Every client *position* that will be compared against `pan` has to come
 * through here first. Distances do not: a delta between two client points
 * is already a workspace delta, since the origin cancels out of the
 * subtraction, which is why `toCanvasDelta` needs no partner to this.
 */
export function toWorkspacePoint(point: ViewPoint): ViewPoint {
  return {
    x: point.x - workspaceOrigin.value.x,
    y: point.y - workspaceOrigin.value.y,
  }
}

let element: HTMLElement | null = null

/**
 * Reads the cell's box into the refs above.
 *
 * The refs are a cache rather than each caller measuring for itself:
 * `toWorkspacePoint` runs on every pointermove of a draw, and a
 * `getBoundingClientRect` there would force layout on each one. The cache
 * can only go stale if the cell moves without resizing, and in this shell
 * it cannot — the rails are fixed grid tracks, so everything that shifts
 * the cell's origin also changes its size, which the observer below sees.
 */
export function measureWorkspace(): void {
  if (!element) return
  const box = element.getBoundingClientRect()
  workspaceOrigin.value = { x: box.left, y: box.top }
  workspaceRect.value = { width: box.width, height: box.height }
}

/**
 * Registers the canvas cell and keeps it measured. Called once, by
 * `BuilderWorkspace`, which owns the element.
 *
 * Measuring on mount is synchronous rather than deferred to `nextTick`:
 * Vue mounts children before parents, and `App.vue` fits the design to
 * this size in its own `onMounted`, so the measurement has to be in place
 * before the parent's hook runs.
 */
export function useWorkspaceRect(target: Ref<HTMLElement | null>): void {
  let observer: ResizeObserver | null = null

  onMounted(() => {
    element = target.value
    measureWorkspace()

    // jsdom has no ResizeObserver, and no layout for one to report on.
    if (typeof ResizeObserver === 'undefined' || !element) return

    // Throttled for the same reason as the window listener: this measures
    // the element and everything downstream of it re-measures in turn.
    observer = new ResizeObserver(onResizeFrame(measureWorkspace))
    observer.observe(element)
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
    element = null
    // Reset, so an isolated remount in a test starts from a known origin
    // rather than inheriting the last one measured.
    workspaceOrigin.value = { x: 0, y: 0 }
    workspaceRect.value = { width: 0, height: 0 }
  })

  // A window resize can move the cell without resizing it — a scrollbar
  // appearing, say — and covers browsers mid-load before the observer's
  // first callback.
  useEventListener(window, 'resize', onResizeFrame(measureWorkspace))
}
