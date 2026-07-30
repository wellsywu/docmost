import type { IConfigOption } from '@md/shared/types'
import { isDocmostMode } from '@/services/docmost'

type Translate = (key: string) => string

export const UPLOAD_HOST_VALUES = [
  `default`,
  `github`,
  `aliOSS`,
  `txCOS`,
  `qiniu`,
  `minio`,
  `s3`,
  `mp`,
  `r2`,
  `upyun`,
  `telegram`,
  `cloudinary`,
  `formCustom`,
  `docmost`,
] as const

export type UploadHostValue = typeof UPLOAD_HOST_VALUES[number]

export function getUploadHostLabel(t: Translate, value: string): string {
  if (value === `docmost`)
    return t(`docmost.imageHost`)
  const key = `upload.hosts.${value}`
  const translated = t(key)
  return translated !== key ? translated : value
}

export function createLocalizedUploadHostOptions(t: Translate): IConfigOption<UploadHostValue>[] {
  return UPLOAD_HOST_VALUES.map(value => ({
    value,
    label: getUploadHostLabel(t, value),
    desc: ``,
  }))
}

export function useLocalizedUploadHostOptions() {
  const { t, locale } = useI18n()

  return computed(() => {
    void locale.value
    if (isDocmostMode()) {
      return [{
        value: `docmost`,
        label: getUploadHostLabel(t, `docmost`),
        desc: ``,
      }]
    }
    return createLocalizedUploadHostOptions(t)
  })
}
