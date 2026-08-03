import { expect, test } from '@playwright/test'

import { VIEWPORT, childrenOf, drawFrame, openBuilder, rectOf, rootChildren } from './canvas'

/**
 * A child drawn past its parent's edge spills out of it.
 *
 * The default on the canvas, and load-bearing: `overflow` is the only
 * property that clips, and offering it as a choice means the frame must
 * not be clipping already. Nothing in the layout maths would notice if it
 * were — clipping is a paint effect, so every box keeps the coordinates it
 * had — which is why this asks what is actually painted at a point rather
 * than measuring anything.
 */
test.describe('Overflow', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  /** The id of the node painted at a point, which clipped content is not. */
  async function nodeAt(page: import('@playwright/test').Page, x: number, y: number) {
    return page.evaluate(
      ([px, py]) => {
        const element = document.elementFromPoint(px as number, py as number)
        return element instanceof HTMLElement ? (element.dataset.nodeId ?? null) : null
      },
      [x, y],
    )
  }

  test('a child painted past its parent is still there to be clicked', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 100, y: viewport.y + 160 }, { width: 300, height: 200 })

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    // Begins inside the parent, so it nests there, and runs 150px past its
    // right edge.
    await drawFrame(page, { x: parent.x + 250, y: parent.y + 50 }, { width: 200, height: 100 })

    const child = childrenOf(parentNode).first()
    const childId = await child.getAttribute('data-node-id')

    // Well outside the parent, well inside the child, and clear of the
    // selection handles at the child's own corners and edges.
    expect(await nodeAt(page, parent.x + 380, parent.y + 100)).toBe(childId)
  })

  test('clips only when asked to', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 100, y: viewport.y + 160 }, { width: 300, height: 200 })

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    await drawFrame(page, { x: parent.x + 250, y: parent.y + 50 }, { width: 200, height: 100 })

    // Select the parent from a corner no child covers, and clip it.
    await page.mouse.click(parent.x + 40, parent.y + 170)
    await page.getByLabel('Add to Appearance').selectOption('overflow')
    await page.selectOption('#field-overflow', 'hidden')

    const childId = await childrenOf(parentNode).first().getAttribute('data-node-id')
    // The overhang has stopped being painted, while the part still inside
    // the parent is untouched — which is the difference between clipping
    // and the box having moved or shrunk.
    expect(await nodeAt(page, parent.x + 380, parent.y + 100)).not.toBe(childId)
    expect(await nodeAt(page, parent.x + 280, parent.y + 100)).toBe(childId)
  })
})
