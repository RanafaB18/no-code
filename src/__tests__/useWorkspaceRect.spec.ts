import { beforeEach, describe, expect, it } from 'vitest'

import { viewportHeight, viewportWidth } from '../composables/useViewport'
import {
  toWorkspacePoint,
  workspaceOrigin,
  workspaceRect,
  workspaceSize,
} from '../composables/useWorkspaceRect'

beforeEach(() => {
  workspaceOrigin.value = { x: 0, y: 0 }
  workspaceRect.value = { width: 0, height: 0 }
})

describe('toWorkspacePoint', () => {
  it('is the identity while the canvas sits at the window corner', () => {
    expect(toWorkspacePoint({ x: 120, y: 90 })).toEqual({ x: 120, y: 90 })
  })

  it('subtracts the canvas cell origin from a client point', () => {
    workspaceOrigin.value = { x: 240, y: 48 }

    expect(toWorkspacePoint({ x: 300, y: 100 })).toEqual({ x: 60, y: 52 })
  })

  it('goes negative for a point left of or above the cell', () => {
    workspaceOrigin.value = { x: 240, y: 48 }

    // A pointer over the left rail is outside the canvas, not clamped to
    // its edge — capture keeps events flowing during a drag that strays
    // there, and the drag should keep tracking rather than sticking.
    expect(toWorkspacePoint({ x: 100, y: 10 })).toEqual({ x: -140, y: -38 })
  })
})

describe('workspaceSize', () => {
  it('reports the cell once it has been measured', () => {
    workspaceRect.value = { width: 1104, height: 1152 }

    expect(workspaceSize.value).toEqual({ width: 1104, height: 1152 })
  })

  it('falls back to the window before the first measurement', () => {
    // Nothing has measured, which is also every jsdom test's state — a
    // zero-sized view here would make "fit" divide by nothing.
    expect(workspaceSize.value).toEqual({
      width: viewportWidth.value,
      height: viewportHeight.value,
    })
  })
})
