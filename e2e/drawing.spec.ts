import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  addProperty,
  armFrame,
  childrenOf,
  drawContainer,
  drawFrame,
  expectBox,
  openBuilder,
  rectOf,
  rootChildren,
} from './canvas'

/**
 * Where a drawn frame actually lands.
 *
 * None of this is checkable in jsdom: it has no box model, so every
 * getBoundingClientRect there returns zeros and a coordinate bug is
 * invisible. These are the assertions that make the absolute canvas real.
 */
test.describe('Drawing', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  test('puts the frame exactly where it was drawn', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    const origin = { x: viewport.x + 220, y: viewport.y + 200 }

    await drawFrame(page, origin, { width: 240, height: 160 })

    expectBox(await rectOf(rootChildren(page).first()), {
      ...origin,
      width: 240,
      height: 160,
    })
  })

  test('lands under the pointer inside a bordered, padded frame', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 160 }, { width: 560, height: 420 })

    // Drawing selects what it drew, so the inspector is already on it.
    for (const key of ['borderStyle', 'borderWidth', 'padding']) {
      await addProperty(page, 'Appearance', key)
    }
    await page.selectOption('#field-borderStyle', 'solid')
    await page.fill('#field-borderWidth', '10px')
    await page.fill('#field-padding', '24px')

    const origin = { x: viewport.x + 260, y: viewport.y + 320 }
    await drawFrame(page, origin, { width: 140, height: 90 })

    // The border shifts the padding box the child's offsets resolve
    // against, and the padding does not — get either wrong and the child
    // lands somewhere other than where the pointer drew it.
    const child = childrenOf(rootChildren(page).first()).first()
    expectBox(await rectOf(child), { ...origin, width: 140, height: 90 })
  })

  test('previews under the pointer inside a flex frame, then hands over on release', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawContainer(
      page,
      { x: viewport.x + 80, y: viewport.y + 160 },
      { width: 560, height: 420 },
      'flex',
    )
    const parent = await rectOf(rootChildren(page).first())

    const origin = { x: viewport.x + 260, y: viewport.y + 320 }
    await armFrame(page)
    await page.mouse.move(origin.x, origin.y)
    await page.mouse.down()
    await page.mouse.move(origin.x + 140, origin.y + 90, { steps: 8 })

    // Mid-gesture the pointer is in charge: the rubber band tracks it
    // rather than jumping to where the flex row would place the element.
    expectBox(await rectOf(page.locator('.workspace__ghost')), {
      ...origin,
      width: 140,
      height: 90,
    })

    await page.mouse.up()

    // On release the frame takes over and lays it out at the row's start.
    const child = childrenOf(rootChildren(page).first()).first()
    expectBox(await rectOf(child), { x: parent.x, y: parent.y, width: 140, height: 90 })
  })

  test('nests a child drawn to its parent’s full height', async ({ page }) => {
    // Filling a frame means drawing onto two of its edges at once, which a
    // hand cannot do exactly — and a pixel proud used to leave the element
    // a sibling of the frame it had been drawn onto.
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, { width: 420, height: 160 })

    const parent = rootChildren(page).first()
    const box = await rectOf(parent)
    await drawFrame(page, { x: box.x + 40, y: box.y - 1 }, { width: 100, height: 160 })

    await expect(rootChildren(page)).toHaveCount(1)
    await expect(childrenOf(parent)).toHaveCount(1)
  })

  test('still lands beside a frame it is drawn well across', async ({ page }) => {
    // The slack above forgives a hand aiming at an edge; it must not
    // swallow the deliberate act of crossing one, which is how an element
    // is placed beside a frame rather than inside it.
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 120 }, { width: 420, height: 160 })

    const box = await rectOf(rootChildren(page).first())
    await drawFrame(page, { x: box.x + 40, y: box.y + 40 }, { width: 100, height: 260 })

    await expect(rootChildren(page)).toHaveCount(2)
    await expect(childrenOf(rootChildren(page).first())).toHaveCount(0)
  })

  test('nests into the innermost frame the drag began in', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 80, y: viewport.y + 160 }, { width: 560, height: 420 })
    await drawFrame(page, { x: viewport.x + 140, y: viewport.y + 220 }, { width: 320, height: 240 })
    await drawFrame(page, { x: viewport.x + 200, y: viewport.y + 280 }, { width: 120, height: 90 })

    // One child at each level, rather than three siblings at the root.
    const outer = rootChildren(page)
    await expect(outer).toHaveCount(1)

    const middle = childrenOf(outer.first())
    await expect(middle).toHaveCount(1)
    await expect(childrenOf(middle.first())).toHaveCount(1)
  })
})
