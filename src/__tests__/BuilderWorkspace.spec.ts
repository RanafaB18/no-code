import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import BuilderWorkspace from '../components/BuilderWorkspace.vue'
import { useTools } from '../composables/useTools'
import { useWorkspaceElements } from '../composables/useWorkspaceElements'

const { activeToolId, arm, disarm } = useTools()
const { elements, selectedId, addElement, select } = useWorkspaceElements()

type Point = { x: number; y: number }

/**
 * Dispatches a real PointerEvent rather than using VueWrapper.trigger:
 * trigger builds a MouseEvent and then assigns the extra properties,
 * which throws because `clientX` is getter-only.
 */
function firePointer(wrapper: VueWrapper, type: string, point: Point) {
  wrapper.element.dispatchEvent(
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

async function drag(wrapper: VueWrapper, from: Point, to: Point) {
  firePointer(wrapper, 'pointerdown', from)
  firePointer(wrapper, 'pointermove', to)
  firePointer(wrapper, 'pointerup', to)
  await nextTick()
}

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

beforeEach(() => {
  elements.value.splice(0)
  select(null)
  disarm()
})

describe('Workspace', () => {
  it('creates nothing while idle', async () => {
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper, { x: 10, y: 10 }, { x: 110, y: 80 })

    expect(elements.value).toHaveLength(0)
  })

  it('turns an armed drag into an element sized from the gesture', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper, { x: 10, y: 10 }, { x: 110, y: 80 })

    expect(elements.value).toHaveLength(1)
    // Width is explicit; height becomes min-height so content can still
    // grow the box.
    expect(elements.value[0]?.styles).toEqual({ width: '100px', minHeight: '70px' })
  })

  it('normalises a drag made in the reverse direction', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper, { x: 110, y: 80 }, { x: 10, y: 10 })

    expect(elements.value[0]?.styles).toEqual({ width: '100px', minHeight: '70px' })
  })

  it('ignores a drag below the minimum size', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper, { x: 10, y: 10 }, { x: 12, y: 12 })

    expect(elements.value).toHaveLength(0)
  })

  it('disarms after one draw, so a second drag creates nothing', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper, { x: 0, y: 0 }, { x: 100, y: 50 })
    expect(activeToolId.value).toBeNull()

    await drag(wrapper, { x: 0, y: 0 }, { x: 100, y: 50 })
    expect(elements.value).toHaveLength(1)
  })

  it('selects the element it just drew', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    await drag(wrapper, { x: 0, y: 0 }, { x: 100, y: 50 })

    expect(selectedId.value).toBe(elements.value[0]?.id)
  })

  it('shows a live ghost while dragging and removes it on release', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    firePointer(wrapper, 'pointerdown', { x: 0, y: 0 })
    firePointer(wrapper, 'pointermove', { x: 60, y: 40 })
    await nextTick()

    const ghost = wrapper.get('.workspace__ghost')
    expect(ghost.attributes('style')).toContain('width: 60px')
    expect(ghost.attributes('style')).toContain('min-height: 40px')

    firePointer(wrapper, 'pointerup', { x: 60, y: 40 })
    await nextTick()

    expect(wrapper.find('.workspace__ghost').exists()).toBe(false)
  })

  it('selects an element when clicked in idle mode', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)
    await drag(wrapper, { x: 0, y: 0 }, { x: 100, y: 50 })

    // Drawing disarms and selects; clear it to test selection on its own.
    select(null)
    await nextTick()

    await wrapper.get('.workspace-element').trigger('click')

    expect(selectedId.value).toBe(elements.value[0]?.id)
  })

  it('shows a selection frame with 8 handles once something is selected', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    expect(wrapper.find('.workspace__selection').exists()).toBe(false)

    select(addElement('div').id)
    await nextTick()

    const selection = wrapper.get('.workspace__selection')
    expect(selection.findAll('.workspace__handle')).toHaveLength(8)

    select(null)
    await nextTick()
    expect(wrapper.find('.workspace__selection').exists()).toBe(false)
  })

  it('never renders selection handles as children of the drawn element', async () => {
    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })

    select(addElement('div').id)
    await nextTick()

    // The selected element is real content the user is authoring; the
    // frame must be a sibling overlay, not something injected into it.
    expect(wrapper.get('.workspace-element').findAll('.workspace__handle')).toHaveLength(0)
  })

  it('clears the selection when pressing on bare workspace', async () => {
    arm('div')
    const wrapper = mount(BuilderWorkspace)
    await drag(wrapper, { x: 0, y: 0 }, { x: 100, y: 50 })
    expect(selectedId.value).not.toBeNull()

    firePointer(wrapper, 'pointerdown', { x: 5, y: 5 })
    await nextTick()

    expect(selectedId.value).toBeNull()
  })

  it('marks the workspace armed so it can suppress native selection', async () => {
    const wrapper = mount(BuilderWorkspace)
    expect(wrapper.classes()).not.toContain('workspace--armed')

    arm('div')
    await nextTick()

    expect(wrapper.classes()).toContain('workspace--armed')
  })

  it('arms and disarms from the tool shortcut', async () => {
    mount(BuilderWorkspace)

    pressKey('1')
    await nextTick()
    expect(activeToolId.value).toBe('div')

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
    arm('div')
    const wrapper = mount(BuilderWorkspace)

    firePointer(wrapper, 'pointerdown', { x: 0, y: 0 })
    firePointer(wrapper, 'pointermove', { x: 100, y: 100 })
    await nextTick()

    pressKey('Escape')
    await nextTick()

    expect(activeToolId.value).toBeNull()
    expect(wrapper.find('.workspace__ghost').exists()).toBe(false)

    firePointer(wrapper, 'pointerup', { x: 100, y: 100 })
    await nextTick()

    expect(elements.value).toHaveLength(0)
  })
})
