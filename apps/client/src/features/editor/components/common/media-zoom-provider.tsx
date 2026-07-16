import { lazy, Suspense, useEffect, useState } from "react";

// Lazy: keeps the lightbox bundle off the first-paint path. Named factory so we
// can also prefetch it on first hover, before the click (see effect below).
const importMediaLightbox = () => import("./media-lightbox.tsx");
const MediaLightbox = lazy(importMediaLightbox);

interface ZoomTarget {
  imageSrc: string;
  alt?: string;
}

/**
 * Enables click-to-zoom for images inside a read-only editor. Rendered images
 * use a plain <img> DOM node view (not the React ImageView), so we catch clicks
 * via delegation on the document rather than per-node handlers. Mermaid keeps
 * its own React handler since it already has the SVG markup on hand.
 *
 * Mount once per editor surface; the document listener is shared.
 */
export function MediaZoomProvider() {
  const [target, setTarget] = useState<ZoomTarget | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const el = e.target as HTMLElement | null;
      const img = el?.closest("img");
      // Only the image node (not excalidraw/drawio/video previews).
      if (!img || !img.closest(".node-image")) return;
      const pm = img.closest(".ProseMirror");
      // Only in reading mode: ProseMirror sets contenteditable="false".
      if (!pm || pm.getAttribute("contenteditable") !== "false") return;
      const src = img.getAttribute("src");
      if (!src) return;
      setTarget({ imageSrc: img.currentSrc || img.src, alt: img.alt });
    };
    document.addEventListener("click", onClick);

    // Prefetch the lightbox chunk the first time the pointer hovers an eligible
    // read-mode image, so the ensuing click opens instantly. Fires once.
    const onOver = (e: MouseEvent) => {
      const img = (e.target as HTMLElement | null)?.closest("img");
      if (!img || !img.closest(".node-image")) return;
      const pm = img.closest(".ProseMirror");
      if (!pm || pm.getAttribute("contenteditable") !== "false") return;
      void importMediaLightbox();
      document.removeEventListener("pointerover", onOver);
    };
    document.addEventListener("pointerover", onOver);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerover", onOver);
    };
  }, []);

  if (!target) return null;

  return (
    <Suspense fallback={null}>
      <MediaLightbox
        open
        imageSrc={target.imageSrc}
        alt={target.alt}
        onClose={() => setTarget(null)}
      />
    </Suspense>
  );
}
