// Prepares raw lyrics for syllable timing.
// Derived from NaeNae-AMLL-TTML-TOOL (src/utils/lyric-prep.ts, src/modules/project/logic/text-to-lines.ts),
// licensed under AGPL-3.0. https://github.com/NaeNaeTart/NaeNae-AMLL-TTML-TOOL

const isCJKChar = (char: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)
const isAlphaNum = (char: string) => /[\p{L}\p{N}]/u.test(char)
const isLatinAlphaNum = (char: string) => /[\p{Script=Latin}\p{N}]/u.test(char)
const isComma = (char: string) => /[,，、]/u.test(char)

/** Marks word boundaries with a backslash and tidies punctuation / spacing */
function normalize(value: string) {
  const chars = Array.from(value)
  let processed = ''
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index]!
    if (char !== '-') {
      processed += char
      continue
    }
    const nextChar = chars[index + 1]
    if (nextChar === ' ') {
      processed += '— '
      index++
    } else if (nextChar === '-') {
      processed += '—'
      index++
    } else if (nextChar && index > 0 && isAlphaNum(chars[index - 1]!) && isAlphaNum(nextChar)) {
      // "la-la" -> "la-\la": split into two syllables after the hyphen
      processed += '-\\'
    } else {
      processed += '—'
    }
  }

  const processedChars = Array.from(processed)
  let cjkProcessed = ''
  for (let index = 0; index < processedChars.length; index++) {
    const char = processedChars[index]!
    const nextChar = processedChars[index + 1] ?? ''
    cjkProcessed += char
    if (
      (isCJKChar(char) && (isCJKChar(nextChar) || isLatinAlphaNum(nextChar))) ||
      (isLatinAlphaNum(char) && isCJKChar(nextChar)) ||
      (isComma(char) && (isCJKChar(nextChar) || isLatinAlphaNum(nextChar)))
    ) {
      cjkProcessed += '\\'
    }
  }
  return cjkProcessed
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+(?=[,.;:!?])/g, '')
    .trim()
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Turn one lyric line into the plain text import representation:
 * words separated by `\`, and text in parentheses moved to its own `<`-prefixed background line.
 */
export function prepareLyricLine(line: string, escapeSpaces = true) {
  const backgroundVocals: string[] = []
  let mainLine = ''
  let currentParen = ''
  let inParen = false

  for (const char of line.replace(/\[.*?\]/g, '').trim()) {
    if (['(', '（'].includes(char) && !inParen) {
      inParen = true
      currentParen = ''
    } else if ([')', '）'].includes(char) && inParen) {
      inParen = false
      backgroundVocals.push(currentParen.trim())
    } else if (inParen) {
      currentParen += char
    } else {
      mainLine += char
    }
  }

  const main = normalize(mainLine)
  const background = backgroundVocals.map(normalize).filter(Boolean).join(', ')
  const output = background
    ? main
      ? `${main}\n<${capitalizeFirst(background)}`
      : `<${capitalizeFirst(background)}`
    : main
  return escapeSpaces ? output.replace(/ /g, '\\ \\') : output
}

/** Process every line of a text. Section headers like `[Chorus]` are dropped unless kept on purpose. */
export function prepareTextImport(text: string, keepSectionHeaders = false): string {
  return text
    .split(/\r\n|\r|\n/)
    .flatMap((line) => {
      if (/^\[.*\]$/.test(line.trim())) return keepSectionHeaders ? [line.trim()] : []
      return prepareLyricLine(line).split('\n')
    })
    .filter((line) => line.trim().length > 0)
    .join('\n')
}
