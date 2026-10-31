// Romanize lyric lines: Genius first, then the Google / local-library fallback from ttml-tool.
import type { LyricLine, LyricSyllable } from '@core/types'

import { findGeniusRomanization } from './genius'
import { type PhoneticLanguage, buildLineRomanization, getPhoneticSyllables } from './phonetic'

export type { PhoneticLanguage } from './phonetic'

export interface RomanizeInput {
  /** Every line of the project, in order */
  allLines: readonly LyricLine[]
  /** Lines to fill in. Ignored when `selectedSyllables` is not empty */
  selectedLines: readonly LyricLine[]
  /** When set, only these syllables are filled in (their line's romanization is left alone) */
  selectedSyllables: readonly LyricSyllable[]
  language: PhoneticLanguage
  /** Genius "Client Access Token"; without one the Genius step is skipped */
  geniusToken: string
  title: string
  artist: string
}

export interface RomanizeReport {
  /** Lines whose romanization came from a Genius page */
  fromGenius: number
  /** Lines filled in by the Google / local fallback */
  fromFallback: number
  /** Whether a Genius page was found */
  geniusFound: boolean
}

const PARALLEL_LINES = 4
const NON_LATIN_LETTER = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u

/** Only lines with something other than Latin script have a romanization worth looking up */
const needsRomanizing = (line: LyricLine) =>
  line.syllables.some((syl) => NON_LATIN_LETTER.test(syl.text))

async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(work))
  }
}

export async function romanize(input: RomanizeInput): Promise<RomanizeReport> {
  const report: RomanizeReport = { fromGenius: 0, fromFallback: 0, geniusFound: false }
  const capsulesOf = (line: LyricLine) => line.syllables.map((syl) => syl.text)

  // Individual syllables: ttml-tool's word mode. Works a line at a time so each reading keeps
  // the context of the whole line.
  if (input.selectedSyllables.length > 0) {
    const chosen = new Set(input.selectedSyllables.map((syl) => syl.id))
    const lines = input.allLines.filter((line) => line.syllables.some((syl) => chosen.has(syl.id)))
    await inBatches(lines, PARALLEL_LINES, async (line) => {
      const capsules = capsulesOf(line)
      if (capsules.join('').trim() === '') return
      const readings = await getPhoneticSyllables(capsules, input.language)
      line.syllables.forEach((syl, i) => {
        if (chosen.has(syl.id)) syl.romanization = readings[i] ?? ''
      })
      report.fromFallback++
    })
    return report
  }

  const targets = input.selectedLines.filter((line) => line.syllables.length > 0)

  // Genius reads line by line, so it is matched against the lead lines of the whole song
  const leadLines = input.allLines.filter((line) => !line.background)
  let geniusLines: string[] | null = null
  if (input.geniusToken && input.title && targets.some(needsRomanizing)) {
    try {
      geniusLines = await findGeniusRomanization(
        input.title,
        input.artist,
        leadLines.length,
        input.geniusToken,
      )
    } catch (e) {
      console.warn('Genius romanization lookup failed, using the fallback', e)
    }
  }
  report.geniusFound = geniusLines !== null
  const geniusFor = new Map<string, string>()
  if (geniusLines) leadLines.forEach((line, i) => geniusFor.set(line.id, geniusLines[i]!))

  await inBatches(targets, PARALLEL_LINES, async (line) => {
    const capsules = capsulesOf(line)
    if (capsules.join('').trim() === '') return
    const fromGenius = geniusFor.get(line.id)

    if (fromGenius && needsRomanizing(line)) {
      line.romanization = fromGenius
      // One word of romanization per syllable, when the counts line up
      const filled = line.syllables.filter((syl) => syl.text.trim() !== '')
      const words = fromGenius.split(/\s+/).filter(Boolean)
      if (words.length === filled.length) {
        let w = 0
        for (const syl of line.syllables) {
          syl.romanization = syl.text.trim() === '' ? '' : words[w++]!
        }
      } else {
        // Otherwise syllables get the fallback's per-syllable readings, line keeps Genius' text
        const readings = await getPhoneticSyllables(capsules, input.language)
        line.syllables.forEach((syl, i) => {
          if (readings[i]) syl.romanization = readings[i]!
        })
      }
      report.fromGenius++
      return
    }

    const readings = await getPhoneticSyllables(capsules, input.language)
    if (!readings.some(Boolean)) return
    line.romanization = buildLineRomanization(capsules, readings)
    line.syllables.forEach((syl, i) => {
      syl.romanization = readings[i] ?? ''
    })
    report.fromFallback++
  })
  return report
}
