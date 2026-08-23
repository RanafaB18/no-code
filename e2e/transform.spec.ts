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
  zoomTo,
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

  test('resizing from anywhere along an edge, not just its midpoint dot', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 200 }, { width: 200, height: 150 })

    const frame = rootChildren(page).first()
    const before = await rectOf(frame)

    // A quarter of the way down the right edge — clear of the corner
    // dots above and below it, and clear of the midpoint dot too, so
    // this can only be landing on the strip between them.
    await dragBy(
      page,
      { x: before.x + before.width + SELECTION_GAP, y: before.y + before.height * 0.25 },
      50,
      0,
    )

    // A single-edge resize, exactly like the midpoint dot gives: only
    // the width changed.
    expectBox(await rectOf(frame), {
      x: before.x,
      y: before.y,
      width: before.width + 50,
      height: before.height,
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

  test('the viewport is selected from its label and resizes like any frame', async ({ page }) => {
    await page.locator('.workspace__viewport-bar').click()

    // Full-size at 100%, the viewport's own corners sit under the docked
    // panels — the inspector specifically, once it is tall enough to show
    // what a selected viewport offers. Zoomed out, `zoomTo` already
    // re-centres it clear of everything docked around the window's edges.
    await zoomTo(page, 0.5)
    const before = await rectOf(page.locator(VIEWPORT))
    await expect(page.locator('#field-width')).toHaveValue('1440')

    await dragBy(
      page,
      { x: before.x + before.width + SELECTION_GAP, y: before.y + before.height + SELECTION_GAP },
      100,
      80,
    )

    // The screen delta was halved back to canvas units by the 50% zoom.
    expectBox(await rectOf(page.locator(VIEWPORT)), {
      x: before.x,
      y: before.y,
      width: before.width + 100,
      height: before.height + 80,
    })
    // A 100/80 real-pixel drag at 50% zoom is 200/160 canvas units.
    await expect(page.locator('#field-width')).toHaveValue('1640')
    await expect(page.locator('#field-height')).toHaveValue('1184')
  })

  test('the viewport moves by dragging it once selected, from its label onward', async ({
    page,
  }) => {
    const before = await rectOf(page.locator(VIEWPORT))
    await page.locator('.workspace__viewport-bar').click()

    // Empty canvas within the frame, well clear of the label itself.
    await dragBy(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, 60, 90)

    expectBox(await rectOf(page.locator(VIEWPORT)), {
      x: before.x + 60,
      y: before.y + 90,
      width: before.width,
      height: before.height,
    })
    await expect(page.locator('#field-left')).toHaveValue('60')
    await expect(page.locator('#field-top')).toHaveValue('90')
  })

  test('the viewport gets a plain X/Y, not the Type selector or constraint widget', async ({
    page,
  }) => {
    const before = await rectOf(page.locator(VIEWPORT))
    await page.locator('.workspace__viewport-bar').click()

    // No resizable parent to position against, so neither of these mean
    // anything for it — only a parented frame gets them.
    await expect(page.locator('#field-position')).toHaveCount(0)
    await expect(page.locator('[role="group"][aria-label="Constraints"]')).toHaveCount(0)

    // X/Y is directly typeable, not just draggable.
    await page.fill('#field-left', '300')
    await page.fill('#field-top', '150')

    expectBox(await rectOf(page.locator(VIEWPORT)), {
      x: before.x + 300,
      y: before.y + 150,
      width: before.width,
      height: before.height,
    })
  })

  test('pressing the viewport cold clears the selection rather than moving it', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 100, y: viewport.y + 100 }, { width: 80, height: 80 })
    expect(await page.locator('.workspace__selection').count()).toBe(1)

    // Bare canvas, not the frame just drawn and not the label — this is
    // exactly the gesture that reads as "pressing empty canvas" for every
    // other press, and the viewport is reachable only from its label.
    await dragBy(page, { x: viewport.x + 500, y: viewport.y + 500 }, 60, 90)

    expect(await page.locator('.workspace__selection').count()).toBe(0)
    expectBox(await rectOf(page.locator(VIEWPORT)), viewport)
  })
})
