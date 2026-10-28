import type { Syllabify as SL } from '..'
import { splitTextByIndices } from '../shared'

const pureLatin = `0-9A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF\\u0300-\\u036F`
const halfwidthPunc = `'"‘’“”.,\\-/#!?¿¡$%^&*;:{}=\\-_\`~()`
const frontAssocPunc = `，。？！；：）】］｝〉》」』〗］）»`
const backAssocPunc = `（【［｛〈《「『〖〔［（«`

function basicSplitCore(strs: string[]): string[][] {
  const latin = pureLatin + halfwidthPunc
  const tokenReg = new RegExp(`[${latin}]+|\\s+|[^${latin}]`, 'gu')
  return strs.map((str) => str.match(tokenReg) || [])
}

const apostrophes = `'’`
/** Opening brackets and quotes, which belong to the word that follows them */
const openingPunc = `([{<“‘«¿¡「『（【《〈〔｢`

export interface BasicSplitOptions {
  /**
   * Keep a hyphen at the end of the piece before it, the way Spicy Lyrics does:
   * `so-so-so-so` becomes `so-`, `so-`, `so-`, `so`. Without it the hyphen leads the
   * next piece (`so`, `-so`, `-so`, `-so`).
   */
  trailingHyphen?: boolean
  /** Treat apostrophes as part of the word, so `don't` reaches the splitter whole */
  apostrophesInWords?: boolean
}

export function basicSplit(
  strs: string[],
  rewrites: Readonly<SL.Rewrite>[],
  caseSensitive: boolean,
  splitter?: (s: string) => string[],
  options: BasicSplitOptions = {},
): string[][] {
  const { trailingHyphen = false, apostrophesInWords = false } = options
  const wordChars = apostrophesInWords ? pureLatin + apostrophes : pureLatin
  const tokenReg = new RegExp(`[${wordChars}]+|[^${wordChars}]+`, 'gu')
  const pureLatinReg = new RegExp(`[${pureLatin}]`)
  const isLatin = (s: string) => pureLatinReg.test(s)
  const isFrontAssocPunc = (s: string) => s.length === 1 && frontAssocPunc.includes(s)
  const isBackAssocPunc = (s: string) => s.length === 1 && backAssocPunc.includes(s)
  const rewriteMap = new Map<string, number[]>()
  for (const rw of rewrites) {
    const key = caseSensitive ? rw.target : rw.target.toLowerCase()
    rewriteMap.set(key, rw.indices)
  }
  return basicSplitCore(strs)
    .map((lineParts) =>
      lineParts.flatMap((part) => {
        const split = part.match(tokenReg) || []
        const partResult: string[] = []
        /** The last piece ended with a hyphen, so the next word starts a new piece */
        let afterHyphen = false
        for (const token of split) {
          const stickToLast = () => {
            if (partResult.length) {
              partResult[partResult.length - 1] += token
            } else partResult.push(token)
          }
          const handleSubparts = (subParts: string[]) => {
            if (subParts.length === 0) stickToLast()
            else {
              if (partResult.length && !afterHyphen)
                partResult[partResult.length - 1] += subParts.shift()!
              else partResult.push(subParts.shift()!)
              partResult.push(...subParts)
            }
            afterHyphen = false
          }
          if (!isLatin(token)) {
            if (trailingHyphen) {
              // Hyphens stay with the word before them; opening brackets go with the next one
              for (const run of token.match(/-+|[^-]+/g) || []) {
                if (run[0] === '-') {
                  if (partResult.length) {
                    partResult[partResult.length - 1] += run
                    afterHyphen = true
                  } else partResult.push(run)
                } else if (afterHyphen && openingPunc.includes(run[0]!)) {
                  partResult.push(run)
                  afterHyphen = false
                } else if (partResult.length) {
                  partResult[partResult.length - 1] += run
                } else partResult.push(run)
              }
            } else if (token === '-') partResult.push(token)
            else stickToLast()
            continue
          }
          const key = caseSensitive ? token : token.toLowerCase()
          if (rewriteMap.has(key)) {
            const indices = rewriteMap.get(key)!
            const subParts = splitTextByIndices(token, indices)
            handleSubparts(subParts)
            continue
          }
          if (splitter) {
            const subParts = splitter(token)
            handleSubparts([...subParts])
            continue
          }
          handleSubparts([token])
        }
        return partResult
      }),
    )
    .map((line: string[]): string[] => {
      const merged: string[] = []
      let shouldMergeToLast = false
      const mergeToLast = (s: string) =>
        merged.length ? (merged[merged.length - 1] += s) : merged.push(s)
      for (const token of line) {
        if (isFrontAssocPunc(token)) {
          mergeToLast(token)
        } else if (isBackAssocPunc(token)) {
          shouldMergeToLast = true
          merged.push(token)
        } else {
          if (shouldMergeToLast) mergeToLast(token)
          else merged.push(token)
          shouldMergeToLast = false
        }
      }
      return merged
    })
}
