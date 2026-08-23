import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  childrenOf,
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
    await drawFrame(
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
})
