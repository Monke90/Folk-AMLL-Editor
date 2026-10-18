// Genius lyrics source.
// Derived from NaeNae-AMLL-TTML-TOOL (modules/genius/api/client.ts), licensed under AGPL-3.0.
// https://github.com/NaeNaeTart/NaeNae-AMLL-TTML-TOOL
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

interface GeniusSongResponse {
  response: {
    song?: {
      writer_artists?: { name: string }[]
      custom_performances?: { label: string; artists?: { name: string }[] }[]
    }
  }
}

/** Credit labels on Genius that mean "wrote the song" */
const WRITER_CREDIT_LABEL = /writ|compos|lyric|songwrit/i

/**
 * Songwriter credits of a Genius song: the "Writers" list plus any performance credit whose
 * label is a writing role (Written By, Composer, Lyricist...). Names are de-duplicated and keep
 * Genius's order. Throws an `ImportHttpError` with status 401 when the token is rejected.
 */
export async function fetchGeniusSongwriters(
  songId: number | string,
  accessToken: string,
): Promise<string[]> {
  const response = await fetchChecked(
    `${BASE_URL}/songs/${encodeURIComponent(String(songId))}?access_token=${encodeURIComponent(accessToken)}`,
    'Genius',
  )
  const song = ((await response.json()) as GeniusSongResponse).response.song
  const names: string[] = [...(song?.writer_artists ?? []).map((a) => a.name)]
  for (const credit of song?.custom_performances ?? [])
    if (WRITER_CREDIT_LABEL.test(credit.label))
      names.push(...(credit.artists ?? []).map((a) => a.name))

  const seen = new Set<string>()
  return names
    .map((n) => n.trim())
    .filter((n) => {
      const key = n.toLowerCase()
      if (!n || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
