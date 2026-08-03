import { expect, type Locator, type Page } from '@playwright/test'

import type { NodeLayout } from '../src/composables/useCanvasNodes'

/** The document root every node descends from. */
export const VIEWPORT = '[data-node-id="viewport"]'

/**
 * How far a measured edge may drift from the expected one.
 *
 * Drawing rounds pointer coordinates to whole pixels, and a real browser
 * reports subpixel boxes, so an exact match would be flaky for reasons
 * that say nothing about correctness. One pixel is tight enough that
 * every bug worth catching here — a border's width, a padding, a whole
 * containing block — is far outside it.
 */
const TOLERANCE = 1

export function expectNear(actual: number, expected: number, what = 'value') {
  expect(
    Math.abs(actual - expected),
    `${what}: ${actual} should be within ${TOLERANCE} of ${expected}`,
  ).toBeLessThanOrEqual(TOLERANCE)
}

/** Asserts a box's position and, when given, its size. */
export function expectBox(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x?: number; y?: number; width?: number; height?: number },
) {
  if (expected.x !== undefined) expectNear(actual.x, expected.x, 'x')
  if (expected.y !== undefined) expectNear(actual.y, expected.y, 'y')
  if (expected.width !== undefined) expectNear(actual.width, expected.width, 'width')
  if (expected.height !== undefined) expectNear(actual.height, expected.height, 'height')
}

export async function openBuilder(page: Page) {
  await page.goto('/')
  await page.locator(VIEWPORT).waitFor()
}

/** The real, laid-out box — the whole reason these tests exist. */
export async function rectOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element is not rendered, so it has no box to measure')
  return box
}

/** Direct children of the viewport, in render order. */
export function rootChildren(page: Page): Locator {
  return page.locator(`${VIEWPORT} > [data-node-id]`)
}

/** Direct children of a node, in render order. */
export function childrenOf(node: Locator): Locator {
  return node.locator('> [data-node-id]')
}

export async function nodeIdsOf(children: Locator): Promise<(string | undefined)[]> {
  return children.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.nodeId),
  )
}

/**
 * Arms the frame tool with a layout.
 *
 * The layout is always chosen rather than left to default, because
 * choosing is also what closes the menu — leaving it open would hang a
 * panel over the top of the canvas the next drag has to draw on.
 */
export async function armFrame(page: Page, layout: NodeLayout = 'none') {
  await page.locator('.frame-tool .toolbar__button').click()
  await page.locator('.frame-tool__option', { hasText: layout }).click()
}

/** Draws a box, arming the tool first — one draw disarms it again. */
export async function drawFrame(
  page: Page,
  origin: { x: number; y: number },
  size: { width: number; height: number },
  layout: NodeLayout = 'none',
) {
  await armFrame(page, layout)
  await page.mouse.move(origin.x, origin.y)
  await page.mouse.down()
  await page.mouse.move(origin.x + size.width, origin.y + size.height, { steps: 8 })
  await page.mouse.up()
}

/** Presses at a point and drags by a delta, in one gesture. */
export async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
  await page.mouse.up()
}

/** Selects a node by pressing it — a press with no drag never moves it. */
export async function selectAt(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y)
}
