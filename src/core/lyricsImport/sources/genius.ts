// Genius lyrics source.
// Derived from NaeNae-AMLL-TTML-TOOL (modules/genius/api/client.ts), licensed under AGPL-3.0.
// https://github.com/NaeNaeTart/NaeNae-AMLL-TTML-TOOL
import type { MetadataMap } from '@core/types'

import type { ImportTrack } from '../types'
import { fetchChecked } from './http'

const BASE_URL = 'https://api.genius.com'

/** Where users can create the "Client Access Token" this source needs */
export const GENIUS_API_CLIENTS_URL = 'https://genius.com/api-clients'
export const GENIUS_TOKEN_GUIDE_URL =
  'https://guides.spicylyrics.org/s/ttml/doc/2-import-the-lyrics-CK0YxRxPwp#h-create-a-genius-client-access-token'

interface GeniusSearchResponse {
  response: {
    hits: {
      result?: {
        id: number
        title: string
        primary_artist: { name: string }
        album?: { name: string }
        song_art_image_url?: string
        song_art_image_thumbnail_url?: string
      }
    }[]
  }
}

/**
 * The Genius page itself is not CORS-enabled, but its public embed endpoint is.
 * It returns the lyrics as an escaped HTML string inside `document.write(...)`.
 * The script is parsed, never evaluated.
 */
export function extractLyricsFromEmbed(embedScript: string): string {
  const match = embedScript.match(/document\.write\(JSON\.parse\('((?:\\.|[^'])*)'\)\)/s)
  if (!match) throw new Error('Lyrics were not present in the Genius embed response.')

  // Undo the JavaScript string escaping to get back the JSON text handed to JSON.parse
  const escaped = match[1]!
  let jsonString = ''
  for (let i = 0; i < escaped.length; i++) {
    const character = escaped[i]!
    if (character === '\\' && i + 1 < escaped.length) {
      const next = escaped[++i]!
      jsonString += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next
    } else jsonString += character
  }

  const html = JSON.parse(jsonString) as string
  const bodyMatch = html.match(
    /<div\b[^>]*class=["'][^"']*\brg_embed_body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )
  if (!bodyMatch) throw new Error('Lyrics were empty in the Genius embed response.')

  let lyrics: string | undefined
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(bodyMatch[1]!, 'text/html')
    for (const br of doc.querySelectorAll('br')) br.replaceWith('\n')
    lyrics = doc.body.textContent?.trim()
  } else {
    lyrics = bodyMatch[1]!
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
  }
  if (!lyrics) throw new Error('Lyrics were empty in the Genius embed response.')

  // The embed puts a source newline after every <br>; both survive, which would
  // otherwise leave a blank line after each lyric line.
  return lyrics.replace(/\n[\t ]*\n/g, '\n')
}

async function getLyrics(songId: number): Promise<string> {
  const response = await fetchChecked(`https://genius.com/songs/${songId}/embed.js`, 'Genius')
  return extractLyricsFromEmbed(await response.text())
}

/** Search Genius. Throws an `ImportHttpError` with status 401 when the token is rejected. */
export async function searchGenius(query: string, accessToken: string): Promise<ImportTrack[]> {
  const response = await fetchChecked(
    `${BASE_URL}/search?q=${encodeURIComponent(query)}&access_token=${encodeURIComponent(accessToken)}`,
    'Genius',
  )
  const json = (await response.json()) as GeniusSearchResponse
  return json.response.hits.flatMap(({ result }) =>
    result
      ? [
          {
            id: result.id,
            name: result.title,
            artist: result.primary_artist.name,
            album: result.album?.name,
            cover: result.song_art_image_thumbnail_url || result.song_art_image_url,
            fetchLyrics: () => getLyrics(result.id),
          },
        ]
      : [],
  )
}

// Songwriter lookup below follows spicylyrics/ttml-tool (AGPL-3.0):
//   src/modules/genius/modals/GeniusSearchDialog.tsx  (handleSelectSong)
//   src/modules/genius/api/client.ts                  (getSongById, getArtistById)

interface GeniusWriter {
  id: number
  name: string
}

interface GeniusSongResponse {
  response: {
    song: {
      title: string
      primary_artist: { name: string }
      album?: { name: string } | null
      writer_artists?: GeniusWriter[]
    }
  }
}

interface GeniusArtistResponse {
  response: {
    artist: {
      alternate_names?: string[]
      description?: { plain?: string }
    }
  }
}

const BORN_PATTERN = /born\s+([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){1,4})/
const REAL_NAME_PATTERN = /real\s+name\s+(?:is\s+)?([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){1,4})/i
const FORBIDDEN_NAME_PREFIXES = ['King ', 'The ', 'Mr. ', 'aka ', 'alias ', 'DJ ']

/**
 * Works out an artist's real (legal) name from their Genius profile, or returns the stage name
 * when nothing convincing is found. Same heuristics as ttml-tool:
 * 1. "born <Name>" or "real name (is) <Name>" in the profile text
 * 2. otherwise the shortest alternate name that does not look like a stage name
 */
export function pickRealName(
  stageName: string,
  alternateNames: readonly string[],
  description: string,
): string {
  // 1. Try to extract from description using regex
  const bornMatch = description.match(BORN_PATTERN)
  const realNameMatch = description.match(REAL_NAME_PATTERN)
  if (bornMatch) return bornMatch[1]!
  if (realNameMatch) return realNameMatch[1]!

  // 2. Fallback to alternate names with strict filtering
  const potentialNames = alternateNames.filter((name) => {
    const isNotStageName =
      !name.toLowerCase().includes(stageName.toLowerCase()) &&
      !stageName.toLowerCase().includes(name.toLowerCase())
    const hasGoodWordCount = name.split(' ').length >= 2 && name.split(' ').length <= 4
    const noForbiddenPrefix = !FORBIDDEN_NAME_PREFIXES.some((p) => name.startsWith(p))
    const isCapitalized = name.split(' ').every((word) => /^[A-Z]/.test(word))
    const noUrls = !name.includes('http') && !name.includes('www.')
    return isNotStageName && hasGoodWordCount && noForbiddenPrefix && isCapitalized && noUrls
  })
  // Prioritize the shortest multi-word name as it's often the cleanest "Real Name"
  if (potentialNames.length > 0) return [...potentialNames].sort((a, b) => a.length - b.length)[0]!
  return stageName
}

export interface GeniusSongwriters {
  songwriters: string[]
  title: string
  primaryArtist: string
  album?: string
}

export interface FetchSongwritersOptions {
  /** Replace each stage name with the artist's real name (one extra request per writer) */
  findRealNames?: boolean
  /** Called before each real name lookup */
  onProgress?: (name: string, current: number, total: number) => void
}

/**
 * The "Writers" credits of a Genius song, plus the song's title, main artist and album.
 * Throws an `ImportHttpError` with status 401 when the token is rejected.
 */
export async function fetchGeniusSongwriters(
  songId: number | string,
  accessToken: string,
  { findRealNames = false, onProgress }: FetchSongwritersOptions = {},
): Promise<GeniusSongwriters> {
  const token = encodeURIComponent(accessToken)
  const response = await fetchChecked(
    `${BASE_URL}/songs/${encodeURIComponent(String(songId))}?access_token=${token}`,
    'Genius',
  )
  const song = ((await response.json()) as GeniusSongResponse).response.song
  const artists = song.writer_artists ?? []
  let songwriters = artists.map((a) => a.name)

  if (songwriters.length > 0 && findRealNames) {
    const realNames: string[] = []
    for (const [index, artist] of artists.entries()) {
      onProgress?.(artist.name, index + 1, artists.length)
      try {
        const detail = await fetchChecked(
          `${BASE_URL}/artists/${artist.id}?access_token=${token}&text_format=plain`,
          'Genius',
        )
        const artistDetail = ((await detail.json()) as GeniusArtistResponse).response.artist
        realNames.push(
          pickRealName(
            artist.name,
            artistDetail.alternate_names ?? [],
            artistDetail.description?.plain ?? '',
          ),
        )
      } catch (e) {
        // One writer's profile failing should not lose the others
        console.error(`Failed to fetch real name for ${artist.name}`, e)
        realNames.push(artist.name)
      }
    }
    songwriters = realNames
  }

  return {
    songwriters,
    title: song.title,
    primaryArtist: song.primary_artist.name,
    album: song.album?.name,
  }
}

/**
 * Applies a fetched song to the metadata the way ttml-tool does: the songwriters are replaced,
 * while the title, artist and album are only filled in when the field is missing or empty.
 */
export function applyGeniusSongMetadata(
  metadata: MetadataMap,
  { songwriters, title, primaryArtist, album }: GeniusSongwriters,
): MetadataMap {
  const next: MetadataMap = { ...metadata, songwriters }
  const upsertIfMissing = (key: string, value: string) => {
    const existing = next[key]
    if (!existing || existing.length === 0 || (existing.length === 1 && existing[0] === ''))
      next[key] = [value]
  }
  upsertIfMissing('musicName', title)
  upsertIfMissing('artists', primaryArtist)
  if (album) upsertIfMissing('album', album)
  return next
}
