import { expect, test } from '@playwright/test'

import {
  VIEWPORT,
  addProperty,
  childrenOf,
  dragBy,
  drawFrame,
  expectBox,
  expectNear,
  openBuilder,
  rectOf,
  rootChildren,
  selectAt,
} from './canvas'

/**
 * Sizing modes only mean anything once a browser resolves them: a
 * percentage needs a containing block to be a percentage *of*, and `fill`
 * is whatever space the siblings leave. jsdom can confirm the mode was
 * stored; only this can confirm it did something.
 */
test.describe('Sizing modes', () => {
  test.beforeEach(({ page }) => openBuilder(page))

  test('relative resolves against the parent padding box, not its content box', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 100, y: viewport.y + 160 }, { width: 600, height: 400 })
    await addProperty(page, 'Appearance', 'padding')
    await page.fill('#field-padding', '50px')

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    await drawFrame(page, { x: parent.x + 80, y: parent.y + 80 }, { width: 120, height: 90 })

    await page.selectOption('#field-widthMode', 'relative')
    await page.fill('#field-width', '50')

    // An absolutely positioned child resolves percentages against its
    // containing block's *padding* box. With border-box sizing the frame's
    // 600px width IS its padding box, so the 50px padding does not shrink
    // what 50% means — 300, not 250. It still shifts where `left: 0`
    // starts, which is the part that reads like a bug and is not one.
    //
    // An in-flow child would differ: percentages there resolve against the
    // content box, so the same frame would give 250.
    const child = childrenOf(parentNode).first()
    expectNear((await rectOf(child)).width, 300, 'relative width')
  })

  test('fill takes the space its siblings leave, and splits it evenly between two', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(
      page,
      { x: viewport.x + 100, y: viewport.y + 160 },
      { width: 600, height: 300 },
      'flex',
    )

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    // Drawn below the row so each lands as a sibling, not a nested child.
    await drawFrame(page, { x: parent.x + 400, y: parent.y + 200 }, { width: 100, height: 80 })
    await drawFrame(page, { x: parent.x + 400, y: parent.y + 200 }, { width: 100, height: 80 })

    const children = childrenOf(parentNode)
    await page.selectOption('#field-widthMode', 'fill')

    // One filling sibling takes everything the fixed one leaves.
    expectNear((await rectOf(children.nth(1))).width, 500, 'single fill')

    await selectAt(page, { x: parent.x + 50, y: parent.y + 40 })
    await page.selectOption('#field-widthMode', 'fill')

    // Two filling siblings share it, rather than each keeping its content
    // width and splitting only the remainder — that is the flex-basis: 0.
    expectNear((await rectOf(children.nth(0))).width, 300, 'first of two')
    expectNear((await rectOf(children.nth(1))).width, 300, 'second of two')
  })

  test('a filling frame keeps its size when it leaves the flow', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(
      page,
      { x: viewport.x + 100, y: viewport.y + 160 },
      { width: 600, height: 300 },
      'flex',
    )

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    await drawFrame(page, { x: parent.x + 400, y: parent.y + 200 }, { width: 120, height: 90 })
    await page.selectOption('#field-widthMode', 'fill')

    const child = childrenOf(parentNode).first()
    const filled = await rectOf(child)
    expectNear(filled.width, 600, 'filled width')

    await page.selectOption('#field-position', 'absolute')

    // `fill` is granted by the parent's layout, which has stopped placing
    // this node — left alone the box would collapse to nothing instead of
    // holding the width it was visibly occupying a moment earlier.
    await expect(page.locator('#field-widthMode')).toHaveValue('fixed')
    expectBox(await rectOf(child), { width: filled.width, x: filled.x, y: filled.y })
  })

  test('fill is not offered to a node its parent does not lay out', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(page, { x: viewport.x + 100, y: viewport.y + 160 }, { width: 600, height: 400 })

    const parent = await rectOf(rootChildren(page).first())
    await drawFrame(page, { x: parent.x + 60, y: parent.y + 60 }, { width: 120, height: 90 })

    // The parent imposes no layout, so this child is absolute — flex-grow
    // would never reach it. It fills by pinning both edges instead.
    const modes = page.locator('#field-widthMode option')
    await expect(modes).toHaveText(['—', 'fixed', 'relative', 'fit'])
  })

  test('fit shrinks to contents rather than stretching across a flex row', async ({ page }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(
      page,
      { x: viewport.x + 100, y: viewport.y + 160 },
      { width: 600, height: 300 },
      'flex',
    )

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    await drawFrame(page, { x: parent.x + 400, y: parent.y + 200 }, { width: 120, height: 90 })

    await page.selectOption('#field-heightMode', 'fit')

    // `height: auto` in a flex row's cross axis means stretch — the
    // opposite of fitting. An empty frame fitting its contents is 0 tall.
    expectNear((await rectOf(childrenOf(parentNode).first())).height, 0, 'fit height')
  })

  test('dragging a handle freezes a filling axis to fixed at its current size', async ({
    page,
  }) => {
    const viewport = await rectOf(page.locator(VIEWPORT))
    await drawFrame(
      page,
      { x: viewport.x + 100, y: viewport.y + 160 },
      { width: 600, height: 300 },
      'flex',
    )

    const parentNode = rootChildren(page).first()
    const parent = await rectOf(parentNode)
    await drawFrame(page, { x: parent.x + 400, y: parent.y + 200 }, { width: 120, height: 90 })
    await page.selectOption('#field-widthMode', 'fill')

    const child = childrenOf(parentNode).first()
    const filled = await rectOf(child)
    expectNear(filled.width, 600, 'filled width')

    // Dragging an edge states a size in pixels, so the axis stops filling
    // — starting from what it was actually measuring, not from nothing.
    await dragBy(page, { x: filled.x + filled.width + 4, y: filled.y + filled.height / 2 }, -100, 0)

    await expect(page.locator('#field-widthMode')).toHaveValue('fixed')
    expectBox(await rectOf(child), { width: filled.width - 100 })
    // The other axis was never touched.
    await expect(page.locator('#field-heightMode')).toHaveValue('fixed')
  })
})
