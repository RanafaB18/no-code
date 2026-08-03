import { expect, test } from '@playwright/test'

import { VIEWPORT, childrenOf, drawFrame, openBuilder, rectOf, rootChildren } from './canvas'

test.describe('Deletion', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  test('Delete removes the selected frame and everything inside it', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })
    await drawFrame(page, { x: viewport.x + 180, y: viewport.y + 240 }, { width: 160, height: 120 })

    const outer = rootChildren(page)
    await expect(childrenOf(outer.first())).toHaveCount(1)

    // The child is selected from drawing it, so this removes only it.
    await page.keyboard.press('Delete')
    await expect(childrenOf(outer.first())).toHaveCount(0)
    await expect(outer).toHaveCount(1)

    // Selecting the parent and deleting takes the whole branch.
    const parent = await rectOf(outer.first())
    await page.mouse.click(parent.x + 200, parent.y + 150)
    await page.keyboard.press('Delete')
    await expect(rootChildren(page)).toHaveCount(0)
  })

  test('Backspace deletes too, without navigating the browser back', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })

    await page.keyboard.press('Backspace')

    await expect(rootChildren(page)).toHaveCount(0)
    expect(page.url()).toContain('localhost')
  })

  test('deleting clears the selection rather than landing on the viewport', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })

    await expect(page.locator('.workspace__selection')).toBeVisible()
    await page.keyboard.press('Delete')

    // The viewport is the document, not an element — the inspector goes
    // back to its empty state rather than offering to edit the canvas.
    await expect(page.locator('.workspace__selection')).toHaveCount(0)
    await expect(page.locator('.inspector__empty')).toBeVisible()
  })

  test('a keystroke on a focused toolbar button never reaches the canvas', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })

    // Focus a real control inside a real panel. The old tag list matched
    // only input/textarea/select, so this button was fair game and
    // Backspace here would have deleted the frame just drawn.
    await page.locator('.frame-tool .toolbar__button').focus()
    await page.keyboard.press('Backspace')

    await expect(rootChildren(page)).toHaveCount(1)
  })

  test('Backspace inside an inspector field edits the value, not the document', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })

    const width = page.locator('#field-width')
    await width.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Backspace')

    await expect(rootChildren(page)).toHaveCount(1)
    // 400 lost its last digit rather than the frame losing its life.
    await expect(width).toHaveValue('40')
  })
})
