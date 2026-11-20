import {
  getMarkType,
  getNodeType,
  objectIncludes,
  type Editor,
} from "@tiptap/core";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";

/**
 * Batched equivalents of `editor.isActive(...)`.
 *
 * `isActive` walks the whole selection (`doc.nodesBetween(from, to)`) and
 * allocates one entry per node in it — per call. The bubble menu's selectors
 * ask the same question many times over on every transaction (20 colours, 12
 * node types, 4 alignments), and a selector runs on every step of a drag
 * selection, so the cost grows with the selected range and is paid dozens of
 * times per mousemove. Measured on a 1500-paragraph document with everything
 * selected: 2.9ms for the 20 colour probes, 1.4ms for the 4 alignment probes,
 * 0.9ms for the 12 node probes — roughly a third of a frame, for answers that
 * all come out of the same traversal.
 *
 * These helpers do that traversal once and answer every query from it. The
 * filtering rules are copied from `@tiptap/core`'s `isNodeActive` /
 * `isMarkActive` verbatim (including the "matched range must cover the whole
 * selection" test and mark exclusion) so the answers are identical — see
 * `batch-active.test.ts`, which asserts exactly that against `editor.isActive`.
 */

type Attributes = Record<string, unknown>;

export interface NodeQuery {
  /** Node type name; omit to match any node (how `isActive({ … })` behaves). */
  name?: string | null;
  attrs?: Attributes;
}

interface NodeRange {
  node: PMNode;
  from: number;
  to: number;
}

interface MarkRange {
  mark: Mark;
  from: number;
  to: number;
}

/**
 * One traversal, one answer per query — same result as calling
 * `editor.isActive(query.name, query.attrs)` for each.
 *
 * The traversal itself does not depend on the query, so every node query can
 * share it.
 */
export function areNodesActive(
  editor: Editor,
  queries: NodeQuery[],
): boolean[] {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const types = queries.map((query) =>
    query.name ? getNodeType(query.name, state.schema) : null,
  );

  const nodeRanges: NodeRange[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      return;
    }
    nodeRanges.push({
      node,
      from: Math.max(from, pos),
      to: Math.min(to, pos + node.nodeSize),
    });
  });

  const selectionRange = to - from;

  return queries.map((query, index) => {
    const type = types[index];
    const matched = nodeRanges
      .filter((range) => !type || type.name === range.node.type.name)
      .filter((range) =>
        objectIncludes(range.node.attrs, query.attrs ?? {}, { strict: false }),
      );

    if (empty) {
      return matched.length > 0;
    }

    const range = matched.reduce((sum, r) => sum + r.to - r.from, 0);
    return range >= selectionRange;
  });
}

/**
 * One traversal per mark type, one answer per attribute set — same result as
 * calling `editor.isActive(markName, attrs)` for each entry of `attrsList`.
 *
 * The traversal depends on the mark type (nodes that don't allow it are
 * pruned, which also changes the covered range), so it is shared across the
 * attribute variants of a single mark rather than across mark types.
 */
export function areMarkAttrsActive(
  editor: Editor,
  markName: string | null,
  attrsList: Attributes[],
): boolean[] {
  const { state } = editor;
  const { empty, ranges } = state.selection;
  const type = markName ? getMarkType(markName, state.schema) : null;

  if (empty) {
    const marks = state.storedMarks || state.selection.$from.marks();
    const ofType = type
      ? marks.filter((mark) => mark.type.name === type.name)
      : marks;
    return attrsList.map((attrs) =>
      ofType.some((mark) =>
        objectIncludes(mark.attrs, attrs, { strict: false }),
      ),
    );
  }

  let selectionRange = 0;
  const markRanges: MarkRange[] = [];

  ranges.forEach(({ $from, $to }) => {
    const from = $from.pos;
    const to = $to.pos;

    state.doc.nodesBetween(from, to, (node, pos) => {
      if (type && node.inlineContent && !node.type.allowsMarkType(type)) {
        return false;
      }
      if (!node.isText && !node.marks.length) {
        return;
      }

      const relativeFrom = Math.max(from, pos);
      const relativeTo = Math.min(to, pos + node.nodeSize);

      selectionRange += relativeTo - relativeFrom;
      node.marks.forEach((mark) => {
        markRanges.push({ mark, from: relativeFrom, to: relativeTo });
      });
    });
  });

  if (selectionRange === 0) {
    return attrsList.map(() => false);
  }

  // Marks of another type that exclude this one count towards coverage, but
  // only once something actually matched — same rule as isMarkActive.
  const excludedRange = markRanges
    .filter((range) =>
      type ? range.mark.type !== type && range.mark.type.excludes(type) : true,
    )
    .reduce((sum, range) => sum + range.to - range.from, 0);

  const ofType = type
    ? markRanges.filter((range) => range.mark.type.name === type.name)
    : markRanges;

  return attrsList.map((attrs) => {
    const matchedRange = ofType
      .filter((range) =>
        objectIncludes(range.mark.attrs, attrs, { strict: false }),
      )
      .reduce((sum, range) => sum + range.to - range.from, 0);

    const range =
      matchedRange > 0 ? matchedRange + excludedRange : matchedRange;
    return range >= selectionRange;
  });
}

/**
 * Batched equivalent of `editor.isActive(attrs)` — the form with no type name,
 * which `isActive` answers as `isNodeActive(null, attrs) || isMarkActive(null,
 * attrs)`. That makes each single call two full traversals, so the alignment
 * selector's four probes cost eight; this answers all of them in two.
 */
export function areAttrsActive(
  editor: Editor,
  attrsList: Attributes[],
): boolean[] {
  const nodes = areNodesActive(
    editor,
    attrsList.map((attrs) => ({ attrs })),
  );
  const marks = areMarkAttrsActive(editor, null, attrsList);
  return attrsList.map((_, index) => nodes[index] || marks[index]);
}
