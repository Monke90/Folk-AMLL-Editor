import type { LyricLine, LyricSyllable } from '@core/types'

export interface CommentEntry {
  /** The word the comment is on, or `null` for a comment on the whole line */
  target: string | null
  text: string
}

/** Every comment on a line: its own, then the ones on its syllables */
export function commentsOfLine(line: LyricLine): CommentEntry[] {
  const entries: CommentEntry[] = []
  if (line.comment) entries.push({ target: null, text: line.comment })
  for (const syl of line.syllables)
    if (syl.comment) entries.push({ target: syl.text.trim(), text: syl.comment })
  return entries
}

/** The comment shared by all the items, or an empty string when they differ or have none */
export function sharedComment(items: Iterable<LyricLine | LyricSyllable>): string {
  let shared: string | null = null
  for (const item of items) {
    const comment = item.comment ?? ''
    if (shared === null) shared = comment
    else if (shared !== comment) return ''
  }
  return shared ?? ''
}

/** One line of plain text: comments live in XML attributes, which do not keep line breaks */
export const normalizeComment = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
