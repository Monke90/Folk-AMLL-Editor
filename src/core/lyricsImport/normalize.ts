// Text clean-ups applied to imported lyrics.
// Derived from spicylyrics/ttml-tool (src/utils/apostrophe-normalization.ts),
// licensed under AGPL-3.0. https://github.com/spicylyrics/ttml-tool
import type { LineDraft } from './types'

const APOSTROPHE_LIKE_CHARACTERS = /[`´ʻʼ՚‘’‚‛′‵＇]/g

/** Converts common apostrophe-like characters to the ASCII apostrophe */
export const normalizeApostrophes = (text: string): string =>
  text.replace(APOSTROPHE_LIKE_CHARACTERS, "'")

/**
 * Converts Cyrillic Е/е only when it is embedded in an otherwise Latin word.
 * This catches hidden lookalikes such as "thе" without changing genuine
 * Cyrillic words such as "привет".
 */
export const normalizeCyrillicEs = (text: string): string =>
  text.replace(/[\p{L}\p{N}]+/gu, (token) => {
    if (!/[Ее]/.test(token) || !/[A-Za-z]/.test(token)) return token
    return token.replace(/[Ее]/g, (character) => (character === 'Е' ? 'E' : 'e'))
  })

export interface NormalizeOptions {
  normalizeApostrophes: boolean
  normalizeCyrillicEs: boolean
}

/** The text of every syllable, translation and romanization, normalized */
export function normalizeDrafts(drafts: LineDraft[], options: NormalizeOptions): LineDraft[] {
  if (!options.normalizeApostrophes && !options.normalizeCyrillicEs) return drafts
  const normalize = (text: string) => {
    let normalized = text
    if (options.normalizeApostrophes) normalized = normalizeApostrophes(normalized)
    if (options.normalizeCyrillicEs) normalized = normalizeCyrillicEs(normalized)
    return normalized
  }
  return drafts.map((draft) => ({
    ...draft,
    words: draft.words.map(normalize),
    translation: normalize(draft.translation),
    romanization: normalize(draft.romanization),
  }))
}
