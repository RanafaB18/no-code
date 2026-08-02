import { beforeEach, describe, expect, it } from 'vitest'

import {
  ELEMENT_TYPES,
  addNode,
  getNode,
  resetDocument,
  updateStyle,
  useCanvasNodes,
  walkNodes,
  walkRoots,
} from '../composables/useCanvasNodes'

const { nodes, rootIds, selectedNode, selectNode } = useCanvasNodes()

// Module-level singleton state, so it survives between tests.
beforeEach(resetDocument)

describe('useCanvasNodes', () => {
  it('starts empty', () => {
    expect(rootIds.value).toEqual([])
    expect(Object.keys(nodes.value)).toEqual([])
    expect(selectedNode.value).toBeNull()
  })

  it('appends new roots in order', () => {
    const first = addNode('div')
    const second = addNode('div')

    expect(rootIds.value).toEqual([first.id, second.id])
    expect(first.parentId).toBeNull()
  })

  it('gives each node a distinct id and an empty children list', () => {
    const first = addNode('div')
    const second = addNode('div')

    expect(first.id).not.toBe(second.id)
    expect(first.childrenIds).toEqual([])
  })

  it('links a child to its parent in both directions', () => {
    const parent = addNode('div')
    const child = addNode('div', {}, parent.id)

    // The relationship is ids, never nested objects.
    expect(child.parentId).toBe(parent.id)
    expect(getNode(parent.id)?.childrenIds).toEqual([child.id])
    // The child is a root's descendant, not a root itself.
    expect(rootIds.value).toEqual([parent.id])
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
    expect(getNode(undefined)).toBeNull()
  })

  it('falls back to a root for an unknown parent rather than throwing', () => {
    const orphan = addNode('div', {}, 'does-not-exist')

    expect(orphan.parentId).toBeNull()
    expect(rootIds.value).toContain(orphan.id)
  })

  it('updates styles on the addressed node only', () => {
    const first = addNode('div')
    const second = addNode('div')

    updateStyle(first.id, 'padding', '1rem')

    expect(getNode(first.id)?.styles.padding).toBe('1rem')
    expect(getNode(second.id)?.styles.padding).toBeUndefined()
  })

  it('treats an empty value as clearing a property', () => {
    const node = addNode('div', { padding: '1rem' })

    updateStyle(node.id, 'padding', '')

    expect(getNode(node.id)?.styles.padding).toBe('')
  })

  it('ignores a style update for an unknown id rather than throwing', () => {
    expect(() => updateStyle('nope', 'padding', '1rem')).not.toThrow()
  })

  it('resolves the selected node, and null when nothing is selected', () => {
    const node = addNode('div', { width: '120px' })

    expect(selectedNode.value).toBeNull()

    selectNode(node.id)
    expect(selectedNode.value?.styles.width).toBe('120px')

    selectNode(null)
    expect(selectedNode.value).toBeNull()
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

  it('walks every root in order', () => {
    const first = addNode('div')
    const nested = addNode('div', {}, first.id)
    const second = addNode('div')

    expect([...walkRoots()].map((node) => node.id)).toEqual([first.id, nested.id, second.id])
  })

  it('yields nothing when walking an unknown id', () => {
    expect([...walkNodes('nope')]).toEqual([])
  })

  it('clears the whole document on reset', () => {
    const node = addNode('div')
    addNode('div', {}, node.id)
    selectNode(node.id)

    resetDocument()

    expect(rootIds.value).toEqual([])
    expect(Object.keys(nodes.value)).toEqual([])
    expect(selectedNode.value).toBeNull()
  })

  it('only creates known element types', () => {
    expect(ELEMENT_TYPES).toContain(addNode('div').type)
  })
})
