export type DiagramThemeMode = 'dark' | 'light'

/** Shared diagram palettes (aligned with Infographic). */
export const DIAGRAM_LIGHT_COLORS = {
  background: `#ffffff`,
  text: `#262626`,
  border: `#d9d9d9`,
  line: `#333333`,
  surface: `#f5f5f5`,
} as const

export const DIAGRAM_DARK_COLORS = {
  background: `#1f1f1f`,
  text: `#ffffff`,
  border: `#404040`,
  line: `#cccccc`,
  surface: `#2d2d2d`,
} as const

export function resolveDiagramThemeMode(themeMode?: DiagramThemeMode): DiagramThemeMode {
  return themeMode === `dark` ? `dark` : `light`
}

export function diagramCacheThemeSuffix(themeMode?: DiagramThemeMode): string {
  return resolveDiagramThemeMode(themeMode)
}

const PLANTUML_LIGHT_SKIN = [
  `skinparam backgroundColor ${DIAGRAM_LIGHT_COLORS.background}`,
  `skinparam defaultFontColor ${DIAGRAM_LIGHT_COLORS.text}`,
  `skinparam shadowing false`,
].join(`\n`)

const PLANTUML_DARK_SKIN = [
  `skinparam backgroundColor ${DIAGRAM_DARK_COLORS.background}`,
  `skinparam defaultFontColor ${DIAGRAM_DARK_COLORS.text}`,
  `skinparam shadowing false`,
  `skinparam classBackgroundColor ${DIAGRAM_DARK_COLORS.surface}`,
  `skinparam classBorderColor ${DIAGRAM_DARK_COLORS.border}`,
  `skinparam activityBackgroundColor ${DIAGRAM_DARK_COLORS.surface}`,
  `skinparam activityBorderColor ${DIAGRAM_DARK_COLORS.border}`,
  `skinparam noteBackgroundColor ${DIAGRAM_DARK_COLORS.surface}`,
  `skinparam noteBorderColor ${DIAGRAM_DARK_COLORS.border}`,
  `skinparam noteFontColor ${DIAGRAM_DARK_COLORS.text}`,
  `skinparam sequenceParticipantBackgroundColor ${DIAGRAM_DARK_COLORS.surface}`,
  `skinparam sequenceLifeLineBorderColor ${DIAGRAM_DARK_COLORS.border}`,
  `skinparam ArrowColor ${DIAGRAM_DARK_COLORS.line}`,
].join(`\n`)

/** Inject PlantUML skinparams after `@startuml` for the given theme. */
export function injectPlantUmlTheme(code: string, themeMode?: DiagramThemeMode): string {
  const skin = resolveDiagramThemeMode(themeMode) === `dark` ? PLANTUML_DARK_SKIN : PLANTUML_LIGHT_SKIN
  const trimmed = code.trim()
  const finalCode = (!trimmed.includes(`@start`) || !trimmed.includes(`@end`))
    ? `@startuml\n${trimmed}\n@enduml`
    : trimmed

  if (finalCode.includes(skin))
    return finalCode

  return finalCode.replace(/@startuml\r?\n/i, `@startuml\n${skin}\n`)
}

export function getMermaidThemeConfig(themeMode?: DiagramThemeMode) {
  const isDark = resolveDiagramThemeMode(themeMode) === `dark`
  return {
    startOnLoad: false,
    theme: isDark ? `dark` as const : `default` as const,
    themeVariables: isDark ? { darkMode: true } : { darkMode: false },
  }
}

/**
 * Mermaid stacks two backdrops behind an edge label: the inner `span.edgeLabel`
 * takes `edgeLabelBackground` as given, while the wrapping `div.labelBkg` takes
 * `fade(edgeLabelBackground, 0.5)`. khroma resolves `fade('transparent', 0.5)`
 * to `rgba(0, 0, 0, 0.5)`, so setting the variable to transparent clears the
 * inner layer and turns the outer one into a half-black slab — which reads as
 * the setting being ignored. Dropping the derived layer leaves the variable in
 * sole control, so a diagram can set it through `%%{init}%%` and be obeyed.
 */
const EDGE_LABEL_BACKDROP_CSS = `.labelBkg{background-color:transparent!important}`

/**
 * Appends the overrides to the SVG's own stylesheet rather than the page's,
 * because clipboard export serializes a detached clone and rasterizes it, at
 * which point document styles no longer apply. `!important` is required since
 * mermaid scopes its own rules by the SVG id, outranking a bare class.
 */
export function withControllableEdgeLabelBackground(svg: string): string {
  return svg.replace(
    /<svg\b[^>]*>/,
    openTag => `${openTag}<style>${EDGE_LABEL_BACKDROP_CSS}</style>`,
  )
}
