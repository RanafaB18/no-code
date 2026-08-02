import { beforeEach, describe, expect, it } from 'vitest'

import {
  ELEMENT_TYPES,
  VIEWPORT_ID,
  addNode,
  getNode,
  moveNode,
  removeNode,
  resetDocument,
  resolvedPosition,
  updateGeometry,
  updateLayout,
  updatePosition,
  updateStyle,
  useCanvasNodes,
  walkNodes,
} from '../composables/useCanvasNodes'

const { nodes, viewport, selectedNode, selectNode } = useCanvasNodes()

// Module-level singleton state, so it survives between tests.
beforeEach(resetDocument)

describe('useCanvasNodes', () => {
  it('starts as a lone viewport root', () => {
    expect(Object.keys(nodes.value)).toEqual([VIEWPORT_ID])
    expect(viewport.value.childrenIds).toEqual([])
    expect(viewport.value.parentId).toBeNull()
    expect(selectedNode.value).toBeNull()
  })

  it('nests into the viewport when no parent is given', () => {
    const first = addNode('div')
    const second = addNode('div')

    // There is no "no parent" case — everything descends from the viewport.
    expect(first.parentId).toBe(VIEWPORT_ID)
    expect(viewport.value.childrenIds).toEqual([first.id, second.id])
  })

  it('links a child to its parent in both directions', () => {
    const parent = addNode('div')
    const child = addNode('div', {}, parent.id)

    // The relationship is ids, never nested objects.
    expect(child.parentId).toBe(parent.id)
    expect(getNode(parent.id)?.childrenIds).toEqual([child.id])
    expect(viewport.value.childrenIds).toEqual([parent.id])
  })

  it('reaches any node in one lookup, at any depth', () => {
    const root = addNode('div')
    const middle = addNode('div', {}, root.id)
    const leaf = addNode('div', {}, middle.id)

    // No traversal — the whole point of the flat map.
    expect(getNode(leaf.id)?.id).toBe(leaf.id)
    expect(nodes.value[leaf.id]?.parentId).toBe(middle.id)
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(getNode('nope')).toBeNull()
    expect(getNode(null)).toBeNull()
  })

  it('falls back to the viewport for an unknown parent', () => {
    const orphan = addNode('div', {}, 'does-not-exist')

    expect(orphan.parentId).toBe(VIEWPORT_ID)
  })

  it('stores geometry as numbers on the node, never in styles', () => {
    const node = addNode('div', { left: 10, top: 20, width: 300, height: 200 })

    expect(node.left).toBe(10)
    expect(node.width).toBe(300)
    expect(node.styles).toEqual({})
  })

  it('updates geometry, and clears a pin given undefined', () => {
    const node = addNode('div', { left: 10, width: 300 })

    updateGeometry(node.id, { left: 40 })
    expect(getNode(node.id)?.left).toBe(40)

    updateGeometry(node.id, { left: undefined })
    expect(getNode(node.id)?.left).toBeUndefined()
  })

  it('updates styles on the addressed node only', () => {
    const first = addNode('div')
    const second = addNode('div')

    updateStyle(first.id, 'padding', '1rem')

    expect(getNode(first.id)?.styles.padding).toBe('1rem')
    expect(getNode(second.id)?.styles.padding).toBeUndefined()
  })

  it('ignores updates for an unknown id rather than throwing', () => {
    expect(() => updateStyle('nope', 'padding', '1rem')).not.toThrow()
    expect(() => updateGeometry('nope', { left: 1 })).not.toThrow()
  })

  describe('resolvedPosition', () => {
    it('is absolute when the parent imposes no layout', () => {
      const parent = addNode('div', { layout: 'none' })
      const child = addNode('div', {}, parent.id)

      expect(resolvedPosition(child)).toBe('absolute')
    })

    it('is relative when the parent lays its children out', () => {
      const parent = addNode('div', { layout: 'flex' })
      const child = addNode('div', {}, parent.id)

      expect(resolvedPosition(child)).toBe('relative')
    })

    it('is absolute when a child overrides its parent layout', () => {
      const parent = addNode('div', { layout: 'flex' })
      const pinned = addNode('div', { position: 'absolute' }, parent.id)

      // The override is why every consumer asks this rather than reading
      // the parent's layout directly.
      expect(resolvedPosition(pinned)).toBe('absolute')
    })

    it('is never static, and the viewport is always relative', () => {
      const child = addNode('div')

      expect(resolvedPosition(viewport.value)).toBe('relative')
      expect(['absolute', 'relative']).toContain(resolvedPosition(child))
    })
  })

  it('changes layout and position, but never the viewport position', () => {
    const node = addNode('div')

    updateLayout(node.id, 'flex')
    updatePosition(node.id, 'absolute')
    expect(getNode(node.id)?.layout).toBe('flex')
    expect(getNode(node.id)?.position).toBe('absolute')

    updatePosition(VIEWPORT_ID, 'absolute')
    expect(viewport.value.position).toBe('auto')
  })

  it('walks a subtree depth-first, parents before children', () => {
    const root = addNode('div')
    const first = addNode('div', {}, root.id)
    const nested = addNode('div', {}, first.id)
    const second = addNode('div', {}, root.id)

    expect([...walkNodes(root.id)].map((node) => node.id)).toEqual([
      root.id,
      first.id,
      nested.id,
      second.id,
    ])
  })

  describe('removeNode', () => {
    it('evicts the whole subtree, leaving no orphans in the map', () => {
      const parent = addNode('div')
      const child = addNode('div', {}, parent.id)
      const grandchild = addNode('div', {}, child.id)

      removeNode(parent.id)

      // O(subtree), not O(1) — descendants must go too or they leak.
      expect(getNode(child.id)).toBeNull()
      expect(getNode(grandchild.id)).toBeNull()
      expect(Object.keys(nodes.value)).toEqual([VIEWPORT_ID])
      expect(viewport.value.childrenIds).toEqual([])
    })

    it('selects the parent, so you are never stranded', () => {
      const parent = addNode('div')
      const child = addNode('div', {}, parent.id)
      selectNode(child.id)

      removeNode(child.id)

      expect(selectedNode.value?.id).toBe(parent.id)
    })

    it('refuses to remove the viewport', () => {
      removeNode(VIEWPORT_ID)
      expect(getNode(VIEWPORT_ID)).not.toBeNull()
    })
  })

  describe('moveNode', () => {
    it('reparents with three field writes and no subtree churn', () => {
      const from = addNode('div')
      const to = addNode('div')
      const moved = addNode('div', {}, from.id)
      const kept = addNode('div', {}, moved.id)

      moveNode(moved.id, to.id)

      expect(moved.parentId).toBe(to.id)
      expect(getNode(from.id)?.childrenIds).toEqual([])
      expect(getNode(to.id)?.childrenIds).toEqual([moved.id])
      // The subtree travels with it, untouched.
      expect(getNode(moved.id)?.childrenIds).toEqual([kept.id])
    })

    it('refuses to move a node into its own descendant', () => {
      const parent = addNode('div')
      const child = addNode('div', {}, parent.id)

      moveNode(parent.id, child.id)

      expect(parent.parentId).toBe(VIEWPORT_ID)
    })
  })

  it('resets to a lone viewport', () => {
    const node = addNode('div')
    addNode('div', {}, node.id)
    selectNode(node.id)

    resetDocument()

    expect(Object.keys(nodes.value)).toEqual([VIEWPORT_ID])
    expect(viewport.value.childrenIds).toEqual([])
    expect(selectedNode.value).toBeNull()
  })

  it('only creates known element types', () => {
    expect(ELEMENT_TYPES).toContain(addNode('div').type)
  })
})
