// LRCLIB lyrics source (https://lrclib.net). Derived from NaeNae-AMLL-TTML-TOOL (modules/lrclib),
// licensed under AGPL-3.0.
import type { ImportTrack } from '../types'
import { lrcToPlainLyrics } from '../trackUtils'
import { fetchChecked } from './http'

interface LrcLibTrack {
  id: number
  /** The docs say `trackName`, but the API actually returns `name` */
  name: string
  artistName: string
  albumName: string
  /** Seconds */
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export async function searchLrcLib(query: string): Promise<ImportTrack[]> {
  const response = await fetchChecked(
    `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
    'LRCLIB',
  )
  const tracks = (await response.json()) as LrcLibTrack[]
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artistName,
    album: track.albumName,
    duration: track.duration,
    lyrics: track.plainLyrics || (track.syncedLyrics ? lrcToPlainLyrics(track.syncedLyrics) : ''),
    note: track.syncedLyrics ? 'synced' : undefined,
  }))
}
