import { JSDOM, type DOMWindow } from "jsdom";
import type { BinaryAsset } from "../core/types.js";
import { PublicationBlockedError } from "../core/errors.js";
import { sha256 } from "../core/hash.js";
import type { Rasterizer } from "../media/rasterizer.js";

type MermaidApi = (typeof import("mermaid"))["default"];

/**
 * Mermaid only runs against a DOM. Publisher is a long lived server process, so
 * the JSDOM globals are installed for the duration of a single render and then
 * restored: leaving `window`/`document` defined process-wide makes every
 * library that feature-detects a browser take the wrong branch.
 *
 * Renders are serialised for the same reason — two concurrent renders would
 * interleave install/restore and race on the shared window.
 */
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "SVGElement",
  "Element",
  "Node",
  "CSSStyleSheet",
  "DOMParser",
  "XMLSerializer",
] as const;

let sharedWindow: DOMWindow | undefined;
let mermaidApi: MermaidApi | undefined;
let queue: Promise<unknown> = Promise.resolve();

export class MermaidRenderError extends PublicationBlockedError {
  constructor(readonly detail: string) {
    super(
      "MermaidRenderError",
      "MERMAID_RENDER_FAILED",
      `Mermaid diagram could not be rendered. Check the syntax inside the fenced mermaid block: ${detail}`,
    );
  }
}

function getWindow(): DOMWindow {
  if (sharedWindow) return sharedWindow;
  const window = new JSDOM("<!doctype html><html><body></body></html>").window;
  // JSDOM has no layout engine; Mermaid only needs plausible text metrics.
  (
    window.SVGElement.prototype as SVGElement & { getBBox: () => DOMRect }
  ).getBBox = function () {
    return window.DOMRect.fromRect({
      x: 0,
      y: 0,
      width: Math.max(24, (this.textContent ?? "").length * 8),
      height: 24,
    });
  };
  (
    window.SVGElement.prototype as SVGElement & {
      getComputedTextLength: () => number;
    }
  ).getComputedTextLength = function () {
    return Math.max(24, (this.textContent ?? "").length * 8);
  };
  sharedWindow = window;
  return window;
}

type SavedGlobal = [string, PropertyDescriptor | undefined];

function installGlobals(window: DOMWindow): SavedGlobal[] {
  const saved: SavedGlobal[] = DOM_GLOBALS.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  for (const key of DOM_GLOBALS) {
    Object.defineProperty(globalThis, key, {
      value: window[key as keyof DOMWindow],
      configurable: true,
      writable: true,
    });
  }
  return saved;
}

function restoreGlobals(saved: SavedGlobal[]): void {
  for (const [key, descriptor] of saved) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function renderSvg(id: string, source: string): Promise<string> {
  const window = getWindow();
  const saved = installGlobals(window);
  try {
    if (!mermaidApi) {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        fontFamily: "Microsoft YaHei, Noto Sans CJK SC, sans-serif",
      });
      mermaidApi = mermaid;
    }
    const result = await mermaidApi.render(id, source);
    if (!result.svg) throw new Error("Mermaid returned empty SVG");
    return result.svg;
  } finally {
    // Mermaid appends scratch nodes keyed by the render id.
    window.document.getElementById(id)?.remove();
    window.document.getElementById(`d${id}`)?.remove();
    restoreGlobals(saved);
  }
}

export class MermaidRenderer {
  constructor(private readonly rasterizer: Rasterizer) {}

  async render(source: string): Promise<BinaryAsset> {
    const hash = sha256(source);
    let svg: string;
    try {
      svg = await runExclusive(() =>
        renderSvg(`mermaid-${hash.slice(0, 12)}`, source),
      );
    } catch (error) {
      throw new MermaidRenderError(
        error instanceof Error ? error.message : String(error),
      );
    }
    return this.rasterizer.rasterizeSvg(
      {
        sourceUrl: `publisher://mermaid/${hash}`,
        bytes: new TextEncoder().encode(svg),
        mime: "image/svg+xml",
        transform: "mermaid_to_png",
      },
      "mermaid_to_png",
    );
  }
}
