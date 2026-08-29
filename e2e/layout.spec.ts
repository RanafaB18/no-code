import { expect, test, type Locator } from '@playwright/test'

import {
  VIEWPORT,
  childrenOf,
  dragBy,
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

    /** #bbddff, as a browser reports a painted background. */
    const FILL = 'rgb(187, 221, 255)'
    /** How a browser reports no background at all. */
    const UNFILLED = 'rgba(0, 0, 0, 0)'

    function paintOf(locator: Locator) {
      return locator.evaluate((el) => getComputedStyle(el).backgroundColor)
    }

    test('a drawn frame is painted, not an outline around nothing', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, { width: 300, height: 200 })

      expect(await paintOf(rootChildren(page).first())).toBe(FILL)
    })

    test('a container leaves the paint to its children', async ({ page }) => {
      // Filled as well, its own colour would show through every gap and
      // the whole thing would read as one solid block.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 200 },
        'flex',
      )

      const container = rootChildren(page).first()
      expect(await paintOf(container)).toBe(UNFILLED)

      const children = childrenOf(container)
      expect(await paintOf(children.nth(0))).toBe(FILL)
      expect(await paintOf(children.nth(1))).toBe(FILL)
    })

    test('a frame dragged wholly inside a flex row joins it', async ({ page }) => {
      // The same containment rule drawing uses, so dragging a frame into a
      // row and drawing one there put it in the same place.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 200 },
        'flex',
      )
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 500 }, { width: 90, height: 60 })

      const row = rootChildren(page).first()
      const flex = await rectOf(row)
      const loose = await rectOf(rootChildren(page).nth(1))

      await dragBy(
        page,
        { x: loose.x + 45, y: loose.y + 30 },
        flex.x + 200 - (loose.x + 45),
        flex.y + 100 - (loose.y + 30),
      )

      // Off the page's children and into the row, between the two seeded.
      await expect(rootChildren(page)).toHaveCount(1)
      await expect(childrenOf(row)).toHaveCount(3)
      expectBox(await rectOf(childrenOf(row).nth(1)), { width: 90, height: 60 })
    })

    test('a frame dragged out of a row lands on the page where it was dropped', async ({
      page,
    }) => {
      // A frame the row places follows the pointer by a transform rather
      // than by moving for real — its slot stays reserved behind it and its
      // siblings hold still, which is what lets it be dragged clear at all.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 200 },
        'flex',
      )

      const row = rootChildren(page).first()
      const cell = await rectOf(childrenOf(row).first())

      await dragBy(page, { x: cell.x + 40, y: cell.y + 40 }, 0, 400)

      await expect(childrenOf(row)).toHaveCount(1)
      await expect(rootChildren(page)).toHaveCount(2)

      // Dropped 400px below where it started, at the size the row had
      // given it: `fill` is a grant from the row, so leaving states the
      // size rather than collapsing to nothing without it.
      expectBox(await rectOf(rootChildren(page).nth(1)), {
        x: cell.x,
        y: cell.y + 400,
        width: cell.width,
        height: cell.height,
      })
    })

    test('a frame dragged wholly inside a cell becomes that cell’s child', async ({ page }) => {
      // Containment is the whole rule: inside a cell means into the cell.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 200 },
        'flex',
      )
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 500 }, { width: 90, height: 60 })

      const row = rootChildren(page).first()
      const cell = childrenOf(row).first()
      const cellBox = await rectOf(cell)
      const loose = await rectOf(rootChildren(page).nth(1))

      // Dropped so the whole 90×60 box sits inside the cell.
      await dragBy(
        page,
        { x: loose.x + 45, y: loose.y + 30 },
        cellBox.x + cellBox.width / 2 - (loose.x + 45),
        cellBox.y + cellBox.height / 2 - (loose.y + 30),
      )

      await expect(rootChildren(page)).toHaveCount(1)
      // Still two cells, and the frame went inside the first of them.
      await expect(childrenOf(row)).toHaveCount(2)
      await expect(childrenOf(cell)).toHaveCount(1)
    })

    test('a frame the same size as a cell still fits inside it', async ({ page }) => {
      // Strict containment would refuse this forever: a box only contains
      // an equal box when the two align to the pixel, which no hand does.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 400, height: 200 },
        'flex',
      )

      const row = rootChildren(page).first()
      const cell = childrenOf(row).first()
      const cellBox = await rectOf(cell)

      // A loose frame of exactly the cell's size, drawn clear of the row.
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 500 },
        { width: Math.round(cellBox.width), height: Math.round(cellBox.height) },
      )
      const loose = await rectOf(rootChildren(page).nth(1))

      await dragBy(
        page,
        { x: loose.x + 20, y: loose.y + 20 },
        cellBox.x - loose.x,
        cellBox.y - loose.y,
      )

      await expect(rootChildren(page)).toHaveCount(1)
      await expect(childrenOf(cell)).toHaveCount(1)
    })

    test('a dragged frame paints above frames drawn after it', async ({ page }) => {
      // The dragged frame keeps its place in the tree throughout, so
      // without being raised it paints in DOM order — and would vanish
      // behind the very frame the highlight says it is about to enter.
      //
      // Drawn FIRST on purpose: later siblings paint over earlier ones, so
      // a frame drawn second would sit on top regardless and this would
      // pass whether the rule existed or not.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 520 }, { width: 180, height: 110 })
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 460, height: 200 },
        'flex',
      )

      const dragged = await rectOf(rootChildren(page).nth(0))
      const row = await rectOf(rootChildren(page).nth(1))

      await page.mouse.move(dragged.x + 90, dragged.y + 55)
      await page.mouse.down()
      await page.mouse.move(row.x + 200, row.y + 100, { steps: 10 })

      const paintedIsDragged = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x as number, y as number)
          return (el as HTMLElement | null)?.classList.contains('canvas-node--dragging') ?? false
        },
        [row.x + 200, row.y + 100],
      )
      await page.mouse.up()

      expect(paintedIsDragged).toBe(true)
    })

    test('the insertion line runs across a row, not along it', async ({ page }) => {
      // Orientation comes from how two real siblings are separated. Read
      // from a single neighbour's aspect ratio instead — as it was — a row
      // of tall cells looked like a column, and the line lay along the row
      // it was meant to cut across.
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(
        page,
        { x: viewport.x + 80, y: viewport.y + 120 },
        { width: 560, height: 180 },
        'flex',
      )
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 520 }, { width: 200, height: 110 })

      const row = await rectOf(rootChildren(page).nth(0))
      const loose = await rectOf(rootChildren(page).nth(1))

      // Inside the row, straddling the gap, so the row is the target
      // rather than either cell.
      await page.mouse.move(loose.x + 100, loose.y + 55)
      await page.mouse.down()
      await page.mouse.move(row.x + 280, row.y + 90, { steps: 10 })

      const line = await page.locator('.workspace__insertion').boundingBox()
      await page.mouse.up()

      expect(line!.height).toBeGreaterThan(line!.width)
    })

    test('a plain frame still comes empty', async ({ page }) => {
      const viewport = await rectOf(page.locator(VIEWPORT))
      await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, { width: 300, height: 200 })

      await expect(childrenOf(rootChildren(page).first())).toHaveCount(0)
    })
  })
})
