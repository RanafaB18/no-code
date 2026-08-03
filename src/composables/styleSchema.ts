import {
  canLockAspect,
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
 *
 * The rest are **widgets**: they hold no single value, so they render
 * their own control and write through directly rather than going through
 * the shared field row.
 *
 *   'pins'    the constraint widget — which edges are anchored
 *   'aspect'  the width/height ratio lock
 *   'corners' border radius, uniform or per corner
 */
export type StyleInputType =
  'number' | 'length' | 'color' | 'select' | 'pins' | 'aspect' | 'corners'

const WIDGET_INPUTS: readonly StyleInputType[] = ['pins', 'aspect', 'corners']

/**
 * True for a property with no single field behind it.
 *
 * Everything that reads or writes "the value" — the clear button, the
 * "is it set?" test that decides whether an optional row is shown — has to
 * stand aside for these and let the widget answer instead.
 */
export function isWidget(property: StyleProperty): boolean {
  return WIDGET_INPUTS.includes(property.input)
}

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

/**
 * The inspector's groups, in panel order.
 *
 * A flat list of twenty-odd controls is unreadable, and the grouping is
 * not cosmetic: `layout` is what this frame does to its children, while
 * `position` and `size` are what happens to the frame itself. Keeping
 * that boundary visible is most of what makes the panel legible.
 */
export const SECTIONS = [
  { id: 'layout', label: 'Layout' },
  { id: 'position', label: 'Position' },
  { id: 'size', label: 'Size' },
  { id: 'appearance', label: 'Appearance' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export interface StyleProperty {
  /** For `style`, the camelCase CSS property. For `node`, the field name. */
  key: string
  label: string
  section: SectionId
  /**
   * Hidden until it has a value, or until it is picked from the section's
   * `+` menu. For properties most frames never set — borders, radius,
   * overflow — where an always-visible empty box costs more attention
   * than it saves.
   */
  optional?: boolean
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
  /**
   * Whether a widget property holds a value, which decides whether an
   * optional row stays visible once it has one. Only widgets need it —
   * everything else is answered by reading `key`.
   */
  hasValue?: (node: CanvasNode) => boolean
}

/**
 * The corners of a border radius, in CSS's own order.
 *
 * Listed once here rather than in the widget, because the schema also has
 * to know them: a radius set per corner still counts as the `Radius` row
 * holding a value, and that row's key is the uniform property.
 */
export const UNIFORM_RADIUS_KEY = 'borderRadius'

export const RADIUS_CORNERS = [
  { key: 'borderTopLeftRadius', label: 'Top left' },
  { key: 'borderTopRightRadius', label: 'Top right' },
  { key: 'borderBottomRightRadius', label: 'Bottom right' },
  { key: 'borderBottomLeftRadius', label: 'Bottom left' },
] as const

/** Set means non-empty: '' is how the inspector spells "unset". */
export function isStyleSet(node: CanvasNode, key: string): boolean {
  return (node.styles[key] ?? '') !== ''
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
  {
    key: 'layout',
    section: 'layout',
    label: 'Layout',
    input: 'select',
    source: 'node',
    options: LAYOUT_VALUES,
  },
  {
    key: 'flexDirection',
    section: 'layout',
    label: 'Direction',
    input: 'select',
    source: 'style',
    options: ['row', 'column'],
    appliesTo: laysOutChildren,
  },
  {
    key: 'gap',
    section: 'layout',
    label: 'Gap',
    input: 'length',
    source: 'style',
    appliesTo: laysOutChildren,
  },
  {
    key: 'justifyContent',
    section: 'layout',
    label: 'Justify',
    input: 'select',
    source: 'style',
    options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
    appliesTo: laysOutChildren,
  },
  {
    key: 'alignItems',
    section: 'layout',
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
    section: 'position',
    label: 'Type',
    input: 'select',
    source: 'node',
    options: POSITION_VALUES,
    // The viewport is the coordinate origin — there is nothing above it to
    // position against — so `updatePosition` refuses it. Offering the
    // control anyway would be offering one that silently does nothing.
    appliesTo: (node) => !isViewport(node.id),
  },
  {
    key: 'pins',
    section: 'position',
    label: 'Constraints',
    input: 'pins',
    source: 'node',
    appliesTo: isPositioned,
  },
  // One field per pinned edge. An unpinned edge has no distance to show,
  // so an empty box there would invite typing a value the widget is the
  // only way to actually establish.
  {
    key: 'left',
    section: 'position',
    label: 'Left',
    input: 'number',
    source: 'node',
    appliesTo: pinned('left'),
  },
  {
    key: 'right',
    section: 'position',
    label: 'Right',
    input: 'number',
    source: 'node',
    appliesTo: pinned('right'),
  },
  {
    key: 'top',
    section: 'position',
    label: 'Top',
    input: 'number',
    source: 'node',
    appliesTo: pinned('top'),
  },
  {
    key: 'bottom',
    section: 'position',
    label: 'Bottom',
    input: 'number',
    source: 'node',
    appliesTo: pinned('bottom'),
  },

  // Size — a mode per axis, then the number that mode reads. The number
  // is hidden under `fill` and `fit`, which take no value at all.
  {
    key: 'widthMode',
    section: 'size',
    label: 'Width',
    input: 'select',
    source: 'node',
    options: sizeModesFor,
  },
  {
    key: 'width',
    section: 'size',
    label: 'W',
    input: 'number',
    source: 'node',
    placeholder: unitFor('width'),
    appliesTo: statesSize('width'),
  },
  {
    key: 'heightMode',
    section: 'size',
    label: 'Height',
    input: 'select',
    source: 'node',
    options: sizeModesFor,
  },
  {
    key: 'height',
    section: 'size',
    label: 'H',
    input: 'number',
    source: 'node',
    placeholder: unitFor('height'),
    appliesTo: statesSize('height'),
  },
  // Last in the section, under the two fields it ties together.
  {
    key: 'aspectRatio',
    section: 'size',
    label: 'Ratio',
    input: 'aspect',
    source: 'node',
    appliesTo: canLockAspect,
  },

  // Appearance.
  {
    key: 'padding',
    section: 'appearance',
    optional: true,
    label: 'Padding',
    input: 'length',
    source: 'style',
    placeholder: '0',
  },
  {
    key: 'backgroundColor',
    section: 'appearance',
    optional: true,
    label: 'Background',
    input: 'color',
    source: 'style',
  },
  {
    key: 'borderWidth',
    section: 'appearance',
    optional: true,
    label: 'Border width',
    input: 'length',
    source: 'style',
    placeholder: '0',
  },
  {
    key: 'borderStyle',
    section: 'appearance',
    optional: true,
    label: 'Border style',
    input: 'select',
    source: 'style',
    options: ['none', 'solid', 'dashed', 'dotted'],
  },
  {
    key: 'borderColor',
    section: 'appearance',
    optional: true,
    label: 'Border color',
    input: 'color',
    source: 'style',
  },
  // One row for five properties: the widget writes either the shorthand or
  // the four corners, never both, so the row counts as set when any of
  // them holds a value.
  {
    key: UNIFORM_RADIUS_KEY,
    section: 'appearance',
    optional: true,
    label: 'Radius',
    input: 'corners',
    source: 'style',
    hasValue: (node) =>
      isStyleSet(node, UNIFORM_RADIUS_KEY) ||
      RADIUS_CORNERS.some((corner) => isStyleSet(node, corner.key)),
  },

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
    section: 'appearance',
    optional: true,
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

export interface PropertySection {
  id: SectionId
  label: string
  properties: readonly StyleProperty[]
}

/**
 * The applicable properties, grouped.
 *
 * Sections with nothing in them are dropped rather than rendered empty —
 * a frame with no layout has no flex options to offer, and a heading over
 * a void reads as something failing to load.
 */
export function sectionsFor(node: CanvasNode): readonly PropertySection[] {
  const applicable = propertiesFor(node)
  return SECTIONS.map((section) => ({
    ...section,
    properties: applicable.filter((property) => property.section === section.id),
  })).filter((section) => section.properties.length > 0)
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
