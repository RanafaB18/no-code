import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  childrenOf,
  dragBy,
  drawFrame,
  expectBox,
  expectNear,
  openBuilder,
  rectOf,
  rootChildren,
} from './canvas'

/**
 * Constraints are only observable against a parent that changes size —
 * the whole claim is "this edge holds as the parent resizes", which needs
 * a browser to resize anything at all.
 */
test.describe('Constraints', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  /** A frame with a child drawn inside it, both selected in turn. */
  async function drawNested(page: import('@playwright/test').Page) {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 100, y: viewport.y + 160 }, { width: 600, height: 400 })

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    await drawFrame(page, { x: parent.x + 60, y: parent.y + 60 }, { width: 200, height: 120 })

    return { parentNode, parent, child: childrenOf(parentNode).first() }
  }

  test('a drawn frame is pinned to the edges it was drawn from', async ({ page }) => {
    const { child } = await drawNested(page)

    // Drawing states a position, which is a left and a top pin — and
    // nothing else, so the size is stated rather than derived.
    await expect(page.locator('[data-pin="left"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-pin="top"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-pin="right"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#field-width')).toBeVisible()
    expectBox(await rectOf(child), { width: 200 })
  })

  test('pinning both edges derives the size, and the frame stretches', async ({ page }) => {
    const { parentNode, parent, child } = await drawNested(page)

    await page.locator('[data-pin="right"]').click()

    // left: 60 and right: 0 across a 600 parent leaves 540.
    expectNear((await rectOf(child)).width, 540, 'stretched width')
    // The stated width is gone from the inspector, because the parent
    // decides it now — offering a box would imply otherwise.
    await expect(page.locator('#field-width')).toHaveCount(0)
    await expect(page.locator('#field-right')).toBeVisible()

    // Widen the parent: a derived size follows, where a stated one would
    // not. This is the entire point of modelling geometry as edge pins.
    await page.mouse.click(parent.x + 500, parent.y + 350)
    await page.fill('#field-width', '800')
    await expect(parentNode).toHaveCSS('width', '800px')

    expectNear((await rectOf(child)).width, 740, 'width after the parent grew')
  })

  test('pinning the far edge alone holds the frame against it', async ({ page }) => {
    const { parentNode, parent, child } = await drawNested(page)

    await page.locator('[data-pin="right"]').click()
    await page.fill('#field-right', '40')
    await page.locator('[data-pin="left"]').click()

    // Only `right` now, so the size is stated again and the frame sits
    // 40 in from the parent's right edge.
    await expect(page.locator('#field-width')).toBeVisible()
    const before = await rectOf(child)
    expectNear(before.x + before.width, parent.x + parent.width - 40, 'right edge')

    await page.mouse.click(parent.x + 500, parent.y + 350)
    await page.fill('#field-width', '800')
    await expect(parentNode).toHaveCSS('width', '800px')

    // It tracked the edge rather than staying where it was drawn.
    const after = await rectOf(child)
    expectNear(after.x + after.width, parent.x + 800 - 40, 'right edge after growth')
    expectNear(after.width, before.width, 'width unchanged')
  })

  test('the last pin on an axis cannot be removed', async ({ page }) => {
    await drawNested(page)

    // An axis with no pins has nothing positioning it, so the element
    // would fall back to where it would have sat in flow — a jump with no
    // visible cause. To move off an edge you pin the other one first.
    await expect(page.locator('[data-pin="left"]')).toBeDisabled()

    await page.locator('[data-pin="right"]').click()
    await expect(page.locator('[data-pin="left"]')).toBeEnabled()
  })

  test('resizing a stretched frame states its size again', async ({ page }) => {
    const { child } = await drawNested(page)
    await page.locator('[data-pin="right"]').click()

    const stretched = await rectOf(child)
    await dragBy(
      page,
      { x: stretched.x + stretched.width + 4, y: stretched.y + stretched.height / 2 },
      -140,
      0,
    )

    // Dragging an edge states a width, so the derived one gives way and
    // the pin it was deriving from is released.
    await expect(page.locator('#field-width')).toBeVisible()
    expectNear((await rectOf(child)).width, stretched.width - 140, 'width after resize')
  })
})
