import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  childrenOf,
  drawContainer,
  drawFrame,
  expectBox,
  openBuilder,
  rectOf,
  rootChildren,
  selectAt,
} from './canvas'

/**
 * A frame's `layout` decides how it places its **children**; each child's
 * `position` decides how it places **itself**. The two are independent,
 * and only a real browser can show that they are.
 */
test.describe('Layout', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  test('switching a frame to flex rearranges its children, and back restores them', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 160 }, { width: 600, height: 400 })

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)

    await drawFrame(page, { x: parent.x + 40, y: parent.y + 40 }, { width: 120, height: 80 })
    await drawFrame(page, { x: parent.x + 320, y: parent.y + 220 }, { width: 120, height: 80 })

    const children = childrenOf(parentNode)
    const drawn = [await rectOf(children.nth(0)), await rectOf(children.nth(1))]

    // Each child sits where it was drawn — the parent imposes nothing.
    expectBox(drawn[0]!, { x: parent.x + 40, y: parent.y + 40 })
    expectBox(drawn[1]!, { x: parent.x + 320, y: parent.y + 220 })

    // A corner of the parent no child covers, so this selects the parent.
    await selectAt(page, { x: parent.x + 550, y: parent.y + 360 })
    await page.selectOption('#field-layout', 'flex')

    // The parent now places them: a row from its content origin, and the
    // offsets they still carry stop applying entirely.
    const flexed = [await rectOf(children.nth(0)), await rectOf(children.nth(1))]
    expectBox(flexed[0]!, { x: parent.x, y: parent.y })
    expectBox(flexed[1]!, { x: parent.x + flexed[0]!.width, y: parent.y })

    await page.selectOption('#field-layout', 'none')

    // Their coordinates were never lost, only overridden.
    expectBox(await rectOf(children.nth(0)), drawn[0]!)
    expectBox(await rectOf(children.nth(1)), drawn[1]!)
  })

  test('a child pinned to absolute leaves the flow its siblings stay in', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawContainer(
      page,
      { x: viewport.x + 80, y: viewport.y + 160 },
      { width: 600, height: 400 },
      'flex',
    )

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)

    await drawFrame(page, { x: parent.x + 40, y: parent.y + 40 }, { width: 120, height: 80 })
    await drawFrame(page, { x: parent.x + 200, y: parent.y + 40 }, { width: 120, height: 80 })

    const children = childrenOf(parentNode)
    // Laid out by the parent, so both start at the row, not where drawn.
    expectBox(await rectOf(children.nth(0)), { x: parent.x })
    const secondInFlow = await rectOf(children.nth(1))
    expectBox(secondInFlow, { x: parent.x + 120 })

    // The second is still selected from drawing it.
    await page.selectOption('#field-position', 'absolute')

    // Leaving the flow does not move it, which takes work: the static
    // position of an absolutely positioned flex child is the container's
    // content-box origin, so an unpinned box would snap back to the start
    // of the row however far along it had been. The switch measures first
    // and pins after.
    expectBox(await rectOf(children.nth(1)), { x: secondInFlow.x, y: secondInFlow.y })
    expect(secondInFlow.x).toBeGreaterThan(parent.x)
    await expect(page.locator('#field-left')).toHaveValue(String(secondInFlow.x - parent.x))

    await page.fill('#field-left', '400')
    await page.fill('#field-top', '250')
    await page.keyboard.press('Tab')

    expectBox(await rectOf(children.nth(1)), { x: parent.x + 400, y: parent.y + 250 })
    // Its sibling keeps flowing, and reclaims the space it vacated.
    expectBox(await rectOf(children.nth(0)), { x: parent.x })
  })

  /**
   * What the Flex and Grid tools produce on their own, with nothing drawn
   * inside them afterwards.
   *
   * Only a browser can answer any of this: every assertion here is about
   * where real boxes landed, which is precisely what the seeded children
   * exist to make visible.
   */
  test.describe('what the tools seed', () => {
    /** Seeded on both container tools — see `GAP` in useTools.ts. */
    const GAP = 10

    test('a flex frame comes with two children splitting it evenly', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      const size = { width: 400, height: 200 }
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, size, 'flex')

      const children = childrenOf(rootChildren(page).first())
      await expect(children).toHaveCount(2)

      const parent = await rectOf(rootChildren(page).first())
      const [first, second] = [await rectOf(children.nth(0)), await rectOf(children.nth(1))]

      // Half the width each, less their share of the single gap between
      // them, and the full height — that is what `fill` buys on both axes.
      const half = (size.width - GAP) / 2
      expectBox(first, { x: parent.x, y: parent.y, width: half, height: size.height })
      expectBox(second, { x: parent.x + half + GAP, y: parent.y, width: half })
    })

    test('the two children re-split when the frame is resized', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 200 },
        'flex',
      )

      // Drawing leaves the frame selected, so this states a new width.
      await page.fill('#field-width', '600')
      await page.keyboard.press('Tab')

      const children = childrenOf(rootChildren(page).first())
      const [first, second] = [await rectOf(children.nth(0)), await rectOf(children.nth(1))]

      // Neither kept its old size: the point of `fill` over a fixed size.
      const half = (600 - GAP) / 2
      expectBox(first, { width: half })
      expectBox(second, { width: half })
    })

    test('a grid frame comes with four children in a 2×2', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      const size = { width: 400, height: 300 }
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, size, 'grid')

      const children = childrenOf(rootChildren(page).first())
      await expect(children).toHaveCount(4)

      const boxes = await Promise.all([0, 1, 2, 3].map((n) => rectOf(children.nth(n))))

      // Two distinct columns and two distinct rows, rather than the single
      // column an untracked grid would stack them into.
      expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(2)
      expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(2)

      const parent = await rectOf(rootChildren(page).first())
      const halfWide = (size.width - GAP) / 2
      const halfTall = (size.height - GAP) / 2
      expectBox(boxes[0]!, { x: parent.x, y: parent.y, width: halfWide, height: halfTall })
      expectBox(boxes[3]!, { x: parent.x + halfWide + GAP, y: parent.y + halfTall + GAP })
    })

    test('raising the column count reflows the children', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 300 },
        'grid',
      )

      // The grid is selected from drawing it.
      await page.getByLabel('Add a column').click()
      await page.getByLabel('Add a column').click()

      const children = childrenOf(rootChildren(page).first())
      const boxes = await Promise.all([0, 1, 2, 3].map((n) => rectOf(children.nth(n))))

      // Four across now, so all four share one row.
      expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1)
      expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(4)
    })

    test('a child set to span two columns covers both', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      const size = { width: 400, height: 300 }
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, size, 'grid')

      const children = childrenOf(rootChildren(page).first())
      const single = await rectOf(children.nth(0))

      // Select the first child from the Layers tree rather than by
      // clicking the canvas, which would land on whichever cell is under
      // the pointer.
      await page.getByRole('button', { name: 'Frame', exact: true }).first().click()
      await page.getByLabel('Add a column').click()

      const spanned = await rectOf(children.nth(0))
      // Both cells plus the gap that had been between them.
      expectBox(spanned, { width: single.width * 2 + GAP })
    })

    test('a plain frame still comes empty', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, { width: 300, height: 200 })

      await expect(childrenOf(rootChildren(page).first())).toHaveCount(0)
    })
  })
})
