import type { LyricLine, MetadataMap, Persist } from '@core/types'

import { coreCreate } from '@states/stores/core'

import type { ImportTrack, LineDraft } from './types'

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

/** Song info that goes into the project metadata when a track is imported from an online source */
export function trackToMetadata(track: ImportTrack): MetadataMap {
  const metadata: MetadataMap = {}
  if (track.name.trim()) metadata.musicName = [track.name.trim()]
  if (track.artist.trim()) metadata.artists = [track.artist.trim()]
  if (track.album?.trim()) metadata.album = [track.album.trim()]
  return metadata
}
