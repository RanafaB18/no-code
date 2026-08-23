import { test } from '@playwright/test'

import { VIEWPORT, expectNear, openBuilder, rectOf, workspaceBox } from './canvas'

/**
 * Guards that the canvas is treated as its own box rather than as the
 * whole window.
 *
 * These are written against the canvas cell deliberately, not the window:
 * that is what makes them survive the rails being docked, and what makes
 * them catch a fit or a zoom that has quietly gone back to centring on
 * the window. Both were confirmed to fail — by half the offset, exactly —
 * against a workspace displaced from the window's corner.
 */
test.describe('Canvas cell', () => {
  test.beforeEach(async ({ page }) => openBuilder(page))

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
})
