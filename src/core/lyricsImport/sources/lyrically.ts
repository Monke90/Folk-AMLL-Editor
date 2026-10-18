// "Lyrically" source: lyrics.ovh, with Deezer-backed search.
// Derived from NaeNae-AMLL-TTML-TOOL (modules/lyrically), licensed under AGPL-3.0.
import type { ImportTrack } from '../types'
import { fetchChecked } from './http'

interface DeezerSuggestTrack {
  title: string
  /** Seconds */
  duration?: number
  artist?: { name: string }
  album?: { title: string; cover_xl?: string; cover_medium?: string }
}

async function getLyrics(name: string, artist: string): Promise<string> {
  const response = await fetchChecked(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(name)}`,
    'lyrics.ovh',
  )
  const json = (await response.json()) as { lyrics?: string }
  return json.lyrics ?? ''
}

export async function searchLyrically(query: string): Promise<ImportTrack[]> {
  const response = await fetchChecked(
    `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`,
    'lyrics.ovh',
  )
  const json = (await response.json()) as { data?: DeezerSuggestTrack[] }
  return (json.data ?? []).map((track, index) => {
    const artist = track.artist?.name || 'Unknown Artist'
    const cover = track.album?.cover_xl || track.album?.cover_medium
    return {
      id: `${artist}-${track.title}-${index}`,
      name: track.title,
      artist,
      album: track.album?.title,
      duration: track.duration,
      // Deezer answers with http:// links, which browsers block on https pages
      cover: cover?.replace(/^http:\/\//, 'https://'),
      fetchLyrics: () => getLyrics(track.title, artist),
    }
  })
}
