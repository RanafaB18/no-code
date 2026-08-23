import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import BuilderWorkspace from '../components/BuilderWorkspace.vue'
import { resetView, toCanvasPoint, zoom } from '../composables/useCanvasView'
import { toWorkspacePoint, workspaceOrigin } from '../composables/useWorkspaceRect'
import { DEFAULT_FRAME_LAYOUT, frameLayout } from '../composables/useFrameTool'
import { useTools } from '../composables/useTools'
import { VIEWPORT_ID } from '../composables/useCanvasNodes'
import { getNode, useCanvasNodes } from '../composables/useCanvasNodes'

const { activeToolId, arm, disarm } = useTools()
const { viewport, selectedId, addNode, selectNode, resetDocument } = useCanvasNodes()

type Point = { x: number; y: number }

/**
 * Dispatches a real PointerEvent rather than using VueWrapper.trigger:
 * trigger builds a MouseEvent and then assigns the extra properties,
 * which throws because `clientX` is getter-only.
 *
 * Takes the node rather than the wrapper so a gesture can start on a
 * nested element — `bubbles: true` carries it to the workspace root,
 * where the handlers live, while `event.target` stays the node pressed.
 * That is what the drop-target resolution reads.
 */
function firePointer(target: Element, type: string, point: Point) {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: point.x,
      clientY: point.y,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
    }),
  )
}

async function drag(target: Element, from: Point, to: Point) {
  firePointer(target, 'pointerdown', from)
  firePointer(target, 'pointermove', to)
  firePointer(target, 'pointerup', to)
  await nextTick()
}

/** The rendered node for an element id. */
function nodeFor(wrapper: VueWrapper, id: string): Element {
  return wrapper.get(`[data-node-id="${id}"]`).element
}

/** A resize grip on the selection frame, by the edges it drags. */
function handleFor(wrapper: VueWrapper, name: string): Element {
  return wrapper.get(`[data-handle="${name}"]`).element
}

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

/**
 * A control inside a shortcut boundary — a stand-in for any floating
 * panel, which is what carries the attribute in the real app.
 *
 * Returns the boundary too, so the test can take it back out again:
 * these are attached to the document body, outside the wrapper that
 * `enableAutoUnmount` cleans up.
 */
function mountBoundary(tag: 'input' | 'button'): [HTMLElement, HTMLElement] {
  const boundary = document.createElement('div')
  boundary.setAttribute('data-shortcut-boundary', '')
  const control = document.createElement(tag)
  boundary.appendChild(control)
  document.body.appendChild(boundary)
  return [boundary, control]
}

beforeEach(() => {
  resetDocument()
  selectNode(null)
  disarm()
  // Module-level singleton like the armed tool, so it leaks between tests.
  frameLayout.value = DEFAULT_FRAME_LAYOUT
  // Another one. Unmounting resets it, but a test that sets it without
  // mounting would otherwise carry it into the next.
  workspaceOrigin.value = { x: 0, y: 0 }
  // Every geometry assertion below assumes pan/zoom are still identity —
  // BuilderWorkspace itself never touches them (see App.vue for why), but
  // reset explicitly rather than relying on that by omission.
  resetView()
})

describe('Workspace', () => {
  it('creates nothing while idle', async () => {
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper.element, { x: 10, y: 10 }, { x: 110, y: 80 })

    expect(viewport.value.childrenIds).toHaveLength(0)
  })

  it('turns an armed drag into an element sized from the gesture', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper.element, { x: 10, y: 10 }, { x: 110, y: 80 })

    expect(viewport.value.childrenIds).toHaveLength(1)
    // Geometry lives on the node as numbers, never in styles.
    const drawn = getNode(viewport.value.childrenIds[0])
    expect(drawn).toMatchObject({ left: 10, top: 10, width: 100, height: 70 })
    // Layout is a node field, not a CSS string in styles.
    expect(drawn?.layout).toBe(DEFAULT_FRAME_LAYOUT)
    expect(drawn?.styles).toEqual({})
  })

  it('normalises a drag made in the reverse direction', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper.element, { x: 110, y: 80 }, { x: 10, y: 10 })

    // Normalised: the drawn rect is the same box whichever way it was dragged.
    expect(getNode(viewport.value.childrenIds[0])).toMatchObject({
      left: 10,
      top: 10,
      width: 100,
      height: 70,
    })
  })

  it('ignores a drag below the minimum size', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper.element, { x: 10, y: 10 }, { x: 12, y: 12 })

    expect(viewport.value.childrenIds).toHaveLength(0)
  })

  it('disarms after one draw, so a second drag creates nothing', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })
    expect(activeToolId.value).toBeNull()

    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })
    expect(viewport.value.childrenIds).toHaveLength(1)
  })

  it('selects the element it just drew', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })

    expect(selectedId.value).toBe(viewport.value.childrenIds[0])
  })

  it('shows a live ghost while dragging and removes it on release', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    firePointer(wrapper.element, 'pointerdown', { x: 0, y: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 60, y: 40 })
    await nextTick()

    const ghost = wrapper.get('.workspace__ghost')
    expect(ghost.attributes('style')).toContain('width: 60px')
    expect(ghost.attributes('style')).toContain('height: 40px')

    firePointer(wrapper.element, 'pointerup', { x: 60, y: 40 })
    await nextTick()

    expect(wrapper.find('.workspace__ghost').exists()).toBe(false)
  })

  it('selects an element when pressed in idle mode', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)
    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })

    // Drawing disarms and selects; clear it to test selection on its own.
    selectNode(null)
    await nextTick()

    // pointerdown, not click: a click is synthesised after every drag and
    // would fire once the tool had already disarmed, re-selecting the
    // frame that was drawn into.
    // Targeted by id: `.canvas-node` now matches the viewport first in
    // document order, and pressing the viewport clears rather than selects.
    const drawnId = viewport.value.childrenIds[0] as string
    firePointer(nodeFor(wrapper, drawnId), 'pointerdown', { x: 5, y: 5 })
    await nextTick()

    expect(selectedId.value).toBe(viewport.value.childrenIds[0])
  })

  it('shows a selection frame with 8 handles and 4 edge strips once something is selected', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    expect(wrapper.find('.workspace__selection').exists()).toBe(false)

    selectNode(addNode('div').id)
    await nextTick()

    const selection = wrapper.get('.workspace__selection')
    expect(selection.findAll('.workspace__handle')).toHaveLength(8)
    // One per side, so a resize can start anywhere along an edge, not
    // only at the dot sitting on its midpoint.
    expect(selection.findAll('.workspace__edge-strip')).toHaveLength(4)

    selectNode(null)
    await nextTick()
    expect(wrapper.find('.workspace__selection').exists()).toBe(false)
  })

  it('never renders selection handles as children of the drawn element', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    selectNode(addNode('div').id)
    await nextTick()

    // The selected element is real content the user is authoring; the
    // frame must be a sibling overlay, not something injected into it.
    expect(wrapper.get('.canvas-node').findAll('.workspace__handle')).toHaveLength(0)
  })

  it('nests the new element into the frame the drag started in', async () => {
    const parent = addNode('div')
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    await drag(nodeFor(wrapper, parent.id), { x: 0, y: 0 }, { x: 100, y: 50 })

    // Root does not grow — the element went inside.
    expect(viewport.value.childrenIds).toHaveLength(1)
    expect(getNode(viewport.value.childrenIds[0])?.childrenIds).toHaveLength(1)
  })

  it('nests into the innermost frame when frames are nested', async () => {
    const outer = addNode('div')
    const inner = addNode('div', {}, outer.id)
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    await drag(nodeFor(wrapper, inner.id), { x: 0, y: 0 }, { x: 100, y: 50 })

    expect(getNode(inner.id)?.childrenIds).toHaveLength(1)
    // The outer frame gained nothing beyond the inner one it already had.
    expect(getNode(outer.id)?.childrenIds).toHaveLength(1)
  })

  it('still appends at the root when the drag starts on bare workspace', async () => {
    addNode('div')
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })

    expect(viewport.value.childrenIds).toHaveLength(2)
    expect(getNode(viewport.value.childrenIds[0])?.childrenIds).toHaveLength(0)
  })

  it('selects the innermost element pressed, not an ancestor', async () => {
    const outer = addNode('div')
    const inner = addNode('div', {}, outer.id)
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    firePointer(nodeFor(wrapper, inner.id), 'pointerdown', { x: 5, y: 5 })
    await nextTick()

    expect(selectedId.value).toBe(inner.id)
  })

  it('highlights the target frame while drawing into it, and clears after', async () => {
    const parent = addNode('div')
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    firePointer(nodeFor(wrapper, parent.id), 'pointerdown', { x: 0, y: 0 })
    await nextTick()
    expect(wrapper.find('.workspace__drop-target').exists()).toBe(true)

    firePointer(wrapper.element, 'pointerup', { x: 100, y: 50 })
    await nextTick()
    expect(wrapper.find('.workspace__drop-target').exists()).toBe(false)
  })

  it('shows no highlight when the drag targets the root', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    arm('frame')

    firePointer(wrapper.element, 'pointerdown', { x: 0, y: 0 })
    await nextTick()

    expect(wrapper.find('.workspace__drop-target').exists()).toBe(false)
  })

  it('renders the ghost inside the target frame, and at the root otherwise', async () => {
    const parent = addNode('div')
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    const parentNode = nodeFor(wrapper, parent.id)
    firePointer(parentNode, 'pointerdown', { x: 0, y: 0 })
    firePointer(parentNode, 'pointermove', { x: 60, y: 40 })
    await nextTick()

    // Queried from the target node, not the wrapper — `wrapper.find`
    // would match the ghost in either placement.
    expect(parentNode.querySelector('.workspace__ghost')).not.toBeNull()

    firePointer(wrapper.element, 'pointerup', { x: 60, y: 40 })
    await nextTick()
    expect(parentNode.querySelector('.workspace__ghost')).toBeNull()
  })

  it('seeds the chosen layout alongside the drawn geometry', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    frameLayout.value = 'flex'
    arm('frame')
    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })

    const drawn = getNode(viewport.value.childrenIds[0])
    expect(drawn?.layout).toBe('flex')
    expect(drawn).toMatchObject({ width: 100, height: 50 })
  })

  it('discards the drawn position when the parent lays its children out', async () => {
    const parent = addNode('div', { layout: 'flex', width: 400, height: 300 })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    await drag(nodeFor(wrapper, parent.id), { x: 20, y: 30 }, { x: 120, y: 90 })

    // A flex parent places its own children, so left/top would be inert —
    // emitting them would put values in the inspector the browser ignores.
    const child = getNode(getNode(parent.id)!.childrenIds[0]!)
    expect(child).toMatchObject({ width: 100, height: 60 })
    expect(child?.left).toBeUndefined()
    expect(child?.top).toBeUndefined()
  })

  it('renders the viewport as a real node', () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    expect(wrapper.find(`[data-node-id="${VIEWPORT_ID}"]`).exists()).toBe(true)
  })

  it('does not select the viewport when pressing empty canvas', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    // The viewport fills the surface, so `closest` finds it — but pressing
    // it *is* pressing empty canvas. It is reachable from its own control.
    firePointer(nodeFor(wrapper, VIEWPORT_ID), 'pointerdown', { x: 5, y: 5 })
    await nextTick()

    expect(selectedId.value).toBeNull()
  })

  it('never renders a node as position: static', async () => {
    const parent = addNode('div', { layout: 'flex', width: 400, height: 300 })
    addNode('div', {}, parent.id)
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    // A static frame is invisible to the containing-block search, so its
    // absolute children would escape and position against a distant
    // ancestor instead of it.
    for (const node of wrapper.findAll('[data-node-id]')) {
      expect(node.attributes('style')).toMatch(/position:\s*(absolute|relative)/)
    }
  })

  it('clears the selection when pressing on bare workspace', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)
    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })
    expect(selectedId.value).not.toBeNull()

    firePointer(wrapper.element, 'pointerdown', { x: 5, y: 5 })
    await nextTick()

    expect(selectedId.value).toBeNull()
  })

  it('marks the workspace armed so it can suppress native selection', async () => {
    const wrapper = mount(BuilderWorkspace)
    expect(wrapper.classes()).not.toContain('workspace--armed')

    arm('frame')
    await nextTick()

    expect(wrapper.classes()).toContain('workspace--armed')
  })

  it('arms and disarms from the tool shortcut', async () => {
    mount(BuilderWorkspace)

    pressKey('1')
    await nextTick()
    expect(activeToolId.value).toBe('frame')

    pressKey('1')
    await nextTick()
    expect(activeToolId.value).toBeNull()
  })

  it('leaves shortcuts alone when typing inside chrome', async () => {
    mount(BuilderWorkspace)
    const [panel, input] = mountBoundary('input')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await nextTick()

    expect(activeToolId.value).toBeNull()
    panel.remove()
  })

  it('leaves shortcuts alone on a button inside chrome, which a tag list missed', async () => {
    mount(BuilderWorkspace)
    const [panel, button] = mountBoundary('button')

    // The old rule matched `input, textarea, select`, so a focused toolbar
    // button was fair game — and Backspace there would have deleted the
    // selection. Asking "is this inside chrome?" catches it, and does not
    // grow with every new kind of control.
    button.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await nextTick()

    expect(activeToolId.value).toBeNull()
    panel.remove()
  })

  it('deletes the selected element on Delete, and on Backspace', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    for (const key of ['Delete', 'Backspace']) {
      const node = addNode('div', { left: 10, top: 10, width: 50, height: 50 })
      selectNode(node.id)
      await nextTick()

      pressKey(key)
      await nextTick()

      expect(getNode(node.id), `${key} should remove the node`).toBeNull()
      expect(selectedId.value).toBeNull()
    }
    expect(wrapper.findAll('.canvas-node')).toHaveLength(1)
  })

  it('deletes the whole subtree, not just the selected node', async () => {
    mount(BuilderWorkspace, { attachTo: document.body })
    const parent = addNode('div', { left: 10, top: 10, width: 200, height: 200 })
    const child = addNode('div', { width: 50, height: 50 }, parent.id)
    selectNode(parent.id)
    await nextTick()

    pressKey('Delete')
    await nextTick()

    expect(getNode(child.id)).toBeNull()
    expect(viewport.value.childrenIds).toEqual([])
  })

  it('deletes nothing when there is no selection', async () => {
    mount(BuilderWorkspace, { attachTo: document.body })
    addNode('div', { left: 10, top: 10, width: 50, height: 50 })
    selectNode(null)
    await nextTick()

    pressKey('Delete')
    await nextTick()

    expect(viewport.value.childrenIds).toHaveLength(1)
  })

  it('abandons a gesture in flight rather than writing to a deleted node', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    const node = addNode('div', { left: 40, top: 30, width: 100, height: 60 })
    selectNode(node.id)
    await nextTick()

    const handle = handleFor(wrapper, 'bottom-right')
    firePointer(handle, 'pointerdown', { x: 0, y: 0 })
    firePointer(handle, 'pointermove', { x: 60, y: 60 })
    await nextTick()

    pressKey('Delete')
    await nextTick()
    // The gesture would otherwise keep writing geometry to an id that no
    // longer exists, resurrecting nothing but wasting every move.
    firePointer(handle, 'pointermove', { x: 90, y: 90 })
    firePointer(handle, 'pointerup', { x: 90, y: 90 })
    await nextTick()

    expect(getNode(node.id)).toBeNull()
  })

  it('takes focus off an inspector field when the canvas is pressed', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    const node = addNode('div', { left: 40, top: 30, width: 100, height: 60 })
    await nextTick()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    firePointer(nodeFor(wrapper, node.id), 'pointerdown', { x: 50, y: 40 })
    await nextTick()

    // Pressing preventDefaults to kill native text selection, which also
    // suppresses the focus change — so without moving focus explicitly,
    // every tool shortcut would keep landing in the field just left.
    expect(document.activeElement).toBe(wrapper.element)
    input.remove()
  })

  it('previews the drawn box under the pointer even inside a laid-out frame', async () => {
    const parent = addNode('div', { layout: 'flex', width: 400, height: 300 })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    arm('frame')
    const parentNode = nodeFor(wrapper, parent.id)
    firePointer(parentNode, 'pointerdown', { x: 20, y: 30 })
    firePointer(parentNode, 'pointermove', { x: 120, y: 90 })
    await nextTick()

    // The frame takes the element over on release; while the gesture is
    // still running the pointer is in charge, so the ghost tracks it
    // rather than jumping to where the flex row happens to end.
    const ghost = wrapper.get('.workspace__ghost')
    expect(ghost.attributes('style')).toContain('position: absolute')
    expect(ghost.attributes('style')).toContain('left: 20px')
    expect(ghost.attributes('style')).toContain('top: 30px')
  })

  it('moves an absolutely positioned node by dragging it', async () => {
    const node = addNode('div', {
      left: 40,
      top: 30,
      width: 100,
      height: 60,
      pinLeft: true,
      pinTop: true,
    })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    await drag(nodeFor(wrapper, node.id), { x: 50, y: 40 }, { x: 90, y: 100 })

    // The parent imposes no layout, so the node places itself and the
    // drag is a straight offset write.
    expect(getNode(node.id)).toMatchObject({ left: 80, top: 90, width: 100, height: 60 })
  })

  it('selects without moving when the press never clears the drag threshold', async () => {
    const node = addNode('div', { left: 40, top: 30, width: 100, height: 60 })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    await drag(nodeFor(wrapper, node.id), { x: 50, y: 40 }, { x: 52, y: 41 })

    expect(selectedId.value).toBe(node.id)
    expect(getNode(node.id)).toMatchObject({ left: 40, top: 30 })
  })

  it('reorders an in-flow node among its siblings instead of offsetting it', async () => {
    const parent = addNode('div', { layout: 'flex', width: 400, height: 300 })
    const first = addNode('div', { width: 50, height: 50 }, parent.id)
    const second = addNode('div', { width: 50, height: 50 }, parent.id)
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()

    // jsdom has no layout, so every sibling box measures as a zero rect at
    // the origin — a drop below them all, which puts the node last.
    await drag(nodeFor(wrapper, first.id), { x: 10, y: 10 }, { x: 10, y: 200 })

    expect(getNode(parent.id)?.childrenIds).toEqual([second.id, first.id])
    // A flex parent places its children, so no offsets were written.
    expect(getNode(first.id)?.left).toBeUndefined()
    expect(getNode(first.id)?.top).toBeUndefined()
  })

  it('resizes from the bottom-right handle without moving the origin', async () => {
    const node = addNode('div', { left: 40, top: 30, width: 100, height: 60 })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(node.id)
    await nextTick()

    await drag(handleFor(wrapper, 'bottom-right'), { x: 0, y: 0 }, { x: 25, y: 15 })

    expect(getNode(node.id)).toMatchObject({ left: 40, top: 30, width: 125, height: 75 })
  })

  it('moves the origin as well as the size when dragging a top-left handle', async () => {
    const node = addNode('div', {
      left: 40,
      top: 30,
      width: 100,
      height: 60,
      pinLeft: true,
      pinTop: true,
    })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(node.id)
    await nextTick()

    await drag(handleFor(wrapper, 'top-left'), { x: 0, y: 0 }, { x: 10, y: 20 })

    // Dragging the top-left inwards shrinks the box and pulls the origin
    // after it, so the opposite corner stays put.
    expect(getNode(node.id)).toMatchObject({ left: 50, top: 50, width: 90, height: 40 })
  })

  it('pins the dragged edge rather than inverting the box past the far one', async () => {
    const node = addNode('div', {
      left: 40,
      top: 30,
      width: 100,
      height: 60,
      pinLeft: true,
      pinTop: true,
    })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(node.id)
    await nextTick()

    await drag(handleFor(wrapper, 'left'), { x: 0, y: 0 }, { x: 500, y: 0 })

    // The origin follows only as far as the width actually shrank, so the
    // right edge (140) is where the box collapses to.
    expect(getNode(node.id)).toMatchObject({ width: 1, left: 139 })
  })

  it('resizes an in-flow node without writing offsets its parent would ignore', async () => {
    const parent = addNode('div', { layout: 'flex', width: 400, height: 300 })
    const child = addNode('div', { width: 50, height: 50 }, parent.id)
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(child.id)
    await nextTick()

    await drag(handleFor(wrapper, 'top-left'), { x: 0, y: 0 }, { x: 10, y: 10 })

    expect(getNode(child.id)).toMatchObject({ width: 40, height: 40 })
    expect(getNode(child.id)?.left).toBeUndefined()
    expect(getNode(child.id)?.top).toBeUndefined()
  })

  it('pressing a resize handle keeps the selection it belongs to', async () => {
    const node = addNode('div', { left: 40, top: 30, width: 100, height: 60 })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(node.id)
    await nextTick()

    // The handles are overlay siblings, not inside any node — without
    // stopping propagation the workspace would read this as a press on
    // empty canvas and clear the very selection being resized.
    firePointer(handleFor(wrapper, 'right'), 'pointerdown', { x: 0, y: 0 })
    await nextTick()

    expect(selectedId.value).toBe(node.id)
  })

  it('resizes the viewport from a handle, like any other frame', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(VIEWPORT_ID)
    await nextTick()

    await drag(handleFor(wrapper, 'bottom-right'), { x: 0, y: 0 }, { x: 200, y: 200 })

    expect(getNode(VIEWPORT_ID)).toMatchObject({ width: 1640, height: 1224 })
  })

  it('resizes the viewport from its top-left edge, anchoring the far corner like any frame', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(VIEWPORT_ID)
    await nextTick()

    await drag(handleFor(wrapper, 'top-left'), { x: 0, y: 0 }, { x: 40, y: 30 })

    // It positions itself now the same as any other frame, so shrinking
    // from the top-left moves the origin to hold the opposite corner —
    // the bottom-right stays at (1440, 1024).
    expect(getNode(VIEWPORT_ID)).toMatchObject({ left: 40, top: 30, width: 1400, height: 994 })
  })

  it('moves the viewport by dragging it once it is already selected', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(VIEWPORT_ID)
    await nextTick()

    // Pressing its own body, not a handle — the viewport fills the
    // surface, so this targets it directly.
    await drag(nodeFor(wrapper, VIEWPORT_ID), { x: 500, y: 500 }, { x: 540, y: 560 })

    expect(getNode(VIEWPORT_ID)).toMatchObject({ left: 40, top: 60 })
  })

  it('does not move the viewport by pressing it when it is not already selected', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(null)
    await nextTick()

    // Pressing it cold is pressing empty canvas: it clears whatever was
    // selected rather than picking the viewport up to drag it.
    selectNode(addNode('div').id)
    await nextTick()

    await drag(nodeFor(wrapper, VIEWPORT_ID), { x: 500, y: 500 }, { x: 540, y: 560 })

    expect(getNode(VIEWPORT_ID)).toMatchObject({ left: 0, top: 0 })
    expect(selectedId.value).toBeNull()
  })

  it('restores the geometry a cancelled resize had already written', async () => {
    const node = addNode('div', { left: 40, top: 30, width: 100, height: 60 })
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(node.id)
    await nextTick()

    const handle = handleFor(wrapper, 'bottom-right')
    firePointer(handle, 'pointerdown', { x: 0, y: 0 })
    firePointer(handle, 'pointermove', { x: 60, y: 60 })
    await nextTick()
    expect(getNode(node.id)).toMatchObject({ width: 160, height: 120 })

    pressKey('Escape')
    await nextTick()

    expect(getNode(node.id)).toMatchObject({ left: 40, top: 30, width: 100, height: 60 })
  })

  it('clears a pin that was unset before a cancelled gesture invented one', async () => {
    const parent = addNode('div', { layout: 'flex', width: 400, height: 300 })
    const child = addNode('div', {}, parent.id)
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    selectNode(child.id)
    await nextTick()

    const handle = handleFor(wrapper, 'bottom-right')
    firePointer(handle, 'pointerdown', { x: 0, y: 0 })
    firePointer(handle, 'pointermove', { x: 60, y: 60 })
    await nextTick()

    pressKey('Escape')
    await nextTick()

    // "Unset" and "zero" are different — restoring must clear the pin, not
    // write back the measurement the gesture started from.
    expect(getNode(child.id)?.width).toBeUndefined()
    expect(getNode(child.id)?.height).toBeUndefined()
  })

  it('cancels an in-progress drag on Escape', async () => {
    arm('frame')
    const wrapper = mount(BuilderWorkspace)

    firePointer(wrapper.element, 'pointerdown', { x: 0, y: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 100, y: 100 })
    await nextTick()

    pressKey('Escape')
    await nextTick()

    expect(activeToolId.value).toBeNull()
    expect(wrapper.find('.workspace__ghost').exists()).toBe(false)

    firePointer(wrapper.element, 'pointerup', { x: 100, y: 100 })
    await nextTick()

    expect(viewport.value.childrenIds).toHaveLength(0)
  })

  /**
   * The canvas is docked between rails, so a pointer's `clientX/clientY`
   * is offset from the space `pan` lives in. jsdom reports every box as
   * zero, so the offset can't come from real layout — these set
   * `workspaceOrigin` directly, which is the whole reason it is a cached
   * ref rather than a `getBoundingClientRect` at each call site.
   *
   * Always *after* mounting: the workspace measures itself on mount, and
   * in jsdom that measurement is zero, so a stub set beforehand would be
   * overwritten before the gesture ever ran.
   */
  describe('with the canvas offset from the window', () => {
    /** Deliberately not round, so an off-by-one has nowhere to hide. */
    const ORIGIN = { x: 91, y: 57 }

    it('rebases a bare-canvas draw onto the workspace, not the window', async () => {
      arm('frame')
      const wrapper = mount(BuilderWorkspace)
      workspaceOrigin.value = { ...ORIGIN }

      await drag(
        wrapper.element,
        { x: ORIGIN.x + 10, y: ORIGIN.y + 10 },
        { x: ORIGIN.x + 110, y: ORIGIN.y + 80 },
      )

      // The same box the un-offset drag draws: the pointer moved with the
      // canvas, so what it drew should not have.
      const drawn = getNode(viewport.value.childrenIds[0])
      expect(drawn).toMatchObject({ left: 10, top: 10, width: 100, height: 70 })
    })

    it('anchors a pinch-zoom on the canvas point under the pointer', async () => {
      const wrapper = mount(BuilderWorkspace)
      workspaceOrigin.value = { ...ORIGIN }

      const pointer = { x: ORIGIN.x + 300, y: ORIGIN.y + 200 }
      const before = toCanvasPoint(toWorkspacePoint(pointer))

      wrapper.element.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          ctrlKey: true,
          clientX: pointer.x,
          clientY: pointer.y,
          bubbles: true,
          cancelable: true,
        }),
      )
      await nextTick()

      expect(zoom.value).toBeGreaterThan(1)
      // Zooming moved `pan`, so this only still holds if the anchor was
      // rebased the same way on the way in. Feeding `zoomBy` the raw
      // client point instead pins the wrong canvas point and this drifts
      // by the offset.
      const after = toCanvasPoint(toWorkspacePoint(pointer))
      expect(after.x).toBeCloseTo(before.x)
      expect(after.y).toBeCloseTo(before.y)
    })
  })
})
