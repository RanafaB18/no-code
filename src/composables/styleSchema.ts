import {
  isViewport,
  resolvedPosition,
  stretchesAxis,
  usesSizeValue,
  type CanvasNode,
  type NodeLayout,
  type NodePosition,
  type SizeAxis,
  type SizeMode,
} from './useCanvasNodes'

/**
 * The properties the inspector can edit.
 *
 * A registry, not a hardcoded form: StyleInspector renders itself by
 * iterating this, so adding a property here is the only change needed to
 * gain a control for it. Same posture as `THEMES` and `TOOLS` — extend
 * the array, don't refactor the consumer.
 */

/**
 * Which form input the user is given.
 *
 * Says nothing about what it writes — several properties share one input.
 *
 *   'number'  numeric field, for geometry
 *   'length'  free-text CSS length ('12px', '1rem', 'auto')
 *   'color'   native colour picker
 *   'select'  dropdown constrained to the property's `options`
 *   'pins'    the constraint widget — no single value, so it renders its
 *             own control and writes through directly
 */
export type StyleInputType = 'number' | 'length' | 'color' | 'select' | 'pins'

/**
 * Where a value lives.
 *
 * `node` writes a first-class field — geometry, layout, position — which
 * the canvas manipulates directly and which must never be a CSS string.
 * `style` writes into the node's `styles` map.
 */
export type PropertySource = 'node' | 'style'

/**
 * A value that may depend on the node being edited.
 *
 * Some properties cannot be described statically: `fill` is only a real
 * choice for a node its parent lays out, and a size field's unit depends
 * on the mode chosen above it. Resolving per node keeps that knowledge in
 * the schema rather than spreading it through the inspector's template.
 */
export type Dynamic<T> = T | ((node: CanvasNode) => T)

export function resolveDynamic<T>(value: Dynamic<T>, node: CanvasNode): T {
  return typeof value === 'function' ? (value as (node: CanvasNode) => T)(node) : value
}

export interface StyleProperty {
  /** For `style`, the camelCase CSS property. For `node`, the field name. */
  key: string
  label: string
  input: StyleInputType
  source: PropertySource
  /** Only meaningful for `input: 'select'`. */
  options?: Dynamic<readonly string[]>
  placeholder?: Dynamic<string>
  /**
   * Hides a property that would be inert in the node's current context —
   * offsets under a parent that positions its own children, or flex
   * options on a frame with no layout. Showing a value the browser
   * ignores is worse than showing nothing.
   */
  appliesTo?: (node: CanvasNode) => boolean
}

export const LAYOUT_VALUES = ['none', 'flex', 'grid'] as const satisfies readonly NodeLayout[]

export const POSITION_VALUES = ['auto', 'absolute'] as const satisfies readonly NodePosition[]

/** True when the node positions itself, so its offsets actually apply. */
function isPositioned(node: CanvasNode) {
  return resolvedPosition(node) === 'absolute'
}

/** True when the node arranges its own children, so flex/grid options apply. */
function laysOutChildren(node: CanvasNode) {
  return node.layout !== 'none'
}

export const SIZE_MODES = [
  'fixed',
  'relative',
  'fill',
  'fit',
] as const satisfies readonly SizeMode[]

/**
 * The size modes a node can actually use.
 *
 * `fill` is dropped for a node that positions itself: it is `flex-grow`
 * or `stretch` underneath, and neither reaches a box its parent has
 * stopped laying out. Such a node fills by pinning both edges instead —
 * the constraint widget, not this control.
 */
function sizeModesFor(node: CanvasNode): readonly string[] {
  if (resolvedPosition(node) === 'relative') return SIZE_MODES
  return SIZE_MODES.filter((mode) => mode !== 'fill')
}

/** True when an edge is pinned, so its distance is real and editable. */
function pinned(edge: 'left' | 'right' | 'top' | 'bottom') {
  return (node: CanvasNode) => isPositioned(node) && node[edge] !== undefined
}

/**
 * True when the axis has a size to state.
 *
 * Both a mode that reads no number and a pair of pins that derive the
 * size take the field away — in the second case because the parent
 * decides it, and offering a box would imply otherwise.
 */
function statesSize(axis: SizeAxis) {
  return (node: CanvasNode) =>
    usesSizeValue(axis === 'width' ? node.widthMode : node.heightMode) && !stretchesAxis(node, axis)
}

/** The unit the number beside a mode is read in. */
function unitFor(axis: SizeAxis) {
  return (node: CanvasNode) =>
    (axis === 'width' ? node.widthMode : node.heightMode) === 'relative' ? '%' : 'px'
}

export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  // Layout — how this frame arranges its children.
  { key: 'layout', label: 'Layout', input: 'select', source: 'node', options: LAYOUT_VALUES },
  {
    key: 'flexDirection',
    label: 'Direction',
    input: 'select',
    source: 'style',
    options: ['row', 'column'],
    appliesTo: laysOutChildren,
  },
  { key: 'gap', label: 'Gap', input: 'length', source: 'style', appliesTo: laysOutChildren },
  {
    key: 'justifyContent',
    label: 'Justify',
    input: 'select',
    source: 'style',
    options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
    appliesTo: laysOutChildren,
  },
  {
    key: 'alignItems',
    label: 'Align',
    input: 'select',
    source: 'style',
    options: ['stretch', 'flex-start', 'center', 'flex-end'],
    appliesTo: laysOutChildren,
  },

  // Position — how this frame places itself. Offsets are hidden when a
  // parent lays it out, since it is then placed by the parent and the
  // values would do nothing.
  {
    key: 'position',
    label: 'Type',
    input: 'select',
    source: 'node',
    options: POSITION_VALUES,
    // The viewport is the coordinate origin — there is nothing above it to
    // position against — so `updatePosition` refuses it. Offering the
    // control anyway would be offering one that silently does nothing.
    appliesTo: (node) => !isViewport(node.id),
  },
  { key: 'pins', label: 'Constraints', input: 'pins', source: 'node', appliesTo: isPositioned },
  // One field per pinned edge. An unpinned edge has no distance to show,
  // so an empty box there would invite typing a value the widget is the
  // only way to actually establish.
  { key: 'left', label: 'Left', input: 'number', source: 'node', appliesTo: pinned('left') },
  { key: 'right', label: 'Right', input: 'number', source: 'node', appliesTo: pinned('right') },
  { key: 'top', label: 'Top', input: 'number', source: 'node', appliesTo: pinned('top') },
  { key: 'bottom', label: 'Bottom', input: 'number', source: 'node', appliesTo: pinned('bottom') },

  // Size — a mode per axis, then the number that mode reads. The number
  // is hidden under `fill` and `fit`, which take no value at all.
  { key: 'widthMode', label: 'Width', input: 'select', source: 'node', options: sizeModesFor },
  {
    key: 'width',
    label: 'W',
    input: 'number',
    source: 'node',
    placeholder: unitFor('width'),
    appliesTo: statesSize('width'),
  },
  { key: 'heightMode', label: 'Height', input: 'select', source: 'node', options: sizeModesFor },
  {
    key: 'height',
    label: 'H',
    input: 'number',
    source: 'node',
    placeholder: unitFor('height'),
    appliesTo: statesSize('height'),
  },

  // Appearance.
  { key: 'padding', label: 'Padding', input: 'length', source: 'style', placeholder: '0' },
  { key: 'backgroundColor', label: 'Background', input: 'color', source: 'style' },
  { key: 'borderWidth', label: 'Border width', input: 'length', source: 'style', placeholder: '0' },
  {
    key: 'borderStyle',
    label: 'Border style',
    input: 'select',
    source: 'style',
    options: ['none', 'solid', 'dashed', 'dotted'],
  },
  { key: 'borderColor', label: 'Border color', input: 'color', source: 'style' },
  { key: 'borderRadius', label: 'Radius', input: 'length', source: 'style', placeholder: '0' },

  /**
   * `overflow` defaults to `visible`, so a child that outgrows its parent
   * spills out and paints over whatever is beneath. This is the only
   * property that clips, or produces a scrollbar.
   *
   * `clip` is a real CSS value, not a friendly name for `hidden`: both
   * clip, but `hidden` still makes the box a scroll container that can be
   * scrolled programmatically, while `clip` creates none at all.
   */
  {
    key: 'overflow',
    label: 'Overflow',
    input: 'select',
    source: 'style',
    options: ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  },
]

/** The properties that apply to a node, in schema order. */
export function propertiesFor(node: CanvasNode): readonly StyleProperty[] {
  return STYLE_PROPERTIES.filter((property) => property.appliesTo?.(node) ?? true)
}

/**
 * Strips unset values before the styles reach a `:style` binding.
 *
 * The inspector writes '' to mean "not set"; passing that through would
 * emit an empty declaration rather than leaving the property alone.
 *
 * Tested against '' specifically rather than falsiness: a zero is a
 * legitimate value the user may have typed, and while the string '0' is
 * truthy today, a bare `Boolean` check would start silently discarding
 * zeroes the moment this map ever holds numbers.
 */
export function toStyleBinding(styles: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(styles).filter(([, value]) => value !== ''))
}
