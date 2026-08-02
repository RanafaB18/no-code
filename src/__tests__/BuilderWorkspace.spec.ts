import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import BuilderWorkspace from '../components/BuilderWorkspace.vue'
import { frameDisplay } from '../composables/useFrameTool'
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

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

beforeEach(() => {
  resetDocument()
  selectNode(null)
  disarm()
  // Module-level singleton like the armed tool, so it leaks between tests.
  frameDisplay.value = 'block'
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
    expect(drawn?.styles).toEqual({ display: 'block' })
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

  it('shows a selection frame with 8 handles once something is selected', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    expect(wrapper.find('.workspace__selection').exists()).toBe(false)

    selectNode(addNode('div').id)
    await nextTick()

    const selection = wrapper.get('.workspace__selection')
    expect(selection.findAll('.workspace__handle')).toHaveLength(8)

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

  it('seeds the chosen display alongside the drawn geometry', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    frameDisplay.value = 'flex'
    arm('frame')
    await drag(wrapper.element, { x: 0, y: 0 }, { x: 100, y: 50 })

    const drawn = getNode(viewport.value.childrenIds[0])
    expect(drawn?.styles).toEqual({ display: 'flex' })
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

  it('leaves shortcuts alone when typing in a field', async () => {
    mount(BuilderWorkspace)
    const input = document.createElement('input')
    document.body.appendChild(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await nextTick()

    expect(activeToolId.value).toBeNull()
    input.remove()
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
})
