import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  canvasPoint,
  drawFrame,
  expectBox,
  expectNear,
  openBuilder,
  panBy,
  rectOf,
  rootChildren,
  workspaceBox,
} from './canvas'

/**
 * Guards that the canvas is treated as its own box rather than as the
 * whole window.
 *
 * Everything here is written against the canvas cell, never the window.
 * That is the whole point: the two used to be the same thing, and every
 * bug this file exists to catch is one where some coordinate quietly went
 * back to assuming they still are. Each was confirmed to fail — by half
 * the offset, or by the rail's full width — before its fix landed.
 */
test.describe('Docked shell', () => {
  test.beforeEach(async ({ page }) => openBuilder(page))

  test('gives the canvas a cell of its own, inset from the window', async ({ page }) => {
    const cell = await workspaceBox(page)
    const window = page.viewportSize()!

    // Rails on both sides and a bar above, so the canvas starts somewhere
    // other than (0, 0) and ends before the window does.
    expect(cell.x).toBeGreaterThan(0)
    expect(cell.y).toBeGreaterThan(0)
    expect(cell.width).toBeLessThan(window.width)
    expect(cell.height).toBeLessThan(window.height)
  })

  test('fit centres the design in the canvas cell, not the window', async ({ page }) => {
    await page.getByText('Fit', { exact: true }).click()

    const cell = await workspaceBox(page)
    const viewport = await rectOf(page.locator(VIEWPORT))

    expectNear(viewport.x + viewport.width / 2, cell.x + cell.width / 2, 'fit centre x')
    expectNear(viewport.y + viewport.height / 2, cell.y + cell.height / 2, 'fit centre y')
  })

  test('the zoom-in button anchors on the cell centre', async ({ page }) => {
    const cell = await workspaceBox(page)
    const center = { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 }

    const before = await rectOf(page.locator(VIEWPORT))
    await page.getByLabel('Zoom in').click()
    const after = await rectOf(page.locator(VIEWPORT))

    // Doubling about the cell centre: every distance from it doubles.
    expectNear(after.x - center.x, (before.x - center.x) * 2, 'anchored x')
    expectNear(after.y - center.y, (before.y - center.y) * 2, 'anchored y')
  })

  test('pinch-zoom holds the point under the pointer still', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 150 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const corner = await rectOf(frame)

    // Dispatched rather than driven through the mouse, so the anchor is an
    // exact client point rather than wherever a synthesised move landed.
    await page.locator('.workspace').dispatchEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: corner.x,
      clientY: corner.y,
    })
    // The selection frame re-measures on a throttled watcher.
    await page.waitForTimeout(50)

    const after = await rectOf(frame)
    expectBox(after, { x: corner.x, y: corner.y })
  })

  test('a frame drawn on bare canvas lands where it was drawn', async ({ page }) => {
    // The only path that rebases a drag onto the canvas origin instead of
    // onto a frame under the pointer, and the one with no other coverage:
    // every other drawing test starts its drag inside the page.
    const start = await canvasPoint(page, 200, 200)
    await page.mouse.click(start.x, start.y)
    // Pushes the design right, uncovering bare canvas along the cell's
    // left edge. The page itself does not move in canvas terms, which
    // keeps this about the conversion and nothing else.
    await panBy(page, start, 320, 0)

    const origin = await canvasPoint(page, 60, 240)
    const size = { width: 140, height: 100 }
    await drawFrame(page, origin, size)

    await expect(rootChildren(page)).toHaveCount(1)
    expectBox(await rectOf(rootChildren(page).first()), {
      x: origin.x,
      y: origin.y,
      ...size,
    })
  })

  test('a keystroke in the sidebar never reaches the canvas', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })

    // The rails are new chrome, and each had to be given the boundary by
    // hand once the floating panel that used to carry it was gone.
    await page.getByRole('tab', { name: 'Layers' }).focus()
    await page.keyboard.press('Backspace')

    await expect(rootChildren(page)).toHaveCount(1)
  })
})
