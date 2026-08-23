import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  canvasPoint,
  drawFrame,
  dragBy,
  expectBox,
  expectNear,
  openBuilder,
  panBy,
  rectOf,
  rootChildren,
  zoomTo,
} from './canvas'

/**
 * Pan and zoom introduce a real distinction jsdom cannot express at all —
 * a *canvas* pixel and a *window* pixel stop being the same thing. Every
 * other spec in this suite runs at the zoom `openBuilder` resets to, which
 * makes real pixels and canvas ones interchangeable and would hide a
 * conversion bug completely. These tests exist specifically to not do
 * that: they check the stored canvas value against a real, deliberately
 * non-1 zoom, not just that a round trip came back to where it started.
 */
test.describe('Canvas view', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  test('drawing at 50% zoom stores the canvas size, not the screen one', async ({ page }) => {
    await zoomTo(page, 0.5)
    const viewport = await rectOf(page.locator(VIEWPORT))

    // Chosen to divide evenly by the zoom factor, so the expected canvas
    // values are exact rather than rounded.
    const origin = { x: viewport.x + 40, y: viewport.y + 60 }
    await drawFrame(page, origin, { width: 120, height: 80 })

    // Drawing selects what it drew, so the inspector already reflects it.
    await expect(page.locator('#field-left')).toHaveValue('80')
    await expect(page.locator('#field-top')).toHaveValue('120')
    await expect(page.locator('#field-width')).toHaveValue('240')
    await expect(page.locator('#field-height')).toHaveValue('160')

    // And what actually renders is still the real box that was drawn —
    // the point of storing canvas units is that this stays true at every
    // zoom, not only at 1.
    expectBox(await rectOf(rootChildren(page).first()), { ...origin, width: 120, height: 80 })
  })

  test('drawing at 200% zoom stores the canvas size, not the screen one', async ({ page }) => {
    await zoomTo(page, 2)
    const viewport = await rectOf(page.locator(VIEWPORT))

    const origin = { x: viewport.x + 40, y: viewport.y + 60 }
    await drawFrame(page, origin, { width: 120, height: 80 })

    await expect(page.locator('#field-left')).toHaveValue('20')
    await expect(page.locator('#field-top')).toHaveValue('30')
    await expect(page.locator('#field-width')).toHaveValue('60')
    await expect(page.locator('#field-height')).toHaveValue('40')

    expectBox(await rectOf(rootChildren(page).first()), { ...origin, width: 120, height: 80 })
  })

  test('resizing at 200% zoom converts the screen drag back to canvas units', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 40, y: viewport.y + 40 }, { width: 100, height: 100 })

    await zoomTo(page, 2)
    const box = await rectOf(rootChildren(page).first())

    // A 40-screen-px drag at 2x is 20 canvas px.
    await dragBy(page, { x: box.x + box.width + 4, y: box.y + box.height / 2 }, 40, 0)

    await expect(page.locator('#field-width')).toHaveValue('120')
  })

  test('panning moves what is on screen without touching stored geometry', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    const origin = { x: viewport.x + 50, y: viewport.y + 50 }
    await drawFrame(page, origin, { width: 100, height: 60 })

    const before = await rectOf(rootChildren(page).first())
    const left = await page.locator('#field-left').inputValue()
    const top = await page.locator('#field-top').inputValue()

    await panBy(page, { x: viewport.x + 400, y: viewport.y + 400 }, 120, -80)

    // The screen box followed the pan by exactly the pan's own delta.
    expectBox(await rectOf(rootChildren(page).first()), {
      x: before.x + 120,
      y: before.y - 80,
      width: before.width,
      height: before.height,
    })
    // Nothing about the element itself changed — panning is the view
    // moving, not the content.
    await expect(page.locator('#field-left')).toHaveValue(left)
    await expect(page.locator('#field-top')).toHaveValue(top)
  })

  test('resize handles stay the same screen size at every zoom', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 40, y: viewport.y + 40 }, { width: 100, height: 100 })

    const handle = page.locator('[data-handle="right"]')
    const at1x = await rectOf(handle)

    await zoomTo(page, 4)

    const at4x = await rectOf(handle)
    expectNear(at4x.width, at1x.width, 'handle width')
    expectNear(at4x.height, at1x.height, 'handle height')
  })

  /** Clear space between the bar and the frame — VIEWPORT_BAR_GAP. */
  const BAR_GAP = 8

  test('the viewport bar floats a fixed gap above the frame when there is room', async ({
    page,
  }) => {
    // openBuilder's own last step leaves focus on the reset-zoom button,
    // which sits inside a shortcut boundary — space correctly does
    // nothing there. A press on the canvas moves focus onto it first, the
    // same way drawing does in every other pan test, before space-drag
    // panning is asked to do anything.
    const from = await canvasPoint(page, 400, 300)
    await page.mouse.click(from.x, from.y)
    await panBy(page, from, 0, 250)

    const bar = await rectOf(page.locator('.workspace__viewport-bar'))
    const viewport = await rectOf(page.locator(VIEWPORT))

    // Detached, not attached: it reads as a tab belonging to the frame
    // rather than a header inside the page being designed.
    expectNear(viewport.y - (bar.y + bar.height), BAR_GAP, 'gap above frame')
    expectNear(bar.x, viewport.x, 'bar left against frame left')
  })

  test('the viewport bar keeps its gap at every zoom, in screen pixels', async ({ page }) => {
    const from = await canvasPoint(page, 400, 300)
    await page.mouse.click(from.x, from.y)
    await panBy(page, from, 0, 250)
    await zoomTo(page, 2)

    const bar = await rectOf(page.locator('.workspace__viewport-bar'))
    const viewport = await rectOf(page.locator(VIEWPORT))

    // Screen pixels, not canvas ones — scaled with the canvas, the gap
    // would collapse to nothing zoomed out and yawn open zoomed in.
    expectNear(viewport.y - (bar.y + bar.height), BAR_GAP, 'gap at 2x zoom')
  })

  test('the viewport bar stays on screen when there is no room above the frame', async ({
    page,
  }) => {
    // The default, unpanned position: the design is centred against the
    // canvas cell's own top, so there is nowhere above the frame to float.
    // This is the *common* state, not an edge case — and the bar is the
    // only way to select the viewport, so it must not be clipped away.
    const viewport = await rectOf(page.locator(VIEWPORT))
    const bar = await rectOf(page.locator('.workspace__viewport-bar'))

    expect(bar.y).toBeGreaterThanOrEqual(0)
    // Tucked just inside the frame's top edge instead of above it.
    expectNear(bar.y - viewport.y, BAR_GAP, 'inset below frame top')
  })
})
