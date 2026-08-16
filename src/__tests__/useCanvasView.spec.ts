import { beforeEach, describe, expect, it } from 'vitest'

import {
  fitToRect,
  pan,
  panBy,
  resetView,
  toCanvasDelta,
  toCanvasPoint,
  zoom,
  zoomBy,
} from '../composables/useCanvasView'

beforeEach(() => {
  resetView()
})

describe('useCanvasView', () => {
  describe('toCanvasPoint', () => {
    it('is the identity at the untransformed view', () => {
      expect(toCanvasPoint({ x: 130, y: 40 })).toEqual({ x: 130, y: 40 })
    })

    it('accounts for pan and zoom together', () => {
      pan.value = { x: 100, y: 50 }
      zoom.value = 2

      // A window point 100px right of pan's x, at 2x, is 50 canvas px in.
      expect(toCanvasPoint({ x: 200, y: 150 })).toEqual({ x: 50, y: 50 })
    })

    it('round-trips through the screen at several zooms', () => {
      pan.value = { x: -340, y: 220 }
      for (const z of [0.25, 0.5, 1, 2, 4]) {
        zoom.value = z
        const canvasPoint = { x: 173, y: -42 }
        const screenPoint = {
          x: canvasPoint.x * z + pan.value.x,
          y: canvasPoint.y * z + pan.value.y,
        }
        const back = toCanvasPoint(screenPoint)
        expect(back.x).toBeCloseTo(canvasPoint.x)
        expect(back.y).toBeCloseTo(canvasPoint.y)
      }
    })
  })

  describe('toCanvasDelta', () => {
    it('ignores pan — only the scale matters for a difference', () => {
      pan.value = { x: 500, y: -300 }
      zoom.value = 2

      expect(toCanvasDelta({ x: 40, y: -20 })).toEqual({ x: 20, y: -10 })
    })

    it('is the identity at zoom 1 regardless of pan', () => {
      pan.value = { x: 777, y: -12 }
      zoom.value = 1

      expect(toCanvasDelta({ x: 9, y: 9 })).toEqual({ x: 9, y: 9 })
    })
  })

  describe('panBy', () => {
    it('accumulates rather than replacing', () => {
      panBy(10, -5)
      panBy(5, 5)

      expect(pan.value).toEqual({ x: 15, y: 0 })
    })
  })

  describe('zoomBy', () => {
    it('keeps the anchor point visually still', () => {
      pan.value = { x: 20, y: 30 }
      zoom.value = 1
      const anchor = { x: 400, y: 300 }
      const canvasUnderAnchor = toCanvasPoint(anchor)

      zoomBy(2, anchor)

      expect(zoom.value).toBe(2)
      // The same canvas point still renders under the same window point.
      const after = toCanvasPoint(anchor)
      expect(after.x).toBeCloseTo(canvasUnderAnchor.x)
      expect(after.y).toBeCloseTo(canvasUnderAnchor.y)
    })

    it('clamps rather than zooming without bound', () => {
      zoomBy(1000, { x: 0, y: 0 })
      expect(zoom.value).toBeLessThan(1000)

      zoomBy(0.0001, { x: 0, y: 0 })
      expect(zoom.value).toBeGreaterThan(0)
    })
  })

  describe('fitToRect', () => {
    it('centres the rect and scales it to fit within the margin', () => {
      fitToRect({ left: 0, top: 0, width: 1440, height: 1024 }, { width: 1000, height: 1000 }, 0)

      // The narrower dimension (relative to the design's own aspect
      // ratio) governs the zoom: width is the binding constraint here.
      expect(zoom.value).toBeCloseTo(1000 / 1440)

      // The design's own centre lands on the window's centre.
      const centreOnScreen = {
        x: (0 + 1440 / 2) * zoom.value + pan.value.x,
        y: (0 + 1024 / 2) * zoom.value + pan.value.y,
      }
      expect(centreOnScreen.x).toBeCloseTo(500)
      expect(centreOnScreen.y).toBeCloseTo(500)
    })

    it('respects the margin', () => {
      fitToRect({ left: 0, top: 0, width: 100, height: 100 }, { width: 300, height: 300 }, 50)

      // 300 - 2*50 = 200 available, so a 100-wide rect fits at exactly 2x.
      expect(zoom.value).toBeCloseTo(2)
    })
  })

  describe('resetView', () => {
    it('returns to identity', () => {
      pan.value = { x: 500, y: -200 }
      zoom.value = 3

      resetView()

      expect(pan.value).toEqual({ x: 0, y: 0 })
      expect(zoom.value).toBe(1)
    })
  })
})
