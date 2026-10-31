// Finds a human-made romanization of a song on Genius.
//
// Genius has a "Genius Romanizations" account that publishes pages titled "<Song> (Romanized)".
// ttml-tool itself does not read these; this is the first thing tried here, before the Google
// and local-library fallbacks ported from ttml-tool.
import { searchGenius } from '@core/lyricsImport/sources/genius'

const MAX_CANDIDATES = 5

const isRomanizationPage = (title: string, artist: string) =>
  /romaniz/i.test(artist) && /romaniz/i.test(title)

/** Lyric lines of a Genius page: no [Verse] headers, no blank lines */
export function cleanGeniusLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^\[[^\]]*\]$/.test(line))
}

/**
 * The romanized lines of a song, or `null` when Genius has none that matches.
 *
 * A page is only accepted when it has exactly `expectedLineCount` lines, so a romanization of a
 * different song (or a differently split version) can never be applied to the wrong lines.
 */
export async function findGeniusRomanization(
  title: string,
  artist: string,
  expectedLineCount: number,
  accessToken: string,
): Promise<string[] | null> {
  const queries = [`${title} ${artist} romanized`, `${title} romanized`]
  const seen = new Set<number | string>()
  let tried = 0
  for (const query of queries) {
    const tracks = await searchGenius(query.trim(), accessToken)
    for (const track of tracks) {
      if (seen.has(track.id) || !isRomanizationPage(track.name, track.artist)) continue
      seen.add(track.id)
      if (tried++ >= MAX_CANDIDATES) return null
      try {
        const lines = cleanGeniusLines(await track.fetchLyrics())
        if (lines.length === expectedLineCount) return lines
      } catch (e) {
        console.warn('Could not read a Genius romanization page', e)
      }
    }
  }
  return null
}
