// Shared types for the lyrics import feature (plain text, Genius, LRCLIB, Lyrically)

export type ImportSourceId = 'plainText' | 'genius' | 'lrclib' | 'lyrically'
export type OnlineSourceId = Exclude<ImportSourceId, 'plainText'>

/** A song found by an online source */
export interface ImportTrack {
  id: string | number
  name: string
  artist: string
  album?: string
  /** Duration in seconds, when the source reports it */
  duration?: number
  /** Cover art URL */
  cover?: string
  /** Lyrics that came with the search result, so no second request is needed */
  lyrics?: string
  /** Short extra info shown in the result list, e.g. "synced lyrics available" */
  note?: string
  /** Fetches the lyrics for sources whose search results do not carry them */
  fetchLyrics?: () => Promise<string>
}

export type TextImportMode = 'lyric' | 'lyric-trans' | 'lyric-roman' | 'lyric-trans-roman'
/** Where translation / romanization sit relative to the original line */
export type TextImportLayout = 'interleaved-line' | 'same-line-separator'

/** Options for the plain text pane. Persisted so they survive between imports. */
export interface LyricsImportPrefs {
  mode: TextImportMode
  layout: TextImportLayout
  lineSeparator: string
  swapTransAndRoman: boolean
  wordSeparator: string
  usePrefixes: boolean
  bgPrefix: string
  duetPrefix: string
  /** "Process lyrics" checkbox on the online preview */
  processOnlineLyrics: boolean
}

export const getDefaultLyricsImportPrefs = (): LyricsImportPrefs => ({
  mode: 'lyric',
  layout: 'interleaved-line',
  lineSeparator: '|',
  swapTransAndRoman: false,
  wordSeparator: '\\',
  usePrefixes: true,
  bgPrefix: '<',
  duetPrefix: '>',
  processOnlineLyrics: false,
})

/** One imported line, before it is turned into editor objects */
export interface LineDraft {
  /** Syllable texts, in order. Whitespace-only entries are kept as spaces */
  words: string[]
  translation: string
  romanization: string
  background: boolean
  duet: boolean
}
