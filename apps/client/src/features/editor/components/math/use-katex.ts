import { useEffect, useState } from "react";

type KatexModule = (typeof import("katex"))["default"];

let katexPromise: Promise<KatexModule> | null = null;

// katex (~280KB) only downloads when a math node actually renders.
export function loadKatex(): Promise<KatexModule> {
  if (!katexPromise) {
    katexPromise = Promise.all([
      import("katex"),
      import("katex/dist/katex.min.css"),
    ]).then(([m]) => m.default);
  }
  return katexPromise;
}

export function useKatex(): KatexModule | null {
  const [katex, setKatex] = useState<KatexModule | null>(null);

  useEffect(() => {
    let mounted = true;
    loadKatex().then((k) => {
      if (mounted) setKatex(k);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return katex;
}
