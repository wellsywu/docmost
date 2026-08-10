import { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";

/**
 * Reading mode toggles via `editor.setEditable()` on the same editor instance.
 * That neither dispatches a transaction nor re-renders node views, so anything
 * derived from `editor.isEditable` inside a node view goes stale until some
 * unrelated re-render happens (or the page is reloaded).
 *
 * `setEditable` emits `update` — not `transaction` — so both events are needed:
 * `update` catches the mode switch, `transaction` catches everything else that
 * can flip editability without going through `setEditable`.
 */
export function useEditorEditable(editor: Editor): boolean {
  const [isEditable, setIsEditable] = useState(() => editor.isEditable);

  useEffect(() => {
    const sync = () => setIsEditable(editor.isEditable);
    sync();
    editor.on("update", sync);
    editor.on("transaction", sync);
    return () => {
      editor.off("update", sync);
      editor.off("transaction", sync);
    };
  }, [editor]);

  return isEditable;
}
