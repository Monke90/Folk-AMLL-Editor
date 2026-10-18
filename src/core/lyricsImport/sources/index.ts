import type { ImportTrack, OnlineSourceId } from '../types'
import { searchGenius } from './genius'
import { searchLrcLib } from './lrclib'
import { searchLyrically } from './lyrically'

export { ImportHttpError } from './http'
export { GENIUS_API_CLIENTS_URL, GENIUS_TOKEN_GUIDE_URL } from './genius'

/** Search one of the online sources. `geniusToken` is only used for Genius. */
export function searchTracks(
  source: OnlineSourceId,
  query: string,
  geniusToken: string,
): Promise<ImportTrack[]> {
  switch (source) {
    case 'genius':
      return searchGenius(query, geniusToken)
    case 'lrclib':
      return searchLrcLib(query)
    case 'lyrically':
      return searchLyrically(query)
  }
}
