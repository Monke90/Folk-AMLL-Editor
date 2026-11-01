/*
 * Adapted from the Spicy Lyrics renderer (AGPL-3.0-or-later), via the ttml-tool preview.
 * Original project: https://github.com/Spikerko/Spicy-Lyrics
 * Rebuilt on Folk's own line and syllable types.
 */
import type { LyricLine, LyricSyllable } from '@core/types'

export interface SpicyToken {
  id: string
  text: string
  startTime: number
  endTime: number
  letters?: string[]
  isBackground: boolean
  spaceAfter?: boolean
  breakAfter?: boolean
  allowInternalWrap?: boolean
}

export interface SpicyTokenLayoutItem {
  token: SpicyToken
  wordIndex: number
}

export interface SpicyWordGroup {
  items: SpicyTokenLayoutItem[]
  hasTrailingSpace: boolean
}

export interface SpicyLine {
  id: string
  startTime: number
  endTime: number
  isLineSynced: boolean
  isRtl: boolean
  text?: string
  isBackground: boolean
  isDuet: boolean
  isDotLine?: boolean
  translation?: string
  words: SpicyToken[]
}

export interface SpicyBuildOptions {
  /** Spicy's "Simple Lyrics" mode */
  simple: boolean
  /** Prefer each syllable's romanization when it has one */
  romanized: boolean
  /** Treat every line as line-synced (no per-word fill) */
  forceLineSynced: boolean
}

/** Gap between two vocal groups that gets an interlude, and the dots' lead-out. */
const INTERLUDE_GAP = 3000
const INTERLUDE_PADDING = 550

/**
 * Spicy drops zero-width spaces, direction marks, word joiners and BOMs before it renders text:
 * they would otherwise become empty letters with their own share of a held word. ZWJ and ZWNJ
 * stay, since they shape Arabic, Indic and emoji text.
 */
const zeroWidth = new RegExp(
  `[${String.fromCodePoint(0x200b, 0x200e, 0x200f, 0x2060, 0xfeff)}]`,
  'gu',
)
export const stripZeroWidth = (text: string) => text.replace(zeroWidth, '')

/** First-strong-character direction check, as Spicy does it. */
export function isRtl(text: string) {
  for (const character of text) {
    if (/[\d\s,.;:?!()[\]{}"'\\/<>@#$%^&*_=+-]/u.test(character)) continue
    return /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-ﭏﭐ-﷿ﹰ-﻿]/u.test(character)
  }
  return false
}

const isCjk = (text: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null
// Viramas of the Brahmic scripts plus ZERO WIDTH JOINER: the segmenter splits after them in some
// scripts, which breaks the conjunct across two spans.
const joinsNext = /[्্੍્୍்్್്්္្‍]$/u

/** Split text into whole glyph clusters, the units a held word animates one by one. */
export function splitLetters(text: string): string[] {
  const graphemes = segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : Array.from(text)
  const letters: string[] = []
  for (const grapheme of graphemes) {
    const last = letters.length - 1
    if (last >= 0 && joinsNext.test(letters[last]!) && grapheme.trim().length > 0)
      letters[last] += grapheme
    else letters.push(grapheme)
  }
  return letters
}

const validLine = (start: number, end: number) =>
  Number.isFinite(start) && Number.isFinite(end) && end > start
const validWord = (start: number, end: number) =>
  Number.isFinite(start) && Number.isFinite(end) && end >= start

/** Layout-only wrappers around syllables that touch, so a split word scales as one piece. */
export function groupSpicyTokens(tokens: SpicyToken[]): SpicyWordGroup[] {
  const groups: SpicyWordGroup[] = []
  let items: SpicyTokenLayoutItem[] = []
  for (let wordIndex = 0; wordIndex < tokens.length; wordIndex++) {
    const token = tokens[wordIndex]!
    items.push({ token, wordIndex })
    if (token.spaceAfter || token.breakAfter || wordIndex === tokens.length - 1) {
      groups.push({ items, hasTrailingSpace: !!token.spaceAfter && wordIndex < tokens.length - 1 })
      items = []
    }
  }
  return groups
}

const syllableText = (syllable: LyricSyllable, romanized: boolean) =>
  romanized && syllable.romanization.trim() ? syllable.romanization : syllable.text

function lineText(line: LyricLine, romanized: boolean) {
  if (romanized && line.romanization.trim()) return stripZeroWidth(line.romanization)
  return stripZeroWidth(line.syllables.map((s) => syllableText(s, romanized)).join(''))
}

function makeToken(
  syllable: LyricSyllable,
  simple: boolean,
  romanized: boolean,
  background: boolean,
): SpicyToken {
  const usesRomanization = romanized && !!syllable.romanization.trim()
  // Spicy trims every syllable, and drops a background vocal's parentheses
  const raw = usesRomanization ? syllable.romanization : syllable.text
  const text = stripZeroWidth(background ? raw.trim().replace(/[()]/g, '').trim() : raw.trim())
  const allowInternalWrap = usesRomanization || isCjk(syllable.text) || isCjk(text)
  const duration = syllable.endTime - syllable.startTime
  const letters = duration >= (simple ? 1050 : 1000) ? splitLetters(text) : []
  const letterCapable = letters.length > 0 && !isRtl(text) && (!simple || letters.length <= 12)
  // Held words get their own timing window: normal mode finishes the letter pass 250 ms before
  // the word ends; simple mode applies its matching start and end offsets.
  const emphasisStart = simple ? syllable.startTime + 21 : syllable.startTime
  const emphasisEnd = simple ? syllable.endTime + 40 : syllable.endTime - 250
  return {
    id: syllable.id,
    text,
    startTime: letterCapable ? emphasisStart : syllable.startTime,
    endTime: letterCapable && emphasisEnd > emphasisStart ? emphasisEnd : syllable.endTime,
    letters: letterCapable ? letters : undefined,
    isBackground: background,
    breakAfter: allowInternalWrap,
    allowInternalWrap,
  }
}

/** Whitespace-only syllables are word breaks, not words. */
function makeTokens(
  syllables: LyricSyllable[],
  simple: boolean,
  romanized: boolean,
  background: boolean,
): SpicyToken[] {
  const tokens: SpicyToken[] = []
  for (const syllable of syllables) {
    const previous = tokens[tokens.length - 1]
    if (/^\s*$/u.test(syllable.text)) {
      if (previous && syllable.text.length > 0) previous.spaceAfter = true
      continue
    }
    if (previous && /^\s/u.test(syllable.text)) previous.spaceAfter = true
    if (!validWord(syllable.startTime, syllable.endTime)) continue
    const token = makeToken(syllable, simple, romanized, background)
    if (token.text.length === 0) continue
    if (/[\s,]$/u.test(syllable.text)) token.spaceAfter = true
    tokens.push(token)
  }
  return tokens
}

function dotLine(
  startTime: number,
  endTime: number,
  id: string,
  isDuet: boolean,
  rtl: boolean,
): SpicyLine {
  const base = (endTime - startTime) / 3
  const first = Math.max(startTime, startTime + base - INTERLUDE_PADDING / 3)
  const second = Math.max(first, startTime + base * 2 - (INTERLUDE_PADDING * 2) / 3)
  const third = Math.max(second, endTime - INTERLUDE_PADDING)
  const dot = (index: number, start: number, end: number): SpicyToken => ({
    id: `${id}-${index}`,
    text: '•',
    startTime: start,
    endTime: end,
    isBackground: false,
  })
  return {
    id,
    startTime,
    endTime,
    isLineSynced: false,
    isRtl: rtl,
    isBackground: false,
    isDuet,
    isDotLine: true,
    words: [dot(0, startTime, first), dot(1, first, second), dot(2, second, third)],
  }
}

/**
 * Lay Folk's lines out as Spicy renders them: each lead line, the background lines that follow
 * it (the lead's window grows to cover them, and they sit on its side), and an interlude of
 * three dots wherever the next lead starts at least three seconds after the last one ended.
 */
export function buildSpicyLines(source: LyricLine[], options: SpicyBuildOptions): SpicyLine[] {
  const { simple, romanized, forceLineSynced } = options
  const result: SpicyLine[] = []
  let lead: SpicyLine | undefined
  let previousLeadEnd: number | undefined

  const flushInterlude = (next: SpicyLine) => {
    if (previousLeadEnd === undefined) {
      if (next.startTime >= INTERLUDE_GAP)
        result.push(dotLine(0, next.startTime, 'spicy-leading-dot', next.isDuet, next.isRtl))
    } else if (next.startTime - previousLeadEnd >= INTERLUDE_GAP) {
      result.push(
        dotLine(previousLeadEnd, next.startTime, `spicy-dot-${next.id}`, next.isDuet, next.isRtl),
      )
    }
  }

  for (const line of source) {
    if (!validLine(line.startTime, line.endTime)) continue
    const background = line.background && !!lead
    const words = makeTokens(line.syllables, simple, romanized, background)
    const lineSynced = forceLineSynced || line.syllables.length === 0
    if (words.length === 0 && !lineSynced) continue
    const converted: SpicyLine = {
      id: line.id,
      startTime: line.startTime,
      endTime: line.endTime,
      isLineSynced: lineSynced,
      isRtl: isRtl(lineText(line, false)),
      text: lineText(line, romanized),
      isBackground: background,
      isDuet: background && lead ? lead.isDuet : line.duet,
      translation: line.translation || undefined,
      words,
    }
    if (background && lead) {
      lead.startTime = Math.min(lead.startTime, converted.startTime)
      lead.endTime = Math.max(lead.endTime, converted.endTime)
    } else {
      flushInterlude(converted)
      lead = converted
      previousLeadEnd = undefined
    }
    result.push(converted)
    previousLeadEnd = lead ? lead.endTime : converted.endTime
  }
  return result
}

export const keyFor = (line: SpicyLine, word: SpicyToken, index: number) =>
  `${line.id}:${word.id}:${index}`
