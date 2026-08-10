import { NodeViewProps } from "@tiptap/react";
import React, { Suspense, useEffect, useReducer, useState } from "react";
import mermaid from "mermaid";
import { v4 as uuidv4 } from "uuid";
import clsx from "clsx";
import classes from "./code-block.module.css";
import { useTranslation } from "react-i18next";
import { useComputedColorScheme } from "@mantine/core";
import DOMPurify from "dompurify";
import { withControllableEdgeLabelBackground } from "./mermaid-svg";
import { mermaidCacheKey, useMermaidCache } from "./mermaid-cache";
import { useEditorEditable } from "@/features/editor/hooks/use-editor-editable.ts";

// Lazy: keeps the lightbox bundle off the first-paint path. Exposed as a named
// factory so we can also prefetch it before the first click (see effect below).
const importMediaLightbox = () =>
  import("@/features/editor/components/common/media-lightbox.tsx");
const MediaLightbox = React.lazy(importMediaLightbox);

interface MermaidViewProps {
  props: NodeViewProps;
}

export default function MermaidView({ props }: MermaidViewProps) {
  const { t } = useTranslation();
  const computedColorScheme = useComputedColorScheme();
  const { node, editor } = props;
  const cache = useMermaidCache();
  const cacheKey = mermaidCacheKey(node.textContent, computedColorScheme);
  // Rendered output lives in the cache, not in component state, so that a node
  // view rebuild repaints the diagram on its first frame instead of collapsing
  // for as long as `mermaid.render()` takes.
  const [renderCount, countRender] = useReducer(
    (count: number) => count + 1,
    0,
  );
  // What the cache cannot hold: error placeholders (their wording depends on
  // the locale and on editability, neither of which is part of the key) and
  // diagrams too large for the budget. Keyed, so output from an earlier source
  // or palette never shows against the current one.
  const [uncached, setUncached] = useState<{
    key: string;
    html: string;
  } | null>(null);
  const [zoomOpened, setZoomOpened] = useState(false);

  // `peek` rather than `get`: a read during render must not reorder the cache.
  const preview =
    cache.peek(cacheKey) ?? (uncached?.key === cacheKey ? uncached.html : "");

  const isEditable = useEditorEditable(editor);

  // Click-to-zoom is a reading-mode affordance and only makes sense for a
  // successfully rendered diagram (not the error placeholder).
  const isRenderedSvg = preview.includes("<svg");
  const canZoom = !isEditable && isRenderedSvg;

  // Prefetch the lightbox chunk as soon as the diagram is zoomable, so the
  // first click opens instantly instead of waiting on a network fetch.
  useEffect(() => {
    if (canZoom) void importMediaLightbox();
  }, [canZoom]);

  // Update Mermaid config when theme changes.
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: computedColorScheme === "light" ? "default" : "dark",
    });
  }, [computedColorScheme]);

  // Re-render the diagram whenever the node content or theme changes.
  useEffect(() => {
    if (node.textContent.length === 0) return;
    // A cache hit needs no work at all: `preview` already reads through to it.
    // `get` (not `peek`) so the hit counts as a use for eviction ordering.
    if (cache.get(cacheKey)) return;

    // Rendering is async, so a fast edit can leave an earlier render in flight;
    // without this guard it would land after the newer one and show stale output.
    let cancelled = false;
    const id = `mermaid-${uuidv4()}`;

    mermaid
      .render(id, node.textContent)
      .then((item) => {
        const svg = withControllableEdgeLabelBackground(item.svg);
        const stored = cache.set(cacheKey, svg);
        if (cancelled) return;
        // Holding a rejected (oversized) diagram locally matters for more than
        // display: without it the effect would re-run, miss the cache again,
        // and render the same diagram forever.
        if (stored) countRender();
        else setUncached({ key: cacheKey, html: svg });
      })
      .catch((err) => {
        if (cancelled) return;
        setUncached({
          key: cacheKey,
          html: props.editor.isEditable
            ? `<div class="${classes.error}">${t("Mermaid diagram error:")} ${DOMPurify.sanitize(err)}</div>`
            : `<div class="${classes.error}">${t("Invalid Mermaid diagram")}</div>`,
        });
      });

    return () => {
      cancelled = true;
    };
    // `renderCount` re-runs this after a successful render so the cache read
    // above settles; `cacheKey` already covers the source and the palette.
  }, [cacheKey, cache, renderCount, node.textContent]);

  return (
    <>
      <div
        className={clsx(classes.mermaid, canZoom && classes.mermaidZoomable)}
        contentEditable={false}
        onClick={() => {
          // Re-check at click time: authoritative regardless of render timing.
          if (!editor.isEditable && isRenderedSvg) setZoomOpened(true);
        }}
        dangerouslySetInnerHTML={{ __html: preview }}
      ></div>

      {zoomOpened && (
        <Suspense fallback={null}>
          <MediaLightbox
            open={zoomOpened}
            svgHtml={preview}
            onClose={() => setZoomOpened(false)}
          />
        </Suspense>
      )}
    </>
  );
}
