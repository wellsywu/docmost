import { NodeViewProps } from "@tiptap/react";
import React, { Suspense, useEffect, useState } from "react";
import mermaid from "mermaid";
import { v4 as uuidv4 } from "uuid";
import clsx from "clsx";
import classes from "./code-block.module.css";
import { useTranslation } from "react-i18next";
import { useComputedColorScheme } from "@mantine/core";
import DOMPurify from "dompurify";

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
  const [preview, setPreview] = useState<string>("");
  const [zoomOpened, setZoomOpened] = useState(false);

  // Reading mode toggles via editor.setEditable() on the same instance, which
  // doesn't reliably re-render node views — track it explicitly.
  const [isEditable, setIsEditable] = useState(editor.isEditable);
  useEffect(() => {
    const sync = () => setIsEditable(editor.isEditable);
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

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
    const id = `mermaid-${uuidv4()}`;
    if (node.textContent.length > 0) {
      mermaid
        .render(id, node.textContent)
        .then((item) => {
          setPreview(item.svg);
        })
        .catch((err) => {
          if (props.editor.isEditable) {
            setPreview(
              `<div class="${classes.error}">${t("Mermaid diagram error:")} ${DOMPurify.sanitize(err)}</div>`,
            );
          } else {
            setPreview(
              `<div class="${classes.error}">${t("Invalid Mermaid diagram")}</div>`,
            );
          }
        });
    }
  }, [node.textContent, computedColorScheme]);

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
