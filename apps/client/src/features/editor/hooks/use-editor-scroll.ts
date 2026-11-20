import { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

const POLL_INTERVAL_MS = 800;
/** ~30s: far longer than any real mount, short enough to never pile up. */
const MAX_POLLS = 40;

/**
 * Polls `checkFn` until it passes (`true`), `shouldAbort` fires, or the poll
 * budget runs out (`false`).
 *
 * The bound matters more than it looks: the caller's closure holds a whole
 * editor. An editor created for a render React later discarded never mounts,
 * so `checkFn` never passes — an unbounded interval kept every such editor
 * (and its detached DOM) alive forever, which is how a livelocked first load
 * ran the tab out of memory. Aborting on `editor.isDestroyed` releases it on
 * the first tick, since Tiptap destroys editors whose component never mounted.
 */
export function waitForState(
  checkFn: () => boolean,
  shouldAbort: () => boolean = () => false,
  { intervalMs = POLL_INTERVAL_MS, maxPolls = MAX_POLLS } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let polls = 0;
    const interval = setInterval(() => {
      polls += 1;
      if (shouldAbort()) {
        clearInterval(interval);
        resolve(false);
      } else if (checkFn()) {
        clearInterval(interval);
        resolve(true);
      } else if (polls >= maxPolls) {
        clearInterval(interval);
        resolve(false);
      }
    }, intervalMs);
  });
}

export const useEditorScroll = ({
  canScroll,
  initialScrollTo,
}: {
  canScroll: () => boolean;
  initialScrollTo?: string;
}) => {
  const [scrollTo, setScrollTo] = useState<string>(initialScrollTo || "");

  useEffect(() => {
    if (!initialScrollTo) {
      setScrollTo(window.location.hash ? window.location.hash.slice(1) : "");
    }
  }, [initialScrollTo]);

  const handleScrollTo = useCallback(
    async (
      editor: Editor,
      _scrollTo: string | null = null,
      tryCount: number = 0,
    ) => {
      const ready = await waitForState(
        () => canScroll(),
        () => editor.isDestroyed,
      );
      if (!ready) return false;
      return new Promise((resolve) => {
        const MAX_TRY_COUNT = 10;
        if (tryCount >= MAX_TRY_COUNT) {
          resolve(false);
          return;
        }

        const targetId = _scrollTo || scrollTo;
        if (!targetId) {
          resolve(false);
          return;
        }

        if (editor.isDestroyed) {
          resolve(false);
          return;
        }
        const dom = editor.view.dom.querySelector(
          `[id="${targetId}"], [data-id="${targetId}"]`,
        );
        if (dom) {
          dom.scrollIntoView({ behavior: "smooth", block: "start" });
          resolve(true);
        } else {
          setTimeout(async () => {
            resolve(await handleScrollTo(editor, targetId, tryCount + 1));
          }, 200);
        }
      });
    },
    [scrollTo, canScroll],
  );

  return { scrollTo, handleScrollTo };
};
