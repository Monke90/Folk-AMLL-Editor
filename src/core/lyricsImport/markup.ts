// Reads the import text the way the importer does, to draw it as it is edited.
// Derived from spicylyrics/ttml-tool (src/components/LyricMarkupEditor/markup.ts, decorations.ts),
// licensed under AGPL-3.0. https://github.com/spicylyrics/ttml-tool
// Folk has no sections, so `[Header]` rows are only ever shown as removed.
import { SECTION_HEADER } from './importText'
import type { ImportTextFormat } from './types'

export type MarkupLineKind =
  | 'lyric'
  | 'background'
  | 'duet'
  | 'translation'
  | 'romanization'
  | 'removedHeader'
  | 'blank'

export type MarkupWarning =
  /** A translation or romanization row paired with an empty lyric row: it won't import */
  | 'dropped'
  | 'missingTranslation'
  | 'missingRomanization'

export type MarkupSpanType =
  /** Ordinary characters */
  | 'text'
  /** A background or duet prefix */
  | 'prefix'
  /** A `[Header]` */
  | 'header'
  /** A word separator between two syllables of one word */
  | 'split'
  /** A word separator next to a space; the space already ends the word */
  | 'spaceMark'
  /** The same-line separator before a translation or romanization */
  | 'subSeparator'
  /** A translation or romanization written on the lyric's own row */
  | 'subText'

export interface MarkupSpan {
  /** Offsets within the line. Spans tile the line with no gaps */
  from: number
  to: number
  type: MarkupSpanType
  /** For a subSeparator: what follows it */
  sub?: 'translation' | 'romanization'
}

export interface MarkupLine {
  kind: MarkupLineKind
  warning?: MarkupWarning
  spans: MarkupSpan[]
}

type SubKind = 'translation' | 'romanization'

const subKindsOf = (format: ImportTextFormat): SubKind[] => {
  const kinds: SubKind[] =
    format.mode === 'lyric-trans-roman'
      ? ['translation', 'romanization']
      : format.mode === 'lyric-trans'
        ? ['translation']
        : format.mode === 'lyric-roman'
          ? ['romanization']
          : []
  return format.swapTransAndRoman ? kinds.reverse() : kinds
}

const missingWarning = (sub: SubKind): MarkupWarning =>
  sub === 'translation' ? 'missingTranslation' : 'missingRomanization'

/** Spans for a run of lyric text: splits and space marks, the rest as text */
function bodySpans(line: string, from: number, to: number, separator: string): MarkupSpan[] {
  const spans: MarkupSpan[] = []
  const pushText = (start: number, end: number) => {
    if (end <= start) return
    const last = spans[spans.length - 1]
    if (last?.type === 'text' && last.to === start) last.to = end
    else spans.push({ from: start, to: end, type: 'text' })
  }
  if (!separator) {
    pushText(from, to)
    return spans
  }
  let index = from
  let textStart = from
  while (index < to) {
    if (line.startsWith(separator, index) && index + separator.length <= to) {
      pushText(textStart, index)
      const end = index + separator.length
      const before = line[index - 1]
      const after = line[end]
      const nearSpace =
        (before !== undefined && /\s/.test(before)) ||
        (after !== undefined && /\s/.test(after)) ||
        index === from ||
        end === to
      spans.push({ from: index, to: end, type: nearSpace ? 'spaceMark' : 'split' })
      index = end
      textStart = end
    } else index++
  }
  pushText(textStart, to)
  return spans
}

/** Spans for a lyric row: leading space, prefixes, body, and same-line parts */
function lyricSpans(
  line: string,
  format: ImportTextFormat,
  subs: SubKind[],
): { spans: MarkupSpan[]; kind: MarkupLineKind; missing?: SubKind } {
  const spans: MarkupSpan[] = []
  const lead = line.match(/^\s*/)?.[0].length ?? 0
  if (lead) spans.push({ from: 0, to: lead, type: 'text' })
  let index = lead
  let kind: MarkupLineKind = 'lyric'
  const prefixes = format.usePrefixes
    ? ([
        [format.bgPrefix, 'background'],
        [format.duetPrefix, 'duet'],
      ] as const)
    : []
  for (let found = true; found; ) {
    found = false
    for (const [prefix, prefixKind] of prefixes) {
      if (prefix && line.startsWith(prefix, index)) {
        spans.push({ from: index, to: index + prefix.length, type: 'prefix' })
        index += prefix.length
        if (kind === 'lyric') kind = prefixKind
        found = true
      }
    }
  }

  const sameLine =
    subs.length > 0 && format.layout === 'same-line-separator' && !!format.lineSeparator
  if (!sameLine) {
    spans.push(...bodySpans(line, index, line.length, format.wordSeparator))
    return { spans, kind }
  }
  const separator = format.lineSeparator
  const cut = line.indexOf(separator, index)
  const mainEnd = cut === -1 ? line.length : cut
  spans.push(...bodySpans(line, index, mainEnd, format.wordSeparator))
  let position = mainEnd
  let missing: SubKind | undefined
  for (const sub of subs) {
    if (position >= line.length || !line.startsWith(separator, position)) {
      missing ??= sub
      continue
    }
    spans.push({ from: position, to: position + separator.length, type: 'subSeparator', sub })
    position += separator.length
    const next = line.indexOf(separator, position)
    const end = next === -1 || sub === subs[subs.length - 1] ? line.length : next
    if (end > position) spans.push({ from: position, to: end, type: 'subText' })
    if (!line.slice(position, end).trim()) missing ??= sub
    position = end
  }
  if (position < line.length) spans.push({ from: position, to: line.length, type: 'subText' })
  return { spans, kind, missing }
}

const wholeLine = (line: string, type: MarkupSpanType = 'text'): MarkupSpan[] =>
  line ? [{ from: 0, to: line.length, type }] : []

/**
 * Read lyric markup into one entry per line, the same way the importer pairs
 * rows. The text itself is never changed; this only describes it.
 */
export function parseMarkup(text: string, format: ImportTextFormat): MarkupLine[] {
  const rows = text.split(/\r\n|\r|\n/)
  const subs = subKindsOf(format)
  const interleaved = format.layout !== 'same-line-separator'
  const result: MarkupLine[] = []

  for (let index = 0; index < rows.length; ) {
    const row = rows[index++]!
    const trimmed = row.trim()
    if (SECTION_HEADER.test(trimmed)) {
      const start = row.indexOf('[')
      const end = start + trimmed.length
      const spans: MarkupSpan[] = []
      if (start > 0) spans.push({ from: 0, to: start, type: 'text' })
      spans.push({ from: start, to: end, type: 'header' })
      if (end < row.length) spans.push({ from: end, to: row.length, type: 'text' })
      result.push({ kind: 'removedHeader', spans })
      continue
    }

    const subRows = interleaved ? subs.slice(0, rows.length - index) : []
    if (!trimmed) {
      result.push({ kind: 'blank', spans: wholeLine(row) })
      for (const sub of subRows) {
        const subRow = rows[index++]!
        result.push(
          subRow.trim()
            ? { kind: sub, warning: 'dropped', spans: wholeLine(subRow) }
            : { kind: 'blank', spans: wholeLine(subRow) },
        )
      }
      continue
    }

    const { spans, kind, missing } = lyricSpans(row, format, subs)
    result.push({ kind, spans, ...(missing ? { warning: missingWarning(missing) } : {}) })
    for (const sub of subRows) {
      const subRow = rows[index++]!
      result.push({
        kind: sub,
        spans: wholeLine(subRow),
        ...(subRow.trim() ? {} : { warning: missingWarning(sub) }),
      })
    }
    // The text ended before this lyric's sub rows did
    for (const sub of subs.slice(subRows.length)) {
      if (!interleaved) break
      const last = result[result.length - 1]!
      last.warning ??= missingWarning(sub)
    }
  }
  return result
}

/**
 * What to draw, as plain data so it can be tested without an editor.
 * Positions are document offsets, in order.
 */
export type DecorationSpec =
  | { type: 'line'; from: number; className: string }
  | { type: 'hide'; from: number; to: number }
  | { type: 'dot'; from: number; to: number }
  | { type: 'subLabel'; from: number; to: number; sub: 'translation' | 'romanization' }

export const LINE_CLASS: Partial<Record<MarkupLineKind, string>> = {
  background: 'lm-background',
  duet: 'lm-duet',
  translation: 'lm-sub',
  romanization: 'lm-sub',
  removedHeader: 'lm-removed',
}

/**
 * Decorations for the given lines. Lines in `revealed` (the ones the cursor or
 * selection touches) show their raw symbols, so only their line style is drawn.
 */
export function buildDecorationSpecs(
  lines: MarkupLine[],
  lineStarts: number[],
  revealed: ReadonlySet<number>,
  lineNumbers: Iterable<number>,
): DecorationSpec[] {
  const specs: DecorationSpec[] = []
  for (const number of lineNumbers) {
    const line = lines[number]
    const start = lineStarts[number]
    if (!line || start === undefined) continue
    const classes = [LINE_CLASS[line.kind], line.warning && 'lm-warning']
      .filter(Boolean)
      .join(' ')
    if (classes) specs.push({ type: 'line', from: start, className: classes })
    if (revealed.has(number)) continue
    for (const span of line.spans) {
      const from = start + span.from
      const to = start + span.to
      if (span.type === 'prefix' || span.type === 'spaceMark') {
        specs.push({ type: 'hide', from, to })
      } else if (span.type === 'split') {
        specs.push({ type: 'dot', from, to })
      } else if (span.type === 'subSeparator' && span.sub) {
        specs.push({ type: 'subLabel', from, to, sub: span.sub })
      }
    }
  }
  return specs
}
