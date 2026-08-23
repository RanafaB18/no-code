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

/**
 * The canvas cell's own box.
 *
 * The canvas is docked between rails, so its top-left is not the window's
 * and a page coordinate is not a canvas one. Anything positioning a
 * pointer in canvas terms goes through `canvasPoint` rather than passing
 * raw page pixels.
 */
export async function workspaceBox(page: Page) {
  return rectOf(page.locator('.workspace'))
}

/** A page point `dx, dy` from the canvas cell's own top-left. */
export async function canvasPoint(page: Page, dx: number, dy: number) {
  const box = await workspaceBox(page)
  return { x: box.x + dx, y: box.y + dy }
}

export async function openBuilder(page: Page) {
  await page.goto('/')
  await page.locator(VIEWPORT).waitFor()

  // The app centres and fits the design to the canvas on load, which is
  // deliberately *not* 100% whenever the canvas has room to spare — so a
  // fresh load does not, in general, put the canvas at zoom 1. Nearly
  // every test here was written against real pixels standing in directly
  // for canvas ones, which only holds at zoom 1, so tests get a
  // deterministic baseline by default. A test that wants to exercise zoom
  // itself does so explicitly — see `zoomTo`.
  await page.getByLabel('Reset zoom').click()
}

/**
 * Sets the canvas to exactly `factor` (0.5, 2, 4, ...), for a test that
 * needs a real, non-1 zoom rather than the baseline `openBuilder` resets
 * to.
 *
 * Goes through the zoom-in/out buttons rather than a wheel event: those
 * step by a clean 2× each press (see CanvasZoomControls.vue), so a whole
 * number of presses lands on an exact power of two with no float drift to
 * account for in an assertion.
 *
 * The buttons anchor on the canvas cell's centre, not the design's —
 * after `openBuilder`'s reset put the canvas at the cell's corner rather
 * than its middle, repeated zooming can walk the design toward an edge,
 * or off it, before a test ever gets to draw on it. Panning it back to a
 * fixed, known point afterwards is what makes the zoom level the only
 * thing a test using this actually has to account for.
 *
 * That correction is a plain wheel pan, not a drag: the distance involved
 * can exceed what fits inside the canvas (a design shifted mostly
 * off-screen needs a correction bigger than the canvas itself), and a
 * wheel event pans without the pointer having to physically travel that
 * far the way `panBy`'s drag would need to.
 */
export async function zoomTo(page: Page, factor: number) {
  const steps = Math.round(Math.log2(factor))
  const button = page.getByLabel(steps >= 0 ? 'Zoom in' : 'Zoom out')
  for (let i = 0; i < Math.abs(steps); i += 1) {
    await button.click()
  }

  // Both points are inside the canvas cell, not the window: a target of
  // page (100, 100) would sit behind the left rail, so the design would be
  // parked somewhere no later drag could reach it.
  const cell = await workspaceBox(page)
  const target = await canvasPoint(page, 100, 100)
  const viewport = await rectOf(page.locator(VIEWPORT))
  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2)
  await page.mouse.wheel(viewport.x - target.x, viewport.y - target.y)

  // The selection frame re-measures on a throttled watcher (see
  // BuilderWorkspace.vue), so a handle can still be reporting its
  // pre-pan position for a moment after this resolves. Two zoom changes
  // land in quick succession above, which is exactly the case that
  // throttling defers to its trailing edge rather than firing at once.
  await page.waitForTimeout(50)
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

/** The tool that draws a frame with each layout — see `TOOLS`. */
const TOOL_LABEL: Record<NodeLayout, string> = {
  none: 'Frame',
  flex: 'Flex',
  grid: 'Grid',
}

/**
 * Arms the tool that draws a frame with `layout`.
 *
 * Named for the layout rather than the tool so that every caller reads as
 * "draw me a frame that lays out like this", which is what the tests
 * actually care about — the tool is just how you ask for one.
 */
export async function armFrame(page: Page, layout: NodeLayout = 'none') {
  await page.locator('.tool-menu__trigger').click()
  await page.getByRole('menuitemradio', { name: TOOL_LABEL[layout], exact: false }).click()
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

/** Pans the canvas by a delta — space-drag, the same gesture a user makes. */
export async function panBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.keyboard.down('Space')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
}

/** Selects a node by pressing it — a press with no drag never moves it. */
export async function selectAt(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y)
}

/**
 * Reveals an optional inspector property from its section's `+` menu.
 *
 * Properties most frames never set are hidden until asked for, so a test
 * that edits one has to open it the way a user would.
 */
export async function addProperty(page: Page, section: string, key: string) {
  await page.getByLabel(`Add to ${section}`).selectOption(key)
}
