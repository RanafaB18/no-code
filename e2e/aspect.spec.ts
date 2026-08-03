import { expect, test } from '@playwright/test'

import { VIEWPORT, dragBy, drawFrame, expectBox, openBuilder, rectOf, rootChildren } from './canvas'

/**
 * The lock is a claim about shape, and shape is what a browser resolves —
 * a stored width and height say nothing about the box actually drawn. The
 * drag cases especially: those go through pointer deltas against a
 * measured selection frame, none of which exists in jsdom.
 */
test.describe('Aspect ratio lock', () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page)
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 300, height: 200 })
  })

  const lock = '#field-aspectRatio'

  test('captures the shape it was engaged on', async ({ page }) => {
    await expect(page.locator(lock)).toHaveAttribute('aria-pressed', 'false')

    await page.locator(lock).click()

    await expect(page.locator(lock)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(lock)).toContainText('1.50')
  })

  test('carries the other axis when a size is typed', async ({ page }) => {
    await page.locator(lock).click()
    await page.fill('#field-width', '600')

    // 600 at 3:2 is 400 — and the field has to show it, or the panel would
    // be describing a box other than the one on screen.
    await expect(page.locator('#field-height')).toHaveValue('400')
    expectBox(await rectOf(rootChildren(page).first()), { width: 600, height: 400 })
  })

  test('holds the shape while an edge handle is dragged', async ({ page }) => {
    await page.locator(lock).click()

    const box = await rectOf(rootChildren(page).first())
    // The right-middle grip, which alone would only ever change the width.
    await dragBy(page, { x: box.x + box.width + 4, y: box.y + box.height / 2 }, 150, 0)

    expectBox(await rectOf(rootChildren(page).first()), { width: 450, height: 300 })
  })

  test('lets the pointer choose which axis leads a corner drag', async ({ page }) => {
    await page.locator(lock).click()

    const box = await rectOf(rootChildren(page).first())
    const corner = { x: box.x + box.width + 4, y: box.y + box.height + 4 }
    // Mostly vertical, so the height leads and the width follows it —
    // deriving the same axis every time would make this drag do nothing.
    await dragBy(page, corner, 10, 100)

    expectBox(await rectOf(rootChildren(page).first()), { width: 450, height: 300 })
  })

  test('is not offered for an axis the node does not state', async ({ page }) => {
    // `fit` is decided by the contents, so there is no number here to
    // scale and no shape the lock could hold.
    await page.selectOption('#field-heightMode', 'fit')

    await expect(page.locator(lock)).toHaveCount(0)
  })
})
