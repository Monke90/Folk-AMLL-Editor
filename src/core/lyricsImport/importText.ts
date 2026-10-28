// How the import text area is read, and syllable marking of that text.
// Derived from spicylyrics/ttml-tool (src/modules/lyrics-import/logic/import-text.ts),
// licensed under AGPL-3.0. https://github.com/spicylyrics/ttml-tool
import { textToLineDrafts } from './textToLines'
import type { ImportTextFormat, LineDraft } from './types'

export const SECTION_HEADER = /^\[.*\]$/

/** Number of text rows that follow a lyric row and hold its translation / romanization */
function subRowCountOf(format: ImportTextFormat): number {
  if (format.layout === 'same-line-separator') return 0
  return format.mode === 'lyric-trans-roman' ? 2 : format.mode === 'lyric' ? 0 : 1
}

/**
 * Parse the import text into untimed lines. Every source goes through this.
 * Blank rows are dropped, and `[Header]` rows are dropped too.
 */
export function importTextToDrafts(text: string, format: ImportTextFormat): LineDraft[] {
  return textToLineDrafts(text, {
    mode: format.mode,
    layout: format.layout,
    lineSeparator: format.lineSeparator,
    swapTransAndRoman: format.swapTransAndRoman,
    wordSeparator: format.wordSeparator,
    sectionHeaders: 'discard',
    backgroundPrefix: format.usePrefixes ? format.bgPrefix : '',
    duetPrefix: format.usePrefixes ? format.duetPrefix : '',
  })
}

/** How many `[Header]` rows the text has */
export const countSectionHeaders = (text: string) =>
  text.split(/\r\n|\r|\n/).filter((row) => SECTION_HEADER.test(row.trim())).length

/**
 * Insert syllable split marks into the import text, leaving headers, blank
 * rows, prefixes, translation rows and spacing as they are. Each run of
 * non-space text between word separators goes through `splitWord`; spaces
 * become their own words, the same as Process lyrics writes them.
 */
export function segmentImportText(
  text: string,
  format: ImportTextFormat,
  splitWord: (word: string) => string[],
): string {
  const separator = format.wordSeparator
  if (!separator) return text
  const subRowCount = subRowCountOf(format)
  const sameLine =
    format.mode !== 'lyric' && format.layout === 'same-line-separator' && !!format.lineSeparator
  const prefixes = format.usePrefixes ? [format.bgPrefix, format.duetPrefix].filter(Boolean) : []

  const splitChunk = (chunk: string) => {
    const parts = splitWord(chunk).filter((part) => part.length > 0)
    // Never let a split change the text itself
    return parts.join('') === chunk ? parts : [chunk]
  }
  // A word already marked inside (other than right after a hyphen) was split
  // by hand or by an earlier run, so it's left alone. That keeps this idempotent.
  const splitWordTokens = (tokens: string[]) =>
    tokens.some((token, index) => index < tokens.length - 1 && !token.endsWith('-'))
      ? tokens
      : tokens.flatMap(splitChunk)
  const splitBody = (body: string) => {
    const tokens = body
      .split(separator)
      .flatMap((piece) => piece.split(/(\s+)/))
      .filter((token) => token.length > 0)
    const output: string[] = []
    let word: string[] = []
    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        output.push(...splitWordTokens(word), token)
        word = []
      } else word.push(token)
    }
    output.push(...splitWordTokens(word))
    return output.join(separator)
  }

  const rows = text.split(/\r\n|\r|\n/)
  const output: string[] = []
  for (let index = 0; index < rows.length; ) {
    const row = rows[index++]!
    if (SECTION_HEADER.test(row.trim())) {
      output.push(row)
      continue
    }
    const subRows = rows.slice(index, index + subRowCount)
    index += subRowCount
    if (!row.trim()) {
      output.push(row, ...subRows)
      continue
    }
    const cut = sameLine ? row.indexOf(format.lineSeparator) : -1
    const main = cut >= 0 ? row.slice(0, cut) : row
    const rest = cut >= 0 ? row.slice(cut) : ''
    const lead = main.match(/^\s*/)?.[0] ?? ''
    let body = main.slice(lead.length)
    let prefix = ''
    for (let found = true; found; ) {
      found = false
      for (const marker of prefixes) {
        if (body.startsWith(marker)) {
          prefix += marker
          body = body.slice(marker.length)
          found = true
        }
      }
    }
    const trail = body.match(/\s*$/)?.[0] ?? ''
    body = body.slice(0, body.length - trail.length)
    output.push(lead + prefix + splitBody(body) + trail + rest, ...subRows)
  }
  return output.join('\n')
}

/**
 * {@link segmentImportText} for splitters that are asynchronous and take many words at once:
 * the words are collected first, split in one call, then put back into the text.
 */
export async function segmentImportTextAsync(
  text: string,
  format: ImportTextFormat,
  splitWords: (words: string[]) => Promise<string[][]>,
): Promise<string> {
  const chunks = new Set<string>()
  segmentImportText(text, format, (word) => {
    chunks.add(word)
    return [word]
  })
  if (chunks.size === 0) return text
  const words = [...chunks]
  const results = await splitWords(words)
  const split = new Map(words.map((word, index) => [word, results[index] ?? [word]]))
  return segmentImportText(text, format, (word) => split.get(word) ?? [word])
}
