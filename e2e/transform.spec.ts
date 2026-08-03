import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  childrenOf,
  dragBy,
  drawFrame,
  expectBox,
  nodeIdsOf,
  openBuilder,
  rectOf,
  rootChildren,
} from './canvas'

/** How far outside an element its selection frame — and so its grips — sits. */
const SELECTION_GAP = 4

test.describe('Move and resize', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  test('dragging moves the frame by the pointer delta', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    // From the centre, well clear of the grips around the edge.
    await dragBy(page, { x: before.x + 100, y: before.y + 75 }, 120, 90)

    expectBox(await rectOf(frame), {
      x: before.x + 120,
      y: before.y + 90,
      width: before.width,
      height: before.height,
    })
  })

  test('a press with no drag selects without moving', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    await page.mouse.click(before.x + 100, before.y + 75)

    expectBox(await rectOf(frame), before)
  })

  test('resizing from the bottom-right leaves the origin alone', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    await dragBy(
      page,
      { x: before.x + before.width + SELECTION_GAP, y: before.y + before.height + SELECTION_GAP },
      60,
      40,
    )

    expectBox(await rectOf(frame), {
      x: before.x,
      y: before.y,
      width: before.width + 60,
      height: before.height + 40,
    })
  })

  test('resizing from the top-left keeps the opposite corner fixed', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    await dragBy(page, { x: before.x - SELECTION_GAP, y: before.y - SELECTION_GAP }, 40, 30)

    const after = await rectOf(frame)
    expectBox(after, {
      x: before.x + 40,
      y: before.y + 30,
      width: before.width - 40,
      height: before.height - 30,
    })
    // The point of moving the origin with the size: the far corner is
    // the anchor, and it must not have drifted.
    expectBox(
      { ...after, x: after.x + after.width, y: after.y + after.height },
      { x: before.x + before.width, y: before.y + before.height },
    )
  })

  test('dragging an edge past the far one collapses rather than inverting', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    await dragBy(page, { x: before.x - SELECTION_GAP, y: before.y + 75 }, 500, 0)

    const after = await rectOf(frame)
    expect(after.width).toBeGreaterThan(0)
    // Collapsed against the right edge, which never moved.
    expectBox(after, { x: before.x + before.width - after.width, width: 1 })
  })

  test('dragging an in-flow child past its siblings reorders it', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(
      page,
      { x: viewport.x + 80, y: viewport.y + 160 },
      { width: 600, height: 300 },
      'flex',
    )

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    // Drawn below the row rather than into it: the flex parent packs each
    // child at the start, so a drag beginning over one of them would nest
    // inside it instead of adding a sibling.
    for (let index = 0; index < 3; index += 1) {
      await drawFrame(page, { x: parent.x + 400, y: parent.y + 180 }, { width: 120, height: 100 })
    }

    const children = childrenOf(parentNode)
    const before = await nodeIdsOf(children)
    expect(before).toHaveLength(3)

    const first = await rectOf(children.nth(0))
    const last = await rectOf(children.nth(2))

    // Past the last sibling's midpoint, level with the row — which is
    // what the reading-order rule reads as "after all three".
    await dragBy(
      page,
      { x: first.x + first.width / 2, y: first.y + first.height / 2 },
      last.x + last.width - 10 - (first.x + first.width / 2),
      0,
    )

    expect(await nodeIdsOf(children)).toEqual([before[1], before[2], before[0]])
  })

  test('Escape puts back the geometry a resize had already written', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    await page.mouse.move(
      before.x + before.width + SELECTION_GAP,
      before.y + before.height + SELECTION_GAP,
    )
    await page.mouse.down()
    await page.mouse.move(before.x + before.width + 100, before.y + before.height + 100, {
      steps: 8,
    })
    expectBox(await rectOf(frame), { width: before.width + 96, height: before.height + 96 })

    await page.keyboard.press('Escape')
    await page.mouse.up()

    expectBox(await rectOf(frame), before)
  })
})
