import { Extension } from "@tiptap/core";

export const EditorShortcuts = Extension.create({
  name: "editorShortcuts",
  // This must run before Tiptap's collaboration and UndoRedo extensions,
  // which both bind Mod-y to redo.
  priority: 1001,

  addKeyboardShortcuts() {
    return {
      "Mod-y": () =>
        this.editor.chain().focus().selectParentNode().deleteSelection().run(),
    };
  },
});
