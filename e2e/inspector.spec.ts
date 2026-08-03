import { expect, test } from '@playwright/test'

import { VIEWPORT, drawFrame, openBuilder, rectOf } from './canvas'

/**
 * The panel is around twenty controls tall now. These check that the
 * grouping actually reduces what is on screen, which is the whole reason
 * for it — a count jsdom can assert too, but only a browser can show the
 * picker and the collapse working through real clicks.
 */
test.describe('Inspector sections', () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page)
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 400, height: 300 })
  })

  test('collapsing a section hides its controls but keeps the heading', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Size' })
    await expect(page.locator('#field-widthMode')).toBeVisible()

    await toggle.click()

    await expect(page.locator('#field-widthMode')).toBeHidden()
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(page.locator('#field-widthMode')).toBeVisible()
  })

  test('an optional property appears once picked, and stops being offered', async ({ page }) => {
    const picker = page.getByLabel('Add to Appearance')

    await expect(page.locator('#field-borderRadius')).toHaveCount(0)
    await picker.selectOption('borderRadius')
    await expect(page.locator('#field-borderRadius')).toBeVisible()

    // Once shown it leaves the menu, so the same row cannot be added twice.
    await expect(picker.locator('option[value="borderRadius"]')).toHaveCount(0)
  })

  test('a property with a value is shown without being asked for', async ({ page }) => {
    await page.getByLabel('Add to Appearance').selectOption('padding')
    await page.fill('#field-padding', '24px')

    // Reselecting rebuilds the panel from the node, so a set value has to
    // bring its own control back — otherwise it would be in effect with
    // nothing anywhere to undo it.
    await page.keyboard.press('Escape')
    const frame = await rectOf(page.locator(`${VIEWPORT} > [data-node-id]`))
    await page.mouse.click(frame.x + 200, frame.y + 150)

    await expect(page.locator('#field-padding')).toHaveValue('24px')
  })
})
