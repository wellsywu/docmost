import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { IconMinus, IconPlus, IconRefresh, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./media-lightbox.module.css";

interface MediaLightboxProps {
  open: boolean;
  onClose: () => void;
  /** Image URL. Provide this OR svgHtml. */
  imageSrc?: string;
  /** Raw SVG markup (e.g. a rendered mermaid diagram). Rendered live and
   * scaled via its width so it stays crisp at any zoom. */
  svgHtml?: string;
  alt?: string;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/**
 * Self-contained fullscreen zoom viewer for a single image or SVG. Wheel /
 * buttons / double-click to zoom, drag to pan, ESC / backdrop / × to close.
 * Images zoom via CSS transform; SVGs (mermaid) zoom by resizing the element
 * so vectors re-render sharply. Mounted only while open and pulled in via
 * React.lazy so it stays off the first-paint path.
 */
export default function MediaLightbox({
  open,
  onClose,
  imageSrc,
  svgHtml,
  alt,
}: MediaLightboxProps) {
  const { t } = useTranslation();
  const isSvg = !imageSrc;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const svgBaseWidth = useRef(0);
  const initialScale = useRef(1);
  // Tracks whether the last pointer interaction was a drag, so releasing after
  // panning over empty space doesn't fire the backdrop-close click.
  const draggedRef = useRef(false);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => clamp(s * factor, MIN_SCALE, MAX_SCALE));
  }, []);

  const reset = useCallback(() => {
    setScale(initialScale.current);
    setOffset({ x: 0, y: 0 });
  }, []);

  // On open: inject the SVG imperatively (so React never reconciles/disturbs it
  // on later pan re-renders), measure its intrinsic size, fit it to the viewport
  // (small diagrams scale up), and reset pan. Non-SVG just resets to 1x.
  useLayoutEffect(() => {
    if (!open) return;
    setOffset({ x: 0, y: 0 });
    if (isSvg) {
      const host = svgHostRef.current;
      host && (host.innerHTML = svgHtml ?? "");
      const svg = host?.querySelector("svg");
      let bw = 0;
      let bh = 0;
      const vb = svg?.viewBox?.baseVal;
      if (vb && vb.width) {
        bw = vb.width;
        bh = vb.height;
      } else if (svg) {
        const r = svg.getBoundingClientRect();
        bw = r.width;
        bh = r.height;
      }
      svgBaseWidth.current = bw;
      if (svg) {
        svg.style.maxWidth = "none";
        svg.style.height = "auto";
      }
      const maxW = window.innerWidth * 0.9 - 48;
      const maxH = window.innerHeight * 0.9 - 48;
      const fit = bw && bh ? Math.min(maxW / bw, maxH / bh) : 1;
      initialScale.current = clamp(fit || 1, MIN_SCALE, MAX_SCALE);
    } else {
      initialScale.current = 1;
    }
    setScale(initialScale.current);
  }, [open, svgHtml, isSvg]);

  // Resize the SVG element itself so it re-rasterizes sharply at each zoom.
  // useLayoutEffect (not useEffect) so the width is applied before the browser
  // paints the new scale — otherwise there's a one-frame flash at the old size.
  useLayoutEffect(() => {
    if (!open || !isSvg) return;
    const svg = svgHostRef.current?.querySelector("svg");
    if (!svg || !svgBaseWidth.current) return;
    svg.style.width = `${svgBaseWidth.current * scale}px`;
  }, [scale, open, isSvg]);

  // ESC to close + lock background scroll while open; restore cleanly on close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Non-passive wheel listener so preventDefault() actually suppresses scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, zoomBy]);

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    draggedRef.current = false;
    viewportRef.current?.setPointerCapture?.(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setGrabbing(true);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true;
    setOffset({ x: drag.originX + dx, y: drag.originY + dy });
  };

  const endDrag = () => {
    dragState.current = null;
    setGrabbing(false);
  };

  const handleOverlayClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onClose();
  };

  const handleDoubleClick = () => {
    if (Math.abs(scale - initialScale.current) > 0.01) {
      reset();
    } else {
      setScale(clamp(initialScale.current * 2, MIN_SCALE, MAX_SCALE));
    }
  };

  if (!open) return null;

  const percent = Math.round(scale * 100);

  return createPortal(
    <div className={classes.overlay} onClick={handleOverlayClick}>
      <div className={classes.toolbar} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={classes.toolbarButton}
          onClick={() => zoomBy(1 / 1.25)}
          aria-label={t("Zoom out")}
        >
          <IconMinus size={18} />
        </button>
        <span className={classes.percent}>{percent}%</span>
        <button
          type="button"
          className={classes.toolbarButton}
          onClick={() => zoomBy(1.25)}
          aria-label={t("Zoom in")}
        >
          <IconPlus size={18} />
        </button>
        <button
          type="button"
          className={classes.toolbarButton}
          onClick={reset}
          aria-label={t("Reset")}
        >
          <IconRefresh size={18} />
        </button>
        <span className={classes.divider} />
        <button
          type="button"
          className={classes.toolbarButton}
          onClick={onClose}
          aria-label={t("Close")}
        >
          <IconX size={18} />
        </button>
      </div>

      <div
        ref={viewportRef}
        className={classes.viewport}
        data-grabbing={grabbing || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className={classes.stage}
          style={{
            transform: isSvg
              ? `translate(${offset.x}px, ${offset.y}px)`
              : `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
        >
          {isSvg ? (
            <div ref={svgHostRef} className={classes.svgCard} />
          ) : (
            <img
              className={classes.image}
              src={imageSrc}
              alt={alt}
              draggable={false}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
