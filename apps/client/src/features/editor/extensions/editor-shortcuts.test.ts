import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { EditorShortcuts } from "./editor-shortcuts";

describe("EditorShortcuts", () => {
  const editors: Editor[] = [];

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
  });

  it("deletes the current line with Mod-y", () => {
    const editor = new Editor({
      extensions: [StarterKit, EditorShortcuts],
      content: "<p>First line</p><p>Second line</p>",
    });
    editors.push(editor);

    editor.commands.setTextSelection(3);
    editor.commands.keyboardShortcut("Mod-y");

    expect(editor.getHTML()).toBe("<p>Second line</p>");
  });
});
