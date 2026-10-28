import type { LyricLine, MetadataMap, Persist } from '@core/types'

import { coreCreate } from '@states/stores/core'

import type { LineDraft } from './types'

/** Turn line drafts into a project that can be handed to `fileState.importPersist` */
export function draftsToPersist(drafts: LineDraft[], metadata: MetadataMap = {}): Persist {
  const lines: LyricLine[] = drafts.map((draft) =>
    coreCreate.newLine({
      background: draft.background,
      duet: draft.duet,
      translation: draft.translation,
      romanization: draft.romanization,
      syllables: draft.words.map((text) => coreCreate.newSyllable({ text })),
    }),
  )
  return { metadata, lines }
}
