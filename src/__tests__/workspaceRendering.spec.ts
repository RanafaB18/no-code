import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Auto-unmount between tests comes from vitest.setup.ts. It is load-
// bearing here: leaked workspaces re-render the same module-level
// elements, which would multiply every count measured below.

/**
 * Counts how often a style binding is rebuilt.
 *
 * Guards the reason WorkspaceElement exists as its own component: built
 * inline in the parent's v-for, the binding was recomputed for every
 * element on every workspace re-render — including each pointermove
 * while drawing, since the drag ghost updates then. As a computed on a
 * child, an element only rebuilds when its own styles change.
 */
const bindingCalls = { count: 0 }

vi.mock('@/composables/styleSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/styleSchema')>()
  return {
    ...actual,
    toStyleBinding: (styles: Record<string, string>) => {
      bindingCalls.count += 1
      return actual.toStyleBinding(styles)
    },
  }
})

const { default: BuilderWorkspace } = await import('../components/BuilderWorkspace.vue')
const { useTools } = await import('../composables/useTools')
const { useWorkspaceElements } = await import('../composables/useWorkspaceElements')

const { arm, disarm } = useTools()
const { elements, addElement, select, updateStyle } = useWorkspaceElements()

const EXISTING = 20

function fire(target: Element, type: string, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
    }),
  )
}

beforeEach(() => {
  elements.value.splice(0)
  select(null)
  disarm()
  bindingCalls.count = 0
})

describe('workspace rendering cost', () => {
  it('does not rebuild every element on each frame of a draw-drag', async () => {
    for (let i = 0; i < EXISTING; i += 1) addElement('div', { width: `${i + 10}px` })

    const wrapper = mount(BuilderWorkspace)
    await nextTick()
    bindingCalls.count = 0

    arm('div')
    await nextTick()

    const frames = 10
    fire(wrapper.element, 'pointerdown', 0, 0)
    for (let i = 1; i <= frames; i += 1) {
      fire(wrapper.element, 'pointermove', i * 10, i * 5)
      await nextTick()
    }
    fire(wrapper.element, 'pointerup', frames * 10, frames * 5)
    await nextTick()

    // No existing element's styles change during a drag, so none should
    // rebuild; only the element created on pointerup builds a binding.
    // Inline in the parent's v-for this was EXISTING * frames (200+).
    expect(bindingCalls.count).toBe(1)
  })

  it('rebuilds only the edited element when a style changes', async () => {
    const first = addElement('div', { width: '10px' })
    for (let i = 1; i < EXISTING; i += 1) addElement('div', { width: `${i + 10}px` })

    mount(BuilderWorkspace)
    await nextTick()
    bindingCalls.count = 0

    updateStyle(first.id, 'padding', '1rem')
    await nextTick()

    expect(bindingCalls.count).toBe(1)
  })
})
