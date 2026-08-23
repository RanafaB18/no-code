import { beforeEach, describe, expect, it } from 'vitest'

import { propertiesFor } from '../composables/styleSchema'
import { addNode, resetDocument, useCanvasNodes } from '../composables/useCanvasNodes'

const { viewport } = useCanvasNodes()

beforeEach(resetDocument)

function keysOf(node: Parameters<typeof propertiesFor>[0]) {
  return propertiesFor(node).map((property) => property.key)
}

describe('propertiesFor — Position', () => {
  it('gives the parentless viewport a plain X/Y, not a Type or Constraints row', () => {
    const keys = keysOf(viewport.value)

    expect(keys).toContain('left')
    expect(keys).toContain('top')
    expect(keys).not.toContain('position')
    expect(keys).not.toContain('pins')
  })

  it('gives a parented, in-flow node just the Type row', () => {
    const parent = addNode('div', { layout: 'flex' })
    const child = addNode('div', {}, parent.id)

    const keys = keysOf(child)
    expect(keys).toContain('position')
    expect(keys).not.toContain('left')
    expect(keys).not.toContain('top')
    expect(keys).not.toContain('pins')
  })

  it('gives a parented, absolute node the Constraints widget alongside Type', () => {
    const parent = addNode('div', { layout: 'none' })
    const child = addNode('div', {}, parent.id)

    const keys = keysOf(child)
    expect(keys).toContain('position')
    expect(keys).toContain('pins')
    expect(keys).not.toContain('left')
    expect(keys).not.toContain('top')
  })
})
