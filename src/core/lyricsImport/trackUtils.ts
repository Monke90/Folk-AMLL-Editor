// Derived from NaeNae-AMLL-TTML-TOOL (modules/lyrics-import/track-duration.ts), licensed under AGPL-3.0.
import type { MetadataMap } from '@core/types'

import type { ImportTrack } from './types'

/** Durations are compared in seconds. Two songs within 2s of each other are treated as the same. */
export const matchesAudioDuration = (duration: number | undefined, audioDuration: number) =>
  Number.isFinite(duration) &&
  Number.isFinite(audioDuration) &&
  (duration ?? 0) > 0 &&
  audioDuration > 0 &&
  Math.abs((duration ?? 0) - audioDuration) <= 2

/** Puts tracks that match the loaded audio first. Keeps the original order otherwise. */
export const prioritizeMatchingTracks = <T extends { duration?: number }>(
  tracks: T[],
  audioDuration: number,
) =>
  [...tracks].sort(
    (a, b) =>
      Number(matchesAudioDuration(b.duration, audioDuration)) -
      Number(matchesAudioDuration(a.duration, audioDuration)),
  )

export const formatTrackDuration = (duration: number) => {
  const seconds = Math.round(duration)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** A search query guessed from an audio file name: "Artist_-_Song.mp3" -> "Artist - Song" */
export function queryFromFilename(filename: string | undefined): string {
  if (!filename) return ''
  return filename
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strips LRC timestamps, word timestamps and tags, leaving the lyric lines */
export function lrcToPlainLyrics(lrc: string): string {
  return lrc
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/^\[[a-z#]+:.*\]$/i.test(line)) // [ar:..] [ti:..] [offset:..]
    .map((line) =>
      line
        .replace(/^(?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*)+/, '') // [mm:ss.xx]
        .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>\s*/g, '') // <mm:ss.xx> (enhanced LRC)
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
}

/**
 * Fills the song's title, artist and album from an online track, the way ttml-tool does:
 * details the project already has stay, only missing or empty ones are filled in.
 */
export function applyTrackMetadata(metadata: MetadataMap, track: ImportTrack): MetadataMap {
  const next: MetadataMap = { ...metadata }
  const fillIfEmpty = (key: string, value: string | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    const existing = next[key]
    if (!existing || existing.every((item) => !item.trim())) next[key] = [trimmed]
  }
  fillIfEmpty('musicName', track.name)
  fillIfEmpty('artists', track.artist)
  fillIfEmpty('album', track.album)
  return next
}
