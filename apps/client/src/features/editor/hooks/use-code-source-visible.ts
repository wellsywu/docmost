import { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { useEditorEditable } from "@/features/editor/hooks/use-editor-editable.ts";

/**
 * Whether a code block should reveal its source: only while the editor is
 * editable and the caret sits inside the block. Blocks that render to
 * something else (mermaid) show the rendered form the rest of the time.
 *
 * Editability and selection are combined here rather than in the caller so the
 * two can never be read in a stale combination — that mismatch is what made the
 * source flash on a mode switch (see the reset below).
 */
export function useCodeSourceVisible(
  editor: Editor,
  pos: number,
  nodeSize: number,
): boolean {
  const isEditable = useEditorEditable(editor);
  const [isSelected, setIsSelected] = useState(false);

  // A mode switch always collapses the source. `isSelected` only follows
  // `selectionUpdate`, which never fires in reading mode, so the caret position
  // from the last edit session survives the round trip: re-entering edit mode
  // would expand the block on that stale selection and then collapse it again
  // as soon as ProseMirror reports the real one — a visible flash of the code.
  // Adjusting during render (rather than in an effect) makes React re-render
  // before painting, so the stale combination never reaches the screen.
  const [wasEditable, setWasEditable] = useState(isEditable);
  if (wasEditable !== isEditable) {
    setWasEditable(isEditable);
    setIsSelected(false);
  }

  useEffect(() => {
    const updateSelection = () => {
      const { from, to } = editor.state.selection;
      setIsSelected(
        (from >= pos && from < pos + nodeSize) ||
          (to > pos && to <= pos + nodeSize),
      );
    };

    editor.on("selectionUpdate", updateSelection);
    return () => {
      editor.off("selectionUpdate", updateSelection);
    };
  }, [editor, pos, nodeSize]);

  return isEditable && isSelected;
}
