import { expect, test } from '@playwright/test'

import { VIEWPORT, addProperty, drawFrame, openBuilder, rectOf, rootChildren } from './canvas'

/**
 * The point of the per-corner toggle is that the *rendered* corners
 * change, and only a browser resolves a shorthand into the four longhands
 * it stands for. jsdom would confirm the style map and miss the case this
 * widget exists to prevent — a shorthand and a longhand both set, with
 * insertion order deciding the winner.
 */
test.describe('Corner radius', () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page)
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 120, y: viewport.y + 180 }, { width: 300, height: 200 })
    await addProperty(page, 'Appearance', 'borderRadius')
  })

  test('applies one value to every corner', async ({ page }) => {
    await page.fill('#field-borderRadius', '16px')

    const frame = rootChildren(page).first()
    await expect(frame).toHaveCSS('border-top-left-radius', '16px')
    await expect(frame).toHaveCSS('border-bottom-right-radius', '16px')
  })

  test('splits into four fields seeded from the value already showing', async ({ page }) => {
    await page.fill('#field-borderRadius', '16px')
    await page.getByRole('button', { name: 'Set each corner' }).click()

    // Opens on what was already rendering, so the switch itself changes
    // nothing about the element.
    await expect(page.locator('#field-borderTopLeftRadius')).toHaveValue('16px')

    await page.fill('#field-borderTopLeftRadius', '48px')

    const frame = rootChildren(page).first()
    await expect(frame).toHaveCSS('border-top-left-radius', '48px')
    await expect(frame).toHaveCSS('border-bottom-right-radius', '16px')
  })

  test('merges back to a single value', async ({ page }) => {
    await page.fill('#field-borderRadius', '16px')
    await page.getByRole('button', { name: 'Set each corner' }).click()
    await page.fill('#field-borderTopLeftRadius', '48px')

    await page.getByRole('button', { name: 'Use one value' }).click()

    // Top left wins, and the corners it leaves behind stop applying —
    // with both forms live, insertion order would decide the winner.
    await expect(page.locator('#field-borderRadius')).toHaveValue('48px')
    const frame = rootChildren(page).first()
    await expect(frame).toHaveCSS('border-top-left-radius', '48px')
    await expect(frame).toHaveCSS('border-bottom-right-radius', '48px')
  })
})
