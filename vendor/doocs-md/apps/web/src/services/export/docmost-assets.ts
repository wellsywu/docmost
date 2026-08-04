import { isDocmostMode } from '@/services/docmost'
import { publishDocmostAttachment, uploadDocmostPublishFile } from '@/services/docmost/client'
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
  publishAttachment?: (attachmentId: string) => Promise<string>
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

function parseDocmostAttachmentId(src: string): string | null {
  try {
    const { pathname } = new URL(src, window.location.href)
    const match = pathname.match(/^\/api\/files\/([^/?#]+)/)
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

function svgSize(svg: SVGSVGElement): { width: number, height: number } {
  const rect = svg.getBoundingClientRect()
  const widthAttr = Number.parseFloat(svg.getAttribute(`width`) ?? ``)
  const heightAttr = Number.parseFloat(svg.getAttribute(`height`) ?? ``)
  const viewBox = parseViewBox(svg)
  return fitToArticleWidth(
    rect.width || widthAttr || viewBox?.width || WECHAT_ARTICLE_WIDTH,
    rect.height || heightAttr || viewBox?.height || Math.round(WECHAT_ARTICLE_WIDTH * 0.75),
  )
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

  const { width, height } = svgSize(svg)
  clone.setAttribute(`width`, String(width))
  clone.setAttribute(`height`, String(height))

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
): Promise<File> {
  const { width, height } = fitToArticleWidth(
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

async function imageToPngFile(image: HTMLImageElement, filename: string): Promise<File> {
  return await rasterizeImage(image, filename, PNG_IMAGE_TYPE)
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
  const { dataUrl } = createSvgRasterSource(svg)
  return await imageToPngFile(
    await loadImage(dataUrl),
    `docmost-diagram-${index}.png`,
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
  const publishAttachment = options.publishAttachment ?? (async (attachmentId: string) => {
    const publishAsset = await publishDocmostAttachment(accountId, attachmentId)
    if (publishAsset.status !== `ready` || !publishAsset.url) {
      const reason = publishAsset.error ? `: ${publishAsset.error}` : ``
      throw new Error(`Docmost image is not ready for clipboard publishing${reason}`)
    }
    return publishAsset.url
  })
  const uploadFile = options.uploadFile ?? (async (file: File) => {
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
      img.src = await publishAttachment(attachmentId)
      continue
    }

    const file = await fetchFile(src)
    img.src = await uploadFile(await fitInline(await normalizeFile(src, file)))
  }
}
