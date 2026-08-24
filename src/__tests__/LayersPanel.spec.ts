import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import LayersPanel from '../components/LayersPanel.vue'
import { useCanvasNodes } from '../composables/useCanvasNodes'

const { addNode, selectNode, selectedId, resetDocument } = useCanvasNodes()

function labels(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.layers__label').map((row) => row.text())
}

function depths(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('.layers__row')
    .map((row) => row.attributes('style')?.match(/--depth:\s*(\d+)/)?.[1])
}

beforeEach(() => {
  resetDocument()
  selectNode(null)
})

describe('LayersPanel', () => {
  it('shows the page even in an empty document', () => {
    const wrapper = mount(LayersPanel)

    expect(labels(wrapper)).toEqual(['Page'])
  })

  it('names each frame after the tool that draws it', () => {
    addNode('div', { layout: 'none' })
    addNode('div', { layout: 'flex' })
    addNode('div', { layout: 'grid' })

    expect(labels(mount(LayersPanel))).toEqual(['Page', 'Frame', 'Flex', 'Grid'])
  })

  it('lists nodes depth-first, in the order the canvas paints them', () => {
    const first = addNode('div', { layout: 'flex' })
    addNode('div', { layout: 'grid' }, first.id)
    addNode('div', { layout: 'none' })

    const wrapper = mount(LayersPanel)
    // The nested Grid comes directly after its parent, not after the
    // second top-level frame.
    expect(labels(wrapper)).toEqual(['Page', 'Flex', 'Grid', 'Frame'])
    expect(depths(wrapper)).toEqual(['0', '1', '2', '1'])
  })

  it('selects the node behind a row', async () => {
    const node = addNode('div', { layout: 'none' })
    const wrapper = mount(LayersPanel)

    await wrapper.findAll('.layers__label')[1]!.trigger('click')

    expect(selectedId.value).toBe(node.id)
  })

  it('marks the selected row, however it was selected', () => {
    const node = addNode('div', { layout: 'none' })
    selectNode(node.id)

    const selected = mount(LayersPanel).findAll('.layers__row--selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]!.text()).toContain('Frame')
  })

  it('deletes a node and everything under it', async () => {
    const parent = addNode('div', { layout: 'flex' })
    addNode('div', { layout: 'grid' }, parent.id)
    const wrapper = mount(LayersPanel)

    await wrapper.get('[aria-label="Delete Flex"]').trigger('click')

    expect(labels(wrapper)).toEqual(['Page'])
  })

  it('offers no delete for the page itself', () => {
    // `removeNode` refuses the viewport, so a button here would do nothing.
    const wrapper = mount(LayersPanel)

    expect(wrapper.find('[aria-label="Delete Page"]').exists()).toBe(false)
  })

  it('hides a whole subtree when a row is collapsed', async () => {
    const parent = addNode('div', { layout: 'flex' })
    const child = addNode('div', { layout: 'grid' }, parent.id)
    addNode('div', { layout: 'none' }, child.id)
    const wrapper = mount(LayersPanel)

    await wrapper.get('[aria-label="Collapse Flex"]').trigger('click')

    // The grandchild goes with it, not just the direct child.
    expect(labels(wrapper)).toEqual(['Page', 'Flex'])

    await wrapper.get('[aria-label="Expand Flex"]').trigger('click')
    expect(labels(wrapper)).toEqual(['Page', 'Flex', 'Grid', 'Frame'])
  })

  it('offers no twisty for a node with no children', () => {
    addNode('div', { layout: 'none' })
    const wrapper = mount(LayersPanel)

    expect(wrapper.findAll('.layers__twisty--empty')).toHaveLength(1)
  })

  it('keeps the page collapsible, since everything hangs off it', async () => {
    addNode('div', { layout: 'none' })
    const wrapper = mount(LayersPanel)

    await wrapper.get('[aria-label="Collapse Page"]').trigger('click')

    expect(labels(wrapper)).toEqual(['Page'])
  })
})
