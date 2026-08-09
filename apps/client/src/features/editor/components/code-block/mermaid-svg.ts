/**
 * Mermaid stacks two backdrops behind a flowchart edge label: the inner
 * `span.edgeLabel` takes `edgeLabelBackground` as given, while the wrapping
 * `div.labelBkg` takes `fade(edgeLabelBackground, 0.5)`. khroma resolves
 * `fade('transparent', 0.5)` to `rgba(0, 0, 0, 0.5)`, so a diagram that asks
 * for a transparent edge label still gets a half-black slab — which reads as
 * the setting being ignored. Dropping the derived layer leaves the variable in
 * sole control, so `%%{init}%%` is obeyed.
 */
const EDGE_LABEL_BACKDROP_CSS = `.labelBkg{background-color:transparent!important}`;

/**
 * Appends the override to the SVG's own stylesheet rather than the page's, so
 * it survives everywhere the markup travels — the node view, the lightbox, and
 * any copy of the serialized SVG. `!important` is required because mermaid
 * scopes its own rules by the SVG id, which outranks a bare class selector.
 *
 * Markup without an `<svg>` root (the error placeholder) is left untouched.
 */
export function withControllableEdgeLabelBackground(svg: string): string {
  return svg.replace(
    /<svg\b[^>]*>/,
    (openTag) => `${openTag}<style>${EDGE_LABEL_BACKDROP_CSS}</style>`,
  );
}
