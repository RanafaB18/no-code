import { expect, test } from '@playwright/test'

import { VIEWPORT, drawFrame, expectNear, openBuilder, rectOf, rootChildren } from './canvas'

/**
 * Sweeping a band across the canvas to select what it touches.
 *
 * Touching, deliberately, and not the containment rule the rest of the
 * canvas runs on: a marquee exists to catch a row of frames without
 * having to enclose every one of them.
 */
test.describe('Marquee selection', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  /** Three frames in a row across the page, with gaps between them. */
  async function threeFrames(page: import('@playwright/test').Page) {
    const viewport = await rectOf(page.locator(VIEWPORT))
    for (const offset of [100, 320, 540]) {
      await drawFrame(
        page,
        { x: viewport.x + offset, y: viewport.y + 150 },
        { width: 160, height: 110 },
      )
    }
    return viewport
  }

  test('shows a band while sweeping, and takes what it touched', async ({ page }) => {
    const viewport = await threeFrames(page)

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 600, viewport.y + 280, { steps: 12 })

    await expect(page.locator('.workspace__marquee')).toHaveCount(1)
    await expect(page.locator('.workspace__marquee-hit')).toHaveCount(3)

    await page.mouse.up()

    // The band goes, the selection it promised stays.
    await expect(page.locator('.workspace__marquee')).toHaveCount(0)
    await expect(page.locator('.workspace__marquee-hit')).toHaveCount(3)
  })

  test('catches a frame it merely clips', async ({ page }) => {
    const viewport = await threeFrames(page)

    // Stops inside the first frame, well short of enclosing it.
    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 140, viewport.y + 200, { steps: 8 })

    await expect(page.locator('.workspace__marquee-hit')).toHaveCount(1)
    await page.mouse.up()
  })

  test('draws one frame around the whole selection', async ({ page }) => {
    // Several frames become one thing to handle, so there is a single
    // frame around the lot rather than a frame each.
    const viewport = await threeFrames(page)
    const boxes = [
      await rectOf(rootChildren(page).nth(0)),
      await rectOf(rootChildren(page).nth(2)),
    ]

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 600, viewport.y + 280, { steps: 12 })
    await page.mouse.up()

    await expect(page.locator('.workspace__selection')).toHaveCount(1)
    const union = await page.locator('.workspace__selection').boundingBox()
    expectNear(union!.x, boxes[0]!.x, 'union left')
    expectNear(union!.x + union!.width, boxes[1]!.x + boxes[1]!.width, 'union right')
  })

  test('resizing the union scales everything in it', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    for (const offset of [100, 320]) {
      await drawFrame(
        page,
        { x: viewport.x + offset, y: viewport.y + 150 },
        { width: 160, height: 110 },
      )
    }

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 540, viewport.y + 300, { steps: 10 })
    await page.mouse.up()

    const union = (await page.locator('.workspace__selection').boundingBox())!
    const before = [
      await rectOf(rootChildren(page).nth(0)),
      await rectOf(rootChildren(page).nth(1)),
    ]

    // The right-middle grip, dragged out by half the union's width again.
    const grow = union.width / 2
    await page.mouse.move(union.x + union.width, union.y + union.height / 2)
    await page.mouse.down()
    await page.mouse.move(union.x + union.width + grow, union.y + union.height / 2, { steps: 10 })
    await page.mouse.up()

    const scale = (union.width + grow) / union.width
    const after = [
      await rectOf(rootChildren(page).nth(0)),
      await rectOf(rootChildren(page).nth(1)),
    ]

    // Each keeps its size and place relative to the union, so the whole
    // selection scales as one piece rather than each taking the drag.
    expectNear(after[0]!.width, before[0]!.width * scale, 'first width')
    expectNear(after[1]!.width, before[1]!.width * scale, 'second width')
    expectNear(after[0]!.x, union.x, 'anchored edge holds')
    expectNear(after[1]!.x, union.x + (before[1]!.x - union.x) * scale, 'second offset scales')
  })

  test('a single frame caught still gets its handles', async ({ page }) => {
    const viewport = await threeFrames(page)

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 200, viewport.y + 280, { steps: 8 })
    await page.mouse.up()

    await expect(page.locator('.workspace__selection')).toHaveCount(1)
  })

  test('dragging any one of them moves the whole selection', async ({ page }) => {
    const viewport = await threeFrames(page)

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 740, viewport.y + 300, { steps: 12 })
    await page.mouse.up()

    const before = await Promise.all([0, 1, 2].map((n) => rectOf(rootChildren(page).nth(n))))

    // Pressing one of the selected frames drags the lot, rather than
    // throwing the selection away to pick that one out of it.
    const middle = before[1]!
    await page.mouse.move(middle.x + 80, middle.y + 55)
    await page.mouse.down()
    await page.mouse.move(middle.x + 200, middle.y + 125, { steps: 10 })
    await page.mouse.up()

    const after = await Promise.all([0, 1, 2].map((n) => rectOf(rootChildren(page).nth(n))))
    for (const [index, box] of after.entries()) {
      expectNear(box.x, before[index]!.x + 120, `frame ${index} x`)
      expectNear(box.y, before[index]!.y + 70, `frame ${index} y`)
    }

    // And it is still a selection of three afterwards.
    await expect(page.locator('.workspace__marquee-hit')).toHaveCount(3)
  })

  test('the frame and outlines follow a group mid-move', async ({ page }) => {
    // `selectedNode` is null for a selection of several, so watching only
    // that re-measured nothing during a group move: the frames slid away
    // and their outlines and handles stayed at the positions they had
    // started from, reading as ghosts of where they had been.
    const viewport = await threeFrames(page)

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 740, viewport.y + 300, { steps: 12 })
    await page.mouse.up()

    const first = await rectOf(rootChildren(page).nth(0))
    await page.mouse.move(first.x + 80, first.y + 55)
    await page.mouse.down()
    await page.mouse.move(first.x + 230, first.y + 165, { steps: 10 })

    // Held mid-drag: every overlay sits on the frame it belongs to.
    const boxes = await Promise.all([0, 1, 2].map((n) => rectOf(rootChildren(page).nth(n))))
    const outlines = await page
      .locator('.workspace__marquee-hit')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x))

    for (const [index, box] of boxes.entries()) {
      expectNear(outlines[index]!, box.x, `outline ${index} follows`)
    }

    const union = (await page.locator('.workspace__selection').boundingBox())!
    expectNear(union.x, boxes[0]!.x, 'union follows')

    await page.mouse.up()
  })

  test('deletes everything the band caught', async ({ page }) => {
    const viewport = await threeFrames(page)
    await expect(rootChildren(page)).toHaveCount(3)

    await page.mouse.move(viewport.x + 60, viewport.y + 120)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 600, viewport.y + 280, { steps: 12 })
    await page.mouse.up()

    await page.keyboard.press('Backspace')
    await expect(rootChildren(page)).toHaveCount(0)
  })

  test('takes the page’s own frames, not what is inside them', async ({ page }) => {
    // Sweeping a row picks the row. Reaching inside one is what clicking
    // into it already does.
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 150 }, { width: 460, height: 130 }, 'flex')

    await page.mouse.move(viewport.x + 60, viewport.y + 100)
    await page.mouse.down()
    await page.mouse.move(viewport.x + 650, viewport.y + 320, { steps: 12 })

    // One outline for the row, not three for the row and its two cells.
    await expect(page.locator('.workspace__marquee-hit')).toHaveCount(1)
    await page.mouse.up()
  })

  test('a press with no sweep clears the selection', async ({ page }) => {
    const viewport = await threeFrames(page)
    // Drawing leaves the last frame selected.
    await expect(page.locator('.workspace__selection')).toHaveCount(1)

    await page.mouse.click(viewport.x + 60, viewport.y + 500)

    await expect(page.locator('.workspace__selection')).toHaveCount(0)
    await expect(page.locator('.workspace__marquee-hit')).toHaveCount(0)
  })
})
