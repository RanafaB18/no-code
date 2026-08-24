import { computed, ref } from 'vue'

import type { ElementType, NodeInit, NodeLayout } from './useCanvasNodes'

export interface Tool {
  /**
   * The tool's own identity — deliberately *not* the element type it
   * creates. Several tools emit the same tag with different seed fields,
   * which is exactly what Frame, Flex and Grid are, so the two cannot be
   * the same field.
   */
  id: string
  /** Toolbar button text. */
  label: string
  /**
   * Single key that arms/disarms this tool, matched case-insensitively.
   * Tools are numbered from '1' in toolbar order; letters are allowed
   * for tools that later earn a mnemonic of their own.
   */
  shortcut: string
  /** The HTML tag this tool creates. */
  creates: ElementType
  /**
   * The node fields and styles stamped onto whatever this tool creates.
   *
   * A function rather than a literal so that a tool handing out object
   * fields cannot hand the same object to two nodes. Each entry's seed is
   * fixed — a tool *is* one kind of thing to draw, so there is nothing
   * left here for a separate mode selector to vary.
   */
  seedInit: () => NodeInit
  /**
   * Frames stamped inside whatever this tool creates, in order.
   *
   * A frame that arranges its children is nothing to look at without any:
   * drawing one and seeing an empty box gives no sign the tool did
   * anything, and no hint of what it is for. So the tools that lay out
   * children come with children.
   *
   * A function for the same reason `seedInit` is one — two frames drawn
   * with the same tool must not end up sharing a styles object.
   *
   * Required rather than optional, so a tool that seeds nothing says so.
   * `as const` keeps each entry's literal type, and an entry that simply
   * omitted this would have no such property for the drawing code to ask
   * about — the union would not agree on its own shape.
   */
  seedChildren: () => NodeInit[]
}

/** Seeded on the frames that arrange children, in px. */
const GAP = '10px'

/** Two even tracks — the 2×2 a new grid starts as. */
const TRACKS = 'repeat(2, 1fr)'

/**
 * What a new frame is filled with.
 *
 * A frame with no fill is a dashed outline around nothing, which reads as
 * a hole in the page rather than a thing on it. Something to see is the
 * point of drawing one.
 *
 * Lower case because `<input type="color">` reports its value that way —
 * stored as anything else, the swatch in the inspector would rewrite it
 * the first time it was opened and closed without a change being made.
 */
const FILL = '#bbddff'

/**
 * A seeded child: it claims an even share of whatever it is put inside.
 *
 * `fill` on both axes rather than a size, and not merely for neatness —
 * both axes default to `fixed`, and a `fixed` axis with no number renders
 * as `auto`, which collapses an empty frame to nothing. A seeded child
 * without this would be invisible. See `fillFor` in NodeRenderer.vue for
 * what fill becomes in each kind of parent.
 *
 * These carry the colour rather than the frame around them: filling both
 * would make the gaps between children show the parent's own fill, and
 * the whole thing would read as one solid block with the arrangement —
 * the entire reason the children are here — invisible inside it.
 */
const fillChild = (): NodeInit => ({
  widthMode: 'fill',
  heightMode: 'fill',
  styles: { backgroundColor: FILL },
})

/**
 * The creation tools available to draw with.
 *
 * Adding a tool is one entry here: the tool menu renders from this array
 * and the keyboard handler resolves shortcuts against it, so neither
 * needs editing to pick up a new tool.
 *
 * All three draw the same tag and differ only in the layout they stamp —
 * which is the distinction that matters to someone drawing, since it
 * decides whether the box they get places its children where they put
 * them or arranges them itself.
 *
 * `as const satisfies` rather than a `: readonly Tool[]` annotation:
 * the annotation would widen `id` to `string` and lose `ToolId` as a
 * real union, taking `arm`/`toggle`'s type safety with it.
 */
export const TOOLS = [
  {
    id: 'frame',
    label: 'Frame',
    shortcut: '1',
    creates: 'div',
    // `none` is a frame that imposes no layout, so children sit at the
    // coordinates they were drawn at — what makes drawing WYSIWYG.
    //
    // The only tool whose own frame is filled: it has no children of its
    // own to carry the colour for it.
    seedInit: (): NodeInit => ({ layout: 'none', styles: { backgroundColor: FILL } }),
    // Empty, and not for want of a default: a frame that arranges nothing
    // is a place to put whatever you draw next, so putting something in
    // it up front would be in the way.
    seedChildren: () => [],
  },
  {
    id: 'flex',
    label: 'Flex',
    shortcut: '2',
    creates: 'div',
    seedInit: (): NodeInit => ({ layout: 'flex', styles: { gap: GAP } }),
    seedChildren: () => [fillChild(), fillChild()],
  },
  {
    id: 'grid',
    label: 'Grid',
    shortcut: '3',
    creates: 'div',
    // Tracks both ways, so the four below land as a 2×2 rather than
    // stacking in the single column an untracked grid gives you. The gaps
    // are per axis here, unlike flex's one: a grid has two to set.
    seedInit: (): NodeInit => ({
      layout: 'grid',
      styles: {
        gridTemplateColumns: TRACKS,
        gridTemplateRows: TRACKS,
        columnGap: GAP,
        rowGap: GAP,
      },
    }),
    // No span on any of them: absent reads as one cell, which is what
    // each of these wants.
    seedChildren: () => [fillChild(), fillChild(), fillChild(), fillChild()],
  },
] as const satisfies readonly Tool[]

/**
 * What to call a frame with a given layout.
 *
 * Derived from the registry rather than written out again: a layer in the
 * tree should be named after the tool that draws it, and two hand-written
 * lists would eventually disagree about that.
 */
export const LAYOUT_LABEL = Object.fromEntries(
  TOOLS.map((tool) => [tool.seedInit().layout, tool.label]),
) as Record<NodeLayout, string>

/**
 * A tool as it appears in the registry, with `id` still narrowed to its
 * literal. `Tool` itself widens `id` to `string` for authoring, so
 * components handed a registry entry should take this instead — it is
 * what keeps `arm`/`toggle` callable without a cast.
 */
export type RegisteredTool = (typeof TOOLS)[number]

export type ToolId = RegisteredTool['id']

/**
 * The id of the armed creation tool, or `null` when none is armed.
 *
 * `activeToolId` is what distinguishes the builder's two modes:
 * a tool is armed, so dragging draws a new element; or it is `null`,
 * which is select mode, where clicking picks an existing element. Only
 * one tool can be armed at a time — arming a second switches straight
 * to it rather than requiring a disarm first.
 *
 * Module-level for the same reason as `useTheme`'s preference: the armed
 * tool is a single global that the toolbar, the workspace and the
 * keyboard handler all have to agree on.
 */
const activeToolId = ref<ToolId | null>(null)

/** The armed-tool state, plus the actions that change it. */
export function useTools() {
  const activeTool = computed(() => TOOLS.find((tool) => tool.id === activeToolId.value) ?? null)

  function arm(id: ToolId) {
    activeToolId.value = id
  }

  function disarm() {
    activeToolId.value = null
  }

  /**
   * Backs both the toolbar button and the keyboard shortcut, so the two
   * entry points can't develop different behaviour: pressing the key
   * twice disarms exactly like clicking the button twice.
   */
  function toggle(id: ToolId) {
    activeToolId.value = activeToolId.value === id ? null : id
  }

  return { activeToolId, activeTool, arm, disarm, toggle }
}
