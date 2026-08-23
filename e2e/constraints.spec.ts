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

    // Pinning a still-unpinned edge locks it at whatever it currently
    // measures, not a hardcoded distance — so the frame does not jump the
    // moment the second edge locks in. 60 left, 200 wide, in a 600 parent
    // leaves 340 to the right edge.
    await page.locator('[data-pin="right"]').click()
    await expect(page.locator('#field-right')).toHaveValue('340')
    expectNear((await rectOf(child)).width, 200, 'width unchanged by pinning')

    // The parent decides the width now, but the field still shows the
    // real current size rather than disappearing, same as an unpinned
    // edge does.
    await expect(page.locator('#field-width')).toHaveValue('200')

    // Widen the parent: a derived size follows, where a stated one would
    // not. This is the entire point of modelling geometry as edge pins.
    await page.mouse.click(parent.x + 500, parent.y + 350)
    await page.fill('#field-width', '800')
    await expect(parentNode).toHaveCSS('width', '800px')

    // 800 wide, minus the 60 left and 340 right that stayed fixed.
    expectNear((await rectOf(child)).width, 400, 'width after the parent grew')
  })

  test('typing into a derived width states it, releasing the far pin', async ({ page }) => {
    const { child } = await drawNested(page)
    await page.locator('[data-pin="right"]').click()

    const before = await rectOf(child)
    await page.fill('#field-width', '150')

    // Typing states the width explicitly, which only one edge can still
    // define — the far one gives way, the near one (what it was drawn
    // from) stays the anchor.
    await expect(page.locator('[data-pin="left"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-pin="right"]')).toHaveAttribute('aria-pressed', 'false')

    const after = await rectOf(child)
    expectNear(after.width, 150, 'stated width applied')
    expectNear(after.x, before.x, 'left edge stayed anchored')
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

  test('unpinning an axis down to none makes it proportional, not stuck', async ({ page }) => {
    const { parentNode, parent, child } = await drawNested(page)

    // Left is the only pin on the width axis. Un-pinning it has nowhere
    // else to fall back to, so the axis becomes proportional instead of
    // the button refusing the click.
    await page.locator('[data-pin="left"]').click()
    await expect(page.locator('[data-pin="left"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-pin="right"]')).toHaveAttribute('aria-pressed', 'false')

    // Becoming proportional doesn't itself move anything on screen.
    const before = await rectOf(child)
    expectNear(before.x, parent.x + 60, 'left unchanged by un-pinning')
    expectNear(before.width, 200, 'width unchanged by un-pinning')

    await page.mouse.click(parent.x + 500, parent.y + 350)
    await page.fill('#field-width', '1200')
    await expect(parentNode).toHaveCSS('width', '1200px')

    // 60 of 600 was 10% — doubling the parent doubles the distance with
    // it, which a fixed pixel offset never would.
    const after = await rectOf(child)
    expectNear(after.x, parent.x + 120, 'left tracks the parent proportionally')
    expectNear(after.width, 200, "the child's own width is untouched by it")
  })

  test('the centre toggles every edge at once, without ever moving the frame', async ({ page }) => {
    const { child } = await drawNested(page)
    const toggleAll = page.locator('.pins__toggle-all')

    // Drawn from the top-left: top and left already hold, right and
    // bottom don't — not everything is pinned yet, so the first click
    // pins what's missing rather than clearing what's there.
    const before = await rectOf(child)
    await toggleAll.click()
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      await expect(page.locator(`[data-pin="${edge}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    expectBox(await rectOf(child), before)

    // Now everything is pinned, so the same button clears everything —
    // unconditionally, not just down to one pin per axis the way a
    // single edge's own button would leave it — becoming proportional on
    // both axes at once, without a jump either.
    await toggleAll.click()
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      await expect(page.locator(`[data-pin="${edge}"]`)).toHaveAttribute('aria-pressed', 'false')
    }
    expectBox(await rectOf(child), before)
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
