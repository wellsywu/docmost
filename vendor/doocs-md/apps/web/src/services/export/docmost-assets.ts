import { isDocmostMode } from '@/services/docmost'
import { publishDocmostAttachment, uploadDocmostPublishFile } from '@/services/docmost/client'
import { publishAttachmentsFromBrowser, uploadImageToWechat } from '@/services/docmost/wechat-publish'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'

const SVG_NS = `http://www.w3.org/2000/svg`
const SVG_IMAGE_TYPE = `image/svg+xml`
const PNG_IMAGE_TYPE = `image/png`
const JPEG_IMAGE_TYPE = `image/jpeg`
const GIF_IMAGE_TYPE = `image/gif`
const SUPPORTED_UPLOAD_TYPES = new Set([JPEG_IMAGE_TYPE, `image/jpg`, PNG_IMAGE_TYPE, GIF_IMAGE_TYPE])
/** WeChat's inline image endpoint only takes JPEG/PNG below 1MB. */
const WECHAT_INLINE_MAX_BYTES = 1024 * 1024
const WECHAT_INLINE_TYPES = new Set([JPEG_IMAGE_TYPE, `image/jpg`, PNG_IMAGE_TYPE])
const JPEG_QUALITY_STEPS = [0.9, 0.75, 0.6]
const WECHAT_IMAGE_HOST = `mmbiz.qpic.cn`
const WECHAT_ARTICLE_WIDTH = 677
const RASTER_SCALE = 2
const DIAGRAM_SVG_SELECTOR = `.mermaid-diagram svg, .plantuml-diagram svg, .infographic-diagram svg`

export interface UploadDocmostClipboardAssetsOptions {
  isEnabled?: () => boolean
  getProvider?: () => Promise<string | null>
  getAccountId?: () => Promise<string | null>
  /** `src` is needed as well as the id: only that URL is signed to read the bytes. */
  publishAttachment?: (attachmentId: string, src: string) => Promise<string>
  uploadFile?: (resource: File) => Promise<string>
  svgToPngFile?: (svg: SVGSVGElement, index: number) => Promise<File>
  fetchImageFile?: (src: string) => Promise<File>
  normalizeImageFile?: (src: string, file: File) => Promise<File>
  fitInlineLimit?: (file: File) => Promise<File>
}

function isAlreadyWechatImage(src: string): boolean {
  try {
    const hostname = new URL(src, window.location.href).hostname
    return hostname === WECHAT_IMAGE_HOST || hostname.endsWith(`.${WECHAT_IMAGE_HOST}`)
  }
  catch {
    return false
  }
}

function isSkippableImage(src: string): boolean {
  return !src || isAlreadyWechatImage(src)
}

/**
 * Both shapes an attachment URL takes: the plain `/api/files/{id}/...` a page
 * stores, and the signed `/api/files/public/{id}/...?jwt=` the editor is handed
 * so its `<img>` tags load across origins. Missing the `public/` segment used to
 * yield the literal id `public`.
 */
function parseDocmostAttachmentId(src: string): string | null {
  try {
    const { pathname } = new URL(src, window.location.href)
    const match = pathname.match(/^\/api\/files\/(?:public\/)?([^/?#]+)/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }
  catch {
    return null
  }
}

function parseViewBox(svg: SVGSVGElement): { width: number, height: number } | null {
  const parts = (svg.getAttribute(`viewBox`) ?? ``)
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part)))
    return null
  return { width: parts[2], height: parts[3] }
}

function fitToArticleWidth(width: number, height: number): { width: number, height: number } {
  const naturalWidth = Math.max(1, width)
  const naturalHeight = Math.max(1, height)
  const fittedWidth = Math.min(WECHAT_ARTICLE_WIDTH, naturalWidth)
  return {
    width: Math.round(fittedWidth),
    height: Math.max(1, Math.round(naturalHeight * (fittedWidth / naturalWidth))),
  }
}

/**
 * A vector source loses nothing by being drawn larger, so diagrams are always
 * rasterized at the article column width — a narrow one used to upload as a
 * thumbnail WeChat then displayed at its intrinsic size.
 */
function scaleToArticleWidth(width: number, height: number): { width: number, height: number } {
  const naturalWidth = Math.max(1, width)
  const naturalHeight = Math.max(1, height)
  return {
    width: WECHAT_ARTICLE_WIDTH,
    height: Math.max(1, Math.round(naturalHeight * (WECHAT_ARTICLE_WIDTH / naturalWidth))),
  }
}

/** Percentages are not a usable length here; mermaid emits `width="100%"` with the real size in `max-width`. */
function parsePixelLength(value: string | null | undefined): number | null {
  if (!value || value.includes(`%`))
    return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * The clipboard fragment is a detached clone, so `getBoundingClientRect()` reads
 * zero and the attributes are all that is left. Mermaid's `width="100%"` used to
 * parse as 100px, which is what made uploaded diagrams thumbnail-sized.
 */
function svgNaturalSize(svg: SVGSVGElement): { width: number, height: number } {
  const rect = svg.getBoundingClientRect()
  const viewBox = parseViewBox(svg)
  const width = (rect.width > 0 ? rect.width : null)
    ?? parsePixelLength(svg.getAttribute(`width`))
    ?? parsePixelLength(svg.style.maxWidth)
    ?? viewBox?.width
    ?? WECHAT_ARTICLE_WIDTH
  const height = viewBox && viewBox.width > 0
    ? width * (viewBox.height / viewBox.width)
    : (rect.height > 0 ? rect.height : null)
      ?? parsePixelLength(svg.getAttribute(`height`))
      ?? Math.round(WECHAT_ARTICLE_WIDTH * 0.75)
  return { width, height }
}

function svgDataUrl(svgMarkup: string): string {
  return `data:${SVG_IMAGE_TYPE};charset=utf-8,${encodeURIComponent(svgMarkup)}`
}

export function createSvgRasterSource(svg: SVGSVGElement): {
  dataUrl: string
  width: number
  height: number
} {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.hasAttribute(`xmlns`))
    clone.setAttribute(`xmlns`, SVG_NS)

  const natural = svgNaturalSize(svg)
  const { width, height } = scaleToArticleWidth(natural.width, natural.height)
  // Without a viewBox the enlarged width would crop rather than scale the drawing.
  if (!clone.hasAttribute(`viewBox`))
    clone.setAttribute(`viewBox`, `0 0 ${Math.round(natural.width)} ${Math.round(natural.height)}`)
  clone.setAttribute(`width`, String(width))
  clone.setAttribute(`height`, String(height))
  // Mermaid's own `max-width` would otherwise cap the standalone SVG document back down.
  clone.style.removeProperty(`max-width`)

  return {
    dataUrl: svgDataUrl(new XMLSerializer().serializeToString(clone)),
    width,
    height,
  }
}

async function rasterizeImage(
  image: HTMLImageElement,
  filename: string,
  type: string = PNG_IMAGE_TYPE,
  quality?: number,
  /** Target size for sources whose intrinsic size the browser reports unreliably (SVG). */
  size?: { width: number, height: number },
): Promise<File> {
  const { width, height } = size ?? fitToArticleWidth(
    image.naturalWidth || image.width || WECHAT_ARTICLE_WIDTH,
    image.naturalHeight || image.height || Math.round(WECHAT_ARTICLE_WIDTH * 0.75),
  )
  const canvas = document.createElement(`canvas`)
  canvas.width = Math.round(width * RASTER_SCALE)
  canvas.height = Math.round(height * RASTER_SCALE)

  const ctx = canvas.getContext(`2d`)
  if (!ctx)
    throw new Error(`Canvas is not available for image conversion`)

  // Opaque background so transparency survives a JPEG re-encode as white.
  ctx.fillStyle = `#ffffff`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result)
        resolve(result)
      else
        reject(new Error(`Failed to convert image to ${type}`))
    }, type, quality)
  })

  return new File([blob], filename, { type })
}

async function imageToPngFile(
  image: HTMLImageElement,
  filename: string,
  size?: { width: number, height: number },
): Promise<File> {
  return await rasterizeImage(image, filename, PNG_IMAGE_TYPE, undefined, size)
}

async function fileToJpegFile(file: File, quality: number): Promise<File> {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await rasterizeImage(
      await loadImage(objectUrl),
      `${file.name.replace(/\.[^.]+$/, ``) || `docmost-image-${Date.now()}`}.jpg`,
      JPEG_IMAGE_TYPE,
      quality,
    )
  }
  finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Keeps an image on WeChat's inline endpoint, which does not consume the
 * account's permanent material quota. Article images are displayed at 677px, so
 * re-encoding an oversized one as JPEG costs nothing visible. Animated GIFs are
 * left untouched because re-encoding would drop the animation; those fall back
 * to permanent material on the server.
 */
export async function fitWechatInlineLimit(
  file: File,
  encodeJpeg: (file: File, quality: number) => Promise<File> = fileToJpegFile,
): Promise<File> {
  const type = file.type.toLowerCase()
  if (type === GIF_IMAGE_TYPE)
    return file
  if (file.size <= WECHAT_INLINE_MAX_BYTES && WECHAT_INLINE_TYPES.has(type))
    return file

  let smallest = file
  for (const quality of JPEG_QUALITY_STEPS) {
    const candidate = await encodeJpeg(file, quality)
    if (candidate.size < smallest.size)
      smallest = candidate
    if (candidate.size <= WECHAT_INLINE_MAX_BYTES)
      return candidate
  }
  return smallest
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = `async`
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load image for upload`))
  })
  image.src = src
  return await loaded
}

async function imageFileToPngFile(file: File): Promise<File> {
  const isSvg = file.type.toLowerCase().includes(SVG_IMAGE_TYPE)
    || file.name.toLowerCase().endsWith(`.svg`)
  if (isSvg) {
    return await imageToPngFile(
      await loadImage(svgDataUrl(await file.text())),
      file.name.replace(/\.[^.]+$/, `.png`) || `docmost-image-${Date.now()}.png`,
    )
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    return await imageToPngFile(
      await loadImage(objectUrl),
      file.name.replace(/\.[^.]+$/, `.png`) || `docmost-image-${Date.now()}.png`,
    )
  }
  finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function svgElementToPngFile(svg: SVGSVGElement, index: number): Promise<File> {
  const { dataUrl, width, height } = createSvgRasterSource(svg)
  return await imageToPngFile(
    await loadImage(dataUrl),
    `docmost-diagram-${index}.png`,
    { width, height },
  )
}

function filenameFromUrl(src: string): string {
  try {
    return new URL(src, window.location.href).pathname.split(`/`).pop() || `docmost-image-${Date.now()}.png`
  }
  catch {
    return `docmost-image-${Date.now()}.png`
  }
}

async function fetchImageFile(src: string): Promise<File> {
  const response = await fetch(new URL(src, window.location.href).href, {
    credentials: `same-origin`,
    referrerPolicy: `no-referrer`,
  })
  if (!response.ok)
    throw new Error(`Failed to download image for upload: ${response.status}`)
  const blob = await response.blob()
  return new File([blob], filenameFromUrl(src), { type: blob.type })
}

async function normalizeImageFile(src: string, file: File): Promise<File> {
  const mime = file.type.toLowerCase()
  if (SUPPORTED_UPLOAD_TYPES.has(mime))
    return file

  const extension = src.split(`?`)[0].split(`.`).pop()?.toLowerCase()
  if (!mime && extension && [`jpg`, `jpeg`, `png`, `gif`].includes(extension)) {
    const inferredMime = extension === `jpg` ? `image/jpeg` : `image/${extension}`
    return new File([file], file.name, { type: inferredMime })
  }

  return await imageFileToPngFile(file)
}

export async function uploadDocmostClipboardAssets(
  root: HTMLElement,
  options: UploadDocmostClipboardAssetsOptions = {},
): Promise<void> {
  const enabled = options.isEnabled?.() ?? isDocmostMode()
  if (!enabled)
    return

  const provider = await (options.getProvider?.() ?? store.get(`docmostUploadProvider`))
  if (!provider)
    throw new Error(`Docmost upload provider is unavailable. Reopen the page from Docmost and try again.`)

  const accountId = await (options.getAccountId?.() ?? (provider === `wechat` ? store.get(addPrefix(`mp-current-account-id`)) : Promise.resolve(null)))
  // WeChat is reached from here, not from the Docmost server: the account
  // whitelists the author's network, so the server's own publish endpoints
  // refuse the provider outright. S3 has no such constraint and stays server-side.
  const fromBrowser = provider === `wechat`
  const publishAttachment = options.publishAttachment ?? (async (attachmentId: string, src: string) => {
    if (fromBrowser) {
      // Goes through the same lookup-then-register flow the export path uses, so
      // an image published once is not uploaded again by the other one.
      const urls = await publishAttachmentsFromBrowser(accountId, [{ attachmentId, sourceUrl: src }])
      const url = urls.get(attachmentId)
      if (!url)
        throw new Error(`Docmost image could not be published to WeChat`)
      return url
    }
    const publishAsset = await publishDocmostAttachment(accountId, attachmentId)
    if (publishAsset.status !== `ready` || !publishAsset.url) {
      const reason = publishAsset.error ? `: ${publishAsset.error}` : ``
      throw new Error(`Docmost image is not ready for clipboard publishing${reason}`)
    }
    return publishAsset.url
  })
  const uploadFile = options.uploadFile ?? (async (file: File) => {
    // Diagrams and foreign images have no attachment, so there is nothing to
    // look up or record — the bytes go straight to the image host.
    if (fromBrowser)
      return (await uploadImageToWechat(accountId, file)).url
    const response = await uploadDocmostPublishFile(accountId, file)
    if (!response.url)
      throw new Error(`Docmost image upload did not return a clipboard URL`)
    return response.url
  })
  const svgToPngFile = options.svgToPngFile ?? svgElementToPngFile
  const fetchFile = options.fetchImageFile ?? fetchImageFile
  const normalizeFile = options.normalizeImageFile ?? normalizeImageFile
  // Only WeChat has an inline size limit; S3 keeps the original quality.
  const fitInline = options.fitInlineLimit
    ?? (provider === `wechat` ? fitWechatInlineLimit : async (file: File) => file)

  const diagramSvgs = Array.from(root.querySelectorAll<SVGSVGElement>(DIAGRAM_SVG_SELECTOR))
  for (const [index, svg] of diagramSvgs.entries()) {
    const url = await uploadFile(await fitInline(await svgToPngFile(svg, index)))
    const img = document.createElement(`img`)
    img.src = url
    img.alt = `diagram`
    img.style.maxWidth = `100%`
    img.style.height = `auto`
    img.dataset.docmostUploaded = `true`
    svg.replaceWith(img)
  }

  const images = Array.from(root.querySelectorAll<HTMLImageElement>(`img[src]`))
  for (const img of images) {
    const src = img.getAttribute(`src`) ?? ``
    if (img.dataset.docmostUploaded === `true` || isSkippableImage(src))
      continue

    const attachmentId = parseDocmostAttachmentId(src)
    if (attachmentId) {
      img.src = await publishAttachment(attachmentId, src)
      continue
    }

    const file = await fetchFile(src)
    img.src = await uploadFile(await fitInline(await normalizeFile(src, file)))
  }
}
