import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SelectionOptions {
  /**
   * Focus hand-off whitelist. When the editor blurs, the blur event's
   * relatedTarget is matched (via Element.closest) against this selector;
   * only then does the fake ".selection" highlight stay visible. Blurring
   * anywhere else (clicking empty space, another pane, switching windows)
   * drops the highlight so a single click clears the selection visuals.
   */
  preserveSelector: string;
}

const selectionPluginKey = new PluginKey<boolean>('selection');

export const Selection = Extension.create<SelectionOptions>({
  name: 'selection',

  addOptions() {
    return {
      preserveSelector: '[data-keep-editor-selection]',
    };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;

    return [
      new Plugin<boolean>({
        key: selectionPluginKey,
        state: {
          init: () => false,
          // Tiptap's built-in focus-events plugin dispatches "focus"/"blur"
          // metas carrying the DOM event, so this re-evaluates exactly when
          // focus moves. relatedTarget tells us where focus went: keep the
          // highlight only for a hand-off into selection-preserving UI
          // (link input, AI menu, comment dialog).
          apply(tr, keep) {
            const blur = tr.getMeta('blur') as
              | { event?: FocusEvent }
              | undefined;
            if (blur) {
              const target = blur.event?.relatedTarget;
              return (
                target instanceof Element &&
                !!target.closest(options.preserveSelector)
              );
            }
            if (tr.getMeta('focus')) {
              return false;
            }
            return keep;
          },
        },
        props: {
          attributes(state) {
            return selectionPluginKey.getState(state)
              ? { 'data-selection-preserved': 'true' }
              : {};
          },
          decorations(state) {
            if (state.selection.empty) {
              return null;
            }

            // While focused the native ::selection is the single source of
            // highlight; the decoration only stands in for it when focus
            // lives in whitelisted UI (see `apply` above). Never both.
            if (editor.isFocused === true) {
              return null;
            }

            if (!selectionPluginKey.getState(state)) {
              return null;
            }

            return DecorationSet.create(state.doc, [
              Decoration.inline(state.selection.from, state.selection.to, {
                class: 'selection',
              }),
            ]);
          },
        },
      }),
    ];
  },
});

export default Selection;
