/*
 * Adapted from the Spicy Lyrics renderer (AGPL-3.0-or-later), via the ttml-tool preview.
 * Original project: https://github.com/Spikerko/Spicy-Lyrics
 */
import type { LyricLine, LyricSyllable } from '@core/types'

import { stripZeroWidth } from './model'

// Silence between two parts of a word beyond which one fill would run through it
const MAX_JOIN_GAP_MS = 100
// A part sung this many times faster or slower per character than the word as a whole stays
// split, since a joined word fills at one steady pace
const MAX_PACE_RATIO = 3

const hasSpace = (text: string) => /\s/u.test(text)
// "Ah-" "ah-" "ah": a trailing dash marks a deliberate break, so the parts stay apart
const endsWithDash = (text: string) => /[-‐-―]$/u.test(text)
// Scripts written without spaces: the parts of a "word" there can run the whole line
const unspacedScript =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u

const clean = (value: string, background: boolean) =>
  stripZeroWidth(background ? value.trim().replace(/[()]/g, '').trim() : value.trim())

const isSyllable = (s: LyricSyllable, background: boolean) =>
  !/^\s*$/u.test(s.text) &&
  Number.isFinite(s.startTime) &&
  Number.isFinite(s.endTime) &&
  s.endTime >= s.startTime &&
  clean(s.text, background).length > 0

/** The next span touches this one and neither side carries the break */
const continuesInto = (s: LyricSyllable, next: LyricSyllable, background: boolean) =>
  isSyllable(next, background) && !/[\s,]$/u.test(s.text) && !/^\s/u.test(next.text)

function paceIsEven(run: LyricSyllable[], texts: string[]) {
  const duration = run[run.length - 1]!.endTime - run[0]!.startTime
  const chars = texts.reduce((sum, text) => sum + text.length, 0)
  if (duration <= 0 || chars === 0) return false
  return run.every((part, index) => {
    const timeShare = (part.endTime - part.startTime) / duration
    const charShare = texts[index]!.length / chars
    return timeShare >= charShare / MAX_PACE_RATIO && timeShare <= charShare * MAX_PACE_RATIO
  })
}

function canJoin(run: LyricSyllable[], background: boolean) {
  const texts = run.map((part) => clean(part.text, background))
  if (
    !run.every(
      (part, index) =>
        texts[index]!.length > 0 &&
        !hasSpace(texts[index]!) &&
        !hasSpace(clean(part.romanization, background)),
    )
  )
    return false
  if (texts.slice(0, -1).some(endsWithDash)) return false
  if (texts.some((text) => unspacedScript.test(text))) return false
  for (let index = 1; index < run.length; index++)
    if (run[index]!.startTime - run[index - 1]!.endTime > MAX_JOIN_GAP_MS) return false
  return paceIsEven(run, texts)
}

function join(run: LyricSyllable[]): LyricSyllable {
  const first = run[0]!
  const hasRomanization = run.some((part) => part.romanization.trim().length > 0)
  return {
    ...first,
    // Raw text, so the first part's leading space and the last part's trailing space or comma
    // still mark the word's edges
    text: run.map((part) => part.text).join(''),
    romanization: hasRomanization
      ? run.map((part) => part.romanization.trim() || part.text.trim()).join('')
      : first.romanization,
    endTime: Math.max(...run.map((part) => part.endTime)),
  }
}

/** Spicy's "Join Split Words": a word that does not join cleanly stays split. */
export function joinSplitSyllables(syllables: LyricSyllable[], background = false) {
  const joined: LyricSyllable[] = []
  let changed = false
  for (let index = 0; index < syllables.length; index++) {
    let end = index
    if (isSyllable(syllables[index]!, background)) {
      while (
        end + 1 < syllables.length &&
        continuesInto(syllables[end]!, syllables[end + 1]!, background)
      )
        end++
    }
    const run = syllables.slice(index, end + 1)
    if (run.length > 1 && canJoin(run, background)) {
      joined.push(join(run))
      changed = true
    } else joined.push(...run)
    index = end
  }
  return changed ? joined : syllables
}

/** Join split words in every line, keeping lines with nothing to join as they are. */
export function joinSplitWordsInLines(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => {
    const syllables = joinSplitSyllables(line.syllables, line.background)
    return syllables === line.syllables ? line : { ...line, syllables }
  })
}
