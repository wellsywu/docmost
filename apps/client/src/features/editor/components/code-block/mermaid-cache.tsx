import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";

/**
 * Rendered Mermaid SVGs, kept alive across node view rebuilds.
 *
 * ProseMirror destroys and recreates every node view whenever the plugin set or
 * the node view map changes (see `updateStateInner` in prosemirror-view). Code
 * blocks survive that untouched — their text lives in `state.doc` and their
 * highlighting is a synchronously computed DecorationSet — but a Mermaid
 * diagram is neither: it is produced asynchronously and only ever existed in
 * React state, so a rebuild wipes it and the block collapses to its header for
 * as long as `mermaid.render()` takes (measured at ~700ms for three diagrams).
 *
 * Holding the result outside the component's lifecycle gives the first render
 * after a rebuild something to paint immediately.
 */

/**
 * Approximate heap cost of a string. JS strings are UTF-16, so two bytes per
 * code unit; engines store ASCII-only strings in one byte, which makes this an
 * over-estimate for SVG markup. Over-estimating is the safe direction for a
 * memory budget.
 */
const byteSize = (value: string) => value.length * 2;

/** Room for a whole article's diagrams plus a few editing intermediates. */
const MAX_ENTRIES = 30;

/**
 * Hard ceiling regardless of entry count — a single complex diagram can run to
 * hundreds of KB, so counting entries alone does not bound memory.
 */
const MAX_BYTES = 4 * 1024 * 1024;

export class MermaidSvgCache {
  private readonly entries = new Map<string, string>();
  private bytes = 0;

  constructor(
    private readonly maxEntries = MAX_ENTRIES,
    private readonly maxBytes = MAX_BYTES,
  ) {}

  /** Read without promoting the entry — safe to call during render. */
  peek(key: string): string | undefined {
    return this.entries.get(key);
  }

  /** Read and mark as most recently used. */
  get(key: string): string | undefined {
    const svg = this.entries.get(key);
    if (svg === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, svg);
    return svg;
  }

  /** @returns whether the value was stored; `false` means it was too large. */
  set(key: string, svg: string): boolean {
    const size = byteSize(svg);
    // A diagram bigger than the entire budget would evict everything else and
    // still not fit. Refusing it keeps the cache useful for the rest. Callers
    // are told so they can hold the value themselves rather than re-render it
    // forever against a cache that will never report a hit.
    if (size > this.maxBytes) return false;

    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.entries.delete(key);
      this.bytes -= byteSize(previous);
    }

    this.entries.set(key, svg);
    this.bytes += size;
    this.evict();
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get byteLength(): number {
    return this.bytes;
  }

  /** Drop least-recently-used entries until both budgets are satisfied. */
  private evict(): void {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      const svg = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (svg !== undefined) this.bytes -= byteSize(svg);
    }
  }
}

/**
 * Both inputs that decide the rendered output: the diagram source and the
 * palette Mermaid was initialised with. Anything not in here must not change
 * the SVG, or the cache would serve a stale diagram.
 *
 * The scheme is length-prefixed rather than joined by a separator: any
 * separator can also occur inside the diagram source, which would let two
 * different (scheme, source) pairs produce the same key.
 */
export const mermaidCacheKey = (source: string, colorScheme: string) =>
  `${colorScheme.length}:${colorScheme}${source}`;

/**
 * Used by editors that never mount a provider (readonly page, page history,
 * PDF render). Bounded by the same budget, so it cannot grow without limit.
 */
const fallbackCache = new MermaidSvgCache();

const MermaidCacheContext = createContext<MermaidSvgCache>(fallbackCache);

export function useMermaidCache(): MermaidSvgCache {
  return useContext(MermaidCacheContext);
}

interface MermaidCacheProviderProps {
  /** Scopes the cache: a different page starts from an empty one. */
  pageId: string;
  children: ReactNode;
}

/**
 * Scopes cached diagrams to one open article. `pages/page/page.tsx` keys the
 * editor subtree by page id, so navigating away unmounts this provider and the
 * cache becomes garbage; the `pageId` dependency repeats that guarantee here so
 * the cache still resets per article if that key is ever removed.
 */
export function MermaidCacheProvider({
  pageId,
  children,
}: MermaidCacheProviderProps) {
  const cache = useMemo(() => new MermaidSvgCache(), [pageId]);

  useEffect(() => () => cache.clear(), [cache]);

  return (
    <MermaidCacheContext.Provider value={cache}>
      {children}
    </MermaidCacheContext.Provider>
  );
}
