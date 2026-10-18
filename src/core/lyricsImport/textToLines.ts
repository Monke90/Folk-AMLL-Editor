// Converts raw text into line drafts, the same way NaeNae's plain text import does.
// Derived from NaeNae-AMLL-TTML-TOOL (text-to-lines.ts, text-import-words.ts), licensed under AGPL-3.0.
// https://github.com/NaeNaeTart/NaeNae-AMLL-TTML-TOOL
import { prepareTextImport } from './lyricPrep'
import type { LineDraft, TextImportLayout, TextImportMode } from './types'

export interface TextToLinesOptions {
  /** Run the text through {@link prepareTextImport} first */
  processLyrics?: boolean
  /** Keep lines like `[Chorus]` as lyric lines, or drop them */
  sectionHeaders?: 'preserve' | 'discard'
  /** Word separator. Empty = the whole line is one syllable */
  wordSeparator?: string
  /** Also split after every hyphen: "la-la" -> "la-", "la" */
  splitHyphens?: boolean
  /** Squash runs of whitespace in the line into single spaces */
  collapseWhitespace?: boolean
  /** Lines starting with this are background vocals. Empty = off */
  backgroundPrefix?: string
  /** Lines starting with this are the second singer (duet). Empty = off */
  duetPrefix?: string
  mode?: TextImportMode
  layout?: TextImportLayout
  lineSeparator?: string
  swapTransAndRoman?: boolean
}

/**
 * Split an imported line into words: at the explicit separator (if any),
 * then optionally after each hyphen, keeping the hyphen on the left part.
 */
export function splitTextImportWords(
  text: string,
  separator: string,
  splitHyphens = true,
): string[] {
  const segments = separator ? text.split(separator).filter((word) => word.length > 0) : [text]
  return segments
    .flatMap((word) => (splitHyphens ? word.split(/(?<=-)/g) : [word]))
    .map((word) => word.replace(/\\/g, ''))
}

const SECTION_HEADER = /^\[.*\]$/

/**
 * Convert text to untimed line drafts.
 * Blank lines are dropped, since an empty lyric line is of no use to the editor.
 */
export function textToLineDrafts(text: string, options: TextToLinesOptions = {}): LineDraft[] {
  const {
    processLyrics = false,
    sectionHeaders = 'discard',
    wordSeparator = processLyrics ? '\\' : '',
    splitHyphens = true,
    collapseWhitespace = false,
    backgroundPrefix = processLyrics ? '<' : '',
    duetPrefix = '',
    mode = 'lyric',
    layout = 'interleaved-line',
    lineSeparator = '|',
    swapTransAndRoman = false,
  } = options

  const source = processLyrics ? prepareTextImport(text, sectionHeaders === 'preserve') : text
  const rows = source.split(/\r\n|\r|\n/)
  const sameLine = layout === 'same-line-separator'

  // Which extra values follow the original line, in order
  const extras: ('translation' | 'romanization')[] =
    mode === 'lyric-trans-roman'
      ? ['translation', 'romanization']
      : mode === 'lyric-trans'
        ? ['translation']
        : mode === 'lyric-roman'
          ? ['romanization']
          : []

  const result: LineDraft[] = []
  for (let index = 0; index < rows.length; ) {
    const parts = extras.length && sameLine ? rows[index++]!.split(lineSeparator) : [rows[index++]!]
    let original = parts[0]!.trim()

    if (sectionHeaders === 'discard' && SECTION_HEADER.test(original)) continue

    const draft: LineDraft = {
      words: [],
      translation: '',
      romanization: '',
      background: false,
      duet: false,
    }
    // Always consume the extra rows, even when the line ends up skipped,
    // so the following lines do not shift out of their groups.
    for (const [extraIndex, key] of extras.entries()) {
      const value = sameLine ? (parts[extraIndex + 1] ?? '') : (rows[index++] ?? '')
      draft[key] = value.trim()
    }
    if (!original) continue

    while (original) {
      if (backgroundPrefix && original.startsWith(backgroundPrefix)) {
        draft.background = true
        original = original.slice(backgroundPrefix.length)
      } else if (duetPrefix && original.startsWith(duetPrefix)) {
        draft.duet = true
        original = original.slice(duetPrefix.length)
      } else break
    }
    if (collapseWhitespace) original = original.replace(/\s+/g, ' ')

    draft.words = splitTextImportWords(original, wordSeparator, splitHyphens)
    // A line that is only a prefix has nothing to sing
    if (!draft.words.some((word) => word.trim())) continue

    if (swapTransAndRoman)
      [draft.translation, draft.romanization] = [draft.romanization, draft.translation]
    result.push(draft)
  }
  return result
}
