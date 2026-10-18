import { t } from '@i18n'

const tt = t.sidebar.metadata.templates

export interface MetadataTemplate {
  name: string
  fields: {
    key: string
    label: string
    discription?: string
    validation?: {
      validator: (s: string) => boolean
      message: string
      severity: 'error' | 'warning'
    }
  }[]
}

const lrcNormalFields = ['ti', 'ar', 'al', 'au', 'lr', 'by', 're'] as const
export const lrcMetaTemplate = {
  name: tt.lrc.label(),
  fields: [
    ...lrcNormalFields.map((key) => ({
      key,
      label: tt.lrc[key](),
    })),
    {
      key: 'length',
      label: tt.lrc.len(),
      validation: {
        validator: (s) => /^\d{1,2}:\d{1,2}(\.\d{1,3})?$/.test(s),
        message: tt.lrc.lenValidationMsg(),
        severity: 'error',
      },
    },
  ],
} as const satisfies MetadataTemplate

const amllNormalFields = [
  'musicName',
  'artists',
  'album',
  'songwriters',
  'ncmMusicId',
  'qqMusicId',
  'spotifyId',
  'appleMusicId',
  'isrc',
  'ttmlAuthorGithub',
  'ttmlAuthorGithubLogin',
] as const
export const amllMetaTemplate = {
  name: tt.amll.label(),
  fields: amllNormalFields.map((key) => ({
    key,
    label: tt.amll[key](),
  })),
} as const satisfies MetadataTemplate
