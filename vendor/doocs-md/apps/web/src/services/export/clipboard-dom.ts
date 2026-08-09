/**
 * Pure clipboard HTML transforms used by WeChat copy flow.
 * Kept free of Pinia/store imports so unit tests can run without app bootstrap.
 */

export function solveWeChatImage(container?: HTMLElement) {
  const clipboardDiv = container ?? document.getElementById(`output`)
  if (!clipboardDiv)
    return
  const images = clipboardDiv.getElementsByTagName(`img`)

  Array.from(images).forEach((image) => {
    const width = image.getAttribute(`width`)
    const height = image.getAttribute(`height`)

    if (width) {
      image.removeAttribute(`width`)
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }

    if (height) {
      image.removeAttribute(`height`)
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }
  })
}

const SVG_SLOT_ATTR = `data-svg-slot`

/**
 * An SVG is a self-contained document, and CSS must not cross that boundary in
 * either direction. Mermaid's own stylesheet lives inside the `<svg>`, so juice
 * used to inline a `classDef` `color:#fff` onto every paragraph as `!important`
 * and WeChat drew white text on white; conversely the theme's
 * `p { margin: 1.5em 8px; letter-spacing: 0.1em }` landed on every `nodeLabel`
 * and pushed the text out of its `foreignObject` before the diagram was
 * rasterized. juice cannot skip a subtree and round-trips through a string, so
 * the SVGs are parked outside the fragment and restored by slot index.
 *
 * The diagram keeps the stylesheet it is rasterized with; `sanitizeSvgsForWeChat`
 * bakes computed values onto whatever SVG is still around and strips it later.
 */
export function detachSvgs(root: ParentNode): SVGSVGElement[] {
  const svgs = Array.from(root.querySelectorAll(`svg`))
    .filter(svg => !svg.parentElement?.closest(`svg`))

  svgs.forEach((svg, index) => {
    const slot = document.createElement(`span`)
    slot.setAttribute(SVG_SLOT_ATTR, String(index))
    svg.replaceWith(slot)
  })

  return svgs
}

export function reattachSvgs(root: ParentNode, svgs: SVGSVGElement[]) {
  root.querySelectorAll(`[${SVG_SLOT_ATTR}]`).forEach((slot) => {
    const svg = svgs[Number(slot.getAttribute(SVG_SLOT_ATTR))]
    if (svg)
      slot.replaceWith(svg)
    else
      slot.remove()
  })
}

export function modifyHtmlStructure(htmlString: string): string {
  const tempDiv = document.createElement(`div`)
  tempDiv.innerHTML = htmlString

  tempDiv.querySelectorAll(`li > ul, li > ol`).forEach((originalItem) => {
    originalItem.parentElement?.insertAdjacentElement(`afterend`, originalItem)
  })

  return tempDiv.innerHTML
}

export function createEmptyNode(): HTMLElement {
  const node = document.createElement(`p`)
  node.style.fontSize = `0`
  node.style.lineHeight = `0`
  node.style.margin = `0`
  node.innerHTML = `&nbsp;`
  return node
}
