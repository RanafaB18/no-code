import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { toCanvasLocal } from '../composables/nodeMeasure'
import { pan, resetView, zoom } from '../composables/useCanvasView'

/**
 * A stand-in for a real container element, with `getBoundingClientRect`,
 * `clientLeft` and `clientTop` set directly rather than produced by real
 * layout.
 *
 * jsdom has no box model — every real element measures as a zero rect —
 * so the only way to exercise `toCanvasLocal`'s actual arithmetic,
 * including the border-under-zoom case that is silently wrong at zoom 1,
 * is to hand it numbers it did not have to lay anything out to produce.
 */
function fakeContainer(rect: { left: number; top: number }, border = 0): HTMLElement {
  return {
    getBoundingClientRect: () => ({ ...rect, width: 0, height: 0, right: 0, bottom: 0 }) as DOMRect,
    clientLeft: border,
    clientTop: border,
  } as unknown as HTMLElement
}

beforeEach(() => {
  resetView()
})

afterEach(() => {
  resetView()
})

describe('toCanvasLocal', () => {
  it('matches a plain subtraction at zoom 1', () => {
    const container = fakeContainer({ left: 50, top: 20 }, 10)

    const local = toCanvasLocal({ left: 210, top: 120, width: 100, height: 80 }, container)

    // Border width is real canvas px either way at zoom 1, so subtracting
    // it directly is correct here — the case this function exists for
    // only shows up once zoom is not 1.
    expect(local).toEqual({ left: 150, top: 90, width: 100, height: 80 })
  })

  it('does not scale the border width, only the screen distance', () => {
    zoom.value = 2
    // A container whose padding box starts 10 *canvas* px in from its
    // border box — 20 screen px at this zoom — is what a 10px CSS border
    // renders as once painted.
    const container = fakeContainer({ left: 100, top: 100 }, 10)

    const local = toCanvasLocal({ left: 340, top: 340, width: 60, height: 40 }, container)

    // (340 - 100) / 2 - 10 = 110, not (340 - 100 - 10) / 2 = 115 — the
    // wrong formula that dividing the whole `toLocal` output by zoom
    // would silently produce, and that is indistinguishable from this one
    // at zoom 1.
    expect(local).toEqual({ left: 110, top: 110, width: 30, height: 20 })
  })

  it('is unaffected by pan, which cancels in the subtraction', () => {
    pan.value = { x: 900, y: -400 }
    zoom.value = 1.5
    const container = fakeContainer({ left: 900 + 50, top: -400 + 30 })

    const local = toCanvasLocal(
      { left: 900 + 50 + 75, top: -400 + 30 + 45, width: 30, height: 30 },
      container,
    )

    expect(local.left).toBeCloseTo(50)
    expect(local.top).toBeCloseTo(30)
  })
})
