import { useThrottleFn, useWindowSize } from '@vueuse/core'

/**
 * One shared viewport size for the whole app.
 *
 * `useWindowSize()` registers its own resize listener per call, so every
 * panel calling it separately meant a listener each. Module scope gives
 * all callers the same two refs and a single listener.
 */
export const { width: viewportWidth, height: viewportHeight } = useWindowSize()

/**
 * Resize fires continuously while a window edge is dragged, and every
 * subscriber here responds by measuring the DOM (`offsetWidth` and
 * friends) and then writing a position back — reading and writing layout
 * in the same handler, once per event.
 *
 * One frame is enough to stay visually correct, so anything that reacts
 * to a resize by measuring should be wrapped in this.
 */
export function onResizeFrame(handler: () => void) {
  return useThrottleFn(handler, 1000 / 60)
}
