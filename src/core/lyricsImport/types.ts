// Shared types for the lyrics import feature (plain text, Genius, LRCLIB, Lyrically)
import type { LyricPrepOptions } from './lyricPrep'

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

/** Options of the import panel. Persisted so they survive between imports. */
export interface LyricsImportPrefs {
  /** The source tab the panel was last left on */
  source: ImportSourceId
  mode: TextImportMode
  layout: TextImportLayout
  lineSeparator: string
  swapTransAndRoman: boolean
  wordSeparator: string
  usePrefixes: boolean
  bgPrefix: string
  duetPrefix: string
  /** Which Process lyrics steps run. Missing keys keep their default (on) */
  processSteps: Partial<LyricPrepOptions>
  /** Whether the list of Process lyrics steps is expanded */
  processStepsOpen: boolean
  /** Key of the syllable engine Split syllables uses */
  syllableEngine: string
  /** Fetch songwriters from Genius after importing a Genius song */
  fetchSongwriters: boolean
  /** Turn ’ ‘ ´ and similar marks into the plain apostrophe on import */
  normalizeApostrophes: boolean
  /** Turn Cyrillic Е/е hidden inside Latin words into Latin E/e on import */
  normalizeCyrillicEs: boolean
}

/** The part of the options that says how the text area is read */
export type ImportTextFormat = Pick<
  LyricsImportPrefs,
  | 'mode'
  | 'layout'
  | 'lineSeparator'
  | 'swapTransAndRoman'
  | 'wordSeparator'
  | 'usePrefixes'
  | 'bgPrefix'
  | 'duetPrefix'
>

export const getDefaultLyricsImportPrefs = (): LyricsImportPrefs => ({
  source: 'plainText',
  mode: 'lyric',
  layout: 'interleaved-line',
  lineSeparator: '|',
  swapTransAndRoman: false,
  wordSeparator: '\\',
  usePrefixes: true,
  bgPrefix: '<',
  duetPrefix: '>',
  processSteps: {},
  processStepsOpen: false,
  syllableEngine: 'basic',
  fetchSongwriters: false,
  normalizeApostrophes: true,
  normalizeCyrillicEs: false,
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
