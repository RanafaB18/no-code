import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Auto-unmount between tests comes from vitest.setup.ts. It is load-
// bearing here: leaked workspaces re-render the same module-level
// elements, which would multiply every count measured below.

/**
 * Counts how often a style binding is rebuilt.
 *
 * Guards the reason NodeRenderer exists as its own component: built
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
const { useCanvasNodes } = await import('../composables/useCanvasNodes')

const { arm, disarm } = useTools()
const { addNode, selectNode, updateStyle, resetDocument } = useCanvasNodes()

const EXISTING = 20

/**
 * Invariants these tests exist to protect, all in NodeRenderer.vue:
 *
 *  - `:nodeId` is its ONLY prop, and it is a **string**. It must never
 *    become an object: a primitive cannot change identity, which is what
 *    stops a parent's re-render from cascading into its children.
 *  - Node data is looked up per-renderer from the store, never passed
 *    down. A `:selected` or `:highlighted` prop would make every node in
 *    the document re-render whenever that value changed.
 *  - No inline handlers in a `v-for` — an arrow is a fresh function each
 *    render and defeats Vue's props-identity check.
 *  - `:key` is the node id.
 *  - `styleBinding` depends on nothing but that one node's `styles`.
 *  - Overlays (selection frame, drop highlight) are siblings, never
 *    props; the drag ghost teleports rather than being passed down.
 */

/** Builds a tree: `roots` chains, each `depth` deep. */
function buildTree(roots: number, depth: number) {
  const leaves: string[] = []
  for (let r = 0; r < roots; r += 1) {
    let parentId: string | null = null
    for (let d = 0; d < depth; d += 1) {
      parentId = addNode('div', { width: r * 10 + d }, parentId).id
    }
    if (parentId) leaves.push(parentId)
  }
  return leaves
}

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
  resetDocument()
  selectNode(null)
  disarm()
  bindingCalls.count = 0
})

describe('workspace rendering cost', () => {
  it('does not rebuild every element on each frame of a draw-drag', async () => {
    for (let i = 0; i < EXISTING; i += 1) addNode('div', { width: i + 10 })

    const wrapper = mount(BuilderWorkspace)
    await nextTick()
    bindingCalls.count = 0

    arm('frame')
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

  it('rebuilds only the edited element when a nested style changes', async () => {
    const leaves = buildTree(5, 4)
    const deepest = leaves[0] as string

    mount(BuilderWorkspace)
    await nextTick()
    bindingCalls.count = 0

    updateStyle(deepest, 'padding', '1rem')
    await nextTick()

    expect(bindingCalls.count).toBe(1)
  })

  it('rebuilds only the created element when drawing into a nested frame', async () => {
    const leaves = buildTree(5, 4)
    const target = leaves[0] as string

    const wrapper = mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()
    bindingCalls.count = 0

    arm('frame')
    await nextTick()

    // Pressing inside a frame sets the drop target and teleports the
    // ghost into it. Fails if the highlight is ever reimplemented as a
    // prop on NodeRenderer, or if the ghost is passed down the tree
    // instead of teleported — either would re-render all 20 per frame.
    const node = wrapper.get(`[data-node-id="${target}"]`).element
    fire(node, 'pointerdown', 0, 0)
    for (let i = 1; i <= 10; i += 1) {
      fire(node, 'pointermove', i * 10, i * 5)
      await nextTick()
    }
    fire(wrapper.element, 'pointerup', 100, 50)
    await nextTick()

    expect(bindingCalls.count).toBe(1)
  })

  it('rebuilds nothing when the selection changes', async () => {
    const leaves = buildTree(5, 4)
    const deepest = leaves[0] as string

    mount(BuilderWorkspace, { attachTo: document.body })
    await nextTick()
    bindingCalls.count = 0

    // Selection is an overlay measured from the DOM, not element state.
    // Fails if anyone adds a per-element `:selected` prop.
    selectNode(deepest)
    await nextTick()
    selectNode(null)
    await nextTick()

    expect(bindingCalls.count).toBe(0)
  })
})
