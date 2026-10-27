import type { LyricLine, LyricSyllable, Persist } from '@core/types'

import { usePrefStore } from '@states/stores'

import { ms2str } from '@utils/formatTime'

// Frontend TTML stringifier, following AMLL TTML Lyric Format
// Derived from: https://github.com/amll-dev/amll-ttml-tool , Licensed under GPLv3
// See also https://www.w3.org/TR/2018/REC-ttml1-20181108/

export interface TTMLStringifyOptions {
  /**
   * Write consecutive background lines together under one main line, and keep background lines
   * that have no main line before them (Spicy Lyrics style). Other players may not support it.
   * Defaults to the user's preference.
   */
  allowConsecutiveBackgroundLines?: boolean
}

export function stringifyTTML(
  ttmlLyric: Persist,
  options: TTMLStringifyOptions = {
    allowConsecutiveBackgroundLines: usePrefStore().allowConsecutiveBackgroundLines,
  },
): string {
  const lineArr = ttmlLyric.lines

  const doc = new Document()

  type AcceptAttrs = Record<string, string | number | undefined>
  type AcceptContent = string | Element[]
  function h(tag: string): Element
  function h(tag: string, attrs: AcceptAttrs, content?: AcceptContent): Element
  function h(tag: string, content: AcceptContent, attrs?: AcceptAttrs): Element
  function h(
    tag: string,
    arg1?: AcceptAttrs | AcceptContent,
    arg2?: AcceptAttrs | AcceptContent,
  ): Element {
    const isAttrs = (v: AcceptAttrs | AcceptContent | undefined): v is AcceptAttrs =>
      typeof v === 'object' && !Array.isArray(v)
    const isContent = (v: AcceptAttrs | AcceptContent | undefined): v is AcceptContent =>
      typeof v === 'string' || Array.isArray(v)
    const el = doc.createElement(tag)
    const content = isContent(arg1) ? arg1 : isContent(arg2) ? arg2 : undefined
    const attrs = isAttrs(arg1) ? arg1 : isAttrs(arg2) ? arg2 : undefined
    if (attrs)
      [...Object.entries(attrs)].reduce((el, [key, value]) => {
        if (value !== undefined) el.setAttribute(key, String(value))
        return el
      }, el)
    if (content)
      if (typeof content === 'string') el.appendChild(doc.createTextNode(content))
      else content.forEach((child) => el.appendChild(child))
    return el
  }

  const makeWordSpan = (word: LyricSyllable) =>
    h('span', word.text, {
      begin: ms2str(word.startTime),
      end: ms2str(word.endTime),
      'amll:empty-beat': word.placeholdingBeat || undefined,
      'amll:bookmarked': word.bookmarked ? 'true' : undefined,
    })

  const makeRomanizationSpan = (word: LyricSyllable) =>
    h('span', word.romanization, {
      begin: ms2str(word.startTime),
      end: ms2str(word.endTime),
    })

  const makeRootTT = (content: Element[]): Element =>
    h('tt', content, {
      xmlns: 'http://www.w3.org/ns/ttml',
      'xmlns:ttm': 'http://www.w3.org/ns/ttml#metadata',
      'xmlns:amll': 'http://www.example.com/ns/amll',
      'xmlns:itunes': 'http://music.apple.com/lyric-ttml-internal',
    })

  const makeLineTransSpan = (text: string): Element =>
    h('span', text, {
      'ttm:role': 'x-translation',
      'xml:lang': 'zh-CN',
    })

  const makeLineRomanSpan = (text: string): Element =>
    h('span', text, {
      'ttm:role': 'x-roman',
    })

  // Songwriters are written the way Apple Music, Spicy Lyrics and ttml-tool do it, inside
  // <iTunesMetadata>, so they are left out of the <amll:meta> list below.
  const SONGWRITERS_KEY = 'songwriters'
  const songwriters = (ttmlLyric.metadata[SONGWRITERS_KEY] ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

  function makeMetadataEl(extraChildren?: Element[]): Element {
    const hasDuet = lineArr.some((v) => v.duet)
    const agentChildren: Element[] = [h('ttm:agent', { type: 'person', 'xml:id': 'v1' })]
    if (hasDuet) agentChildren.push(h('ttm:agent', { type: 'other', 'xml:id': 'v2' }))
    const metadataEl = h('metadata', [
      ...agentChildren,
      ...[...Object.entries(ttmlLyric.metadata)]
        .filter(([key]) => key !== SONGWRITERS_KEY)
        .flatMap(([key, values]) => values.map((v) => h('amll:meta', { key, value: v }))),
      ...(extraChildren ?? []),
    ])
    return metadataEl
  }

  const docStartTime = lineArr[0]?.startTime ?? 0
  const docEndTime = lineArr.at(-1)?.endTime ?? 0

  const romanizationMap = new Map<string, { main: LyricSyllable[]; bg: LyricSyllable[] }>()

  const isWordLevelLyric = lineArr.some(
    (line) => line.syllables.filter((v) => v.text.trim()).length > 1,
  )

  // A main line and the background lines that go with it. With "allow consecutive and standalone
  // background vocals" on, one main line can carry several background lines, and a background
  // line that has no main line before it gets a group without a main line.
  interface LineGroup {
    main?: LyricLine
    backgrounds: LyricLine[]
  }
  const allowConsecutiveBackground = options.allowConsecutiveBackgroundLines ?? false
  const groupedLines: LineGroup[] = []
  for (const line of lineArr) {
    if (!line.background) {
      groupedLines.push({ main: line, backgrounds: [] })
      continue
    }
    const lastGroup = groupedLines.at(-1)
    if (allowConsecutiveBackground) {
      if (lastGroup) lastGroup.backgrounds.push(line)
      else groupedLines.push({ backgrounds: [line] })
    } else if (lastGroup?.main && !lastGroup.main.background && lastGroup.backgrounds.length === 0) {
      lastGroup.backgrounds.push(line)
    } else {
      // Not supported without the option: the extra background line is written as a main line
      groupedLines.push({ main: line, backgrounds: [] })
    }
  }

  function makeBackgroundSpan(bgLine: LyricLine): Element {
    const bgLineSpan = h('span', {
      'ttm:role': 'x-bg',
    })

    if (isWordLevelLyric) {
      let beginTime = Number.POSITIVE_INFINITY
      let endTime = 0

      const firstWordIndex = bgLine.syllables.findIndex((w) => w.text.trim().length > 0)
      const lastWordIndex = bgLine.syllables
        .map((w) => w.text.trim().length > 0)
        .lastIndexOf(true)

      for (const [sylIndex, word] of bgLine.syllables.entries()) {
        if (word.text.trim().length === 0) {
          bgLineSpan.appendChild(doc.createTextNode(word.text))
        } else {
          const span = makeWordSpan(word)

          if (sylIndex === firstWordIndex && span.firstChild) {
            span.firstChild.nodeValue = `(${span.firstChild.nodeValue}`
          }
          if (sylIndex === lastWordIndex && span.firstChild) {
            span.firstChild.nodeValue = `${span.firstChild.nodeValue})`
          }

          bgLineSpan.appendChild(span)
          beginTime = Math.min(beginTime, word.startTime)
          endTime = Math.max(endTime, word.endTime)
        }
      }
      bgLineSpan.setAttribute('begin', ms2str(beginTime))
      bgLineSpan.setAttribute('end', ms2str(endTime))
    } else {
      const word = bgLine.syllables[0]!
      bgLineSpan.appendChild(doc.createTextNode(`(${word.text})`))
      bgLineSpan.setAttribute('begin', ms2str(word.startTime))
      bgLineSpan.setAttribute('end', ms2str(word.endTime))
    }

    if (bgLine.translation) bgLineSpan.appendChild(makeLineTransSpan(bgLine.translation))
    if (bgLine.romanization) bgLineSpan.appendChild(makeLineRomanSpan(bgLine.romanization))
    return bgLineSpan
  }

  const lineEls: Element[] = []

  for (const [lineKey, lineGroup] of groupedLines.entries()) {
    const { main: line, backgrounds } = lineGroup
    // Group without a main line: the first background line stands in for it
    const lead = line ?? backgrounds[0]!

    const beginTime = line ? line.startTime : lead.startTime
    const endTime = line ? line.endTime : (backgrounds.at(-1)?.endTime ?? lead.endTime)

    const itunesKey = `L${lineKey}`
    const lineP = h('p', {
      begin: ms2str(beginTime ?? 0),
      end: ms2str(endTime),
      'ttm:agent': lead.duet ? 'v2' : 'v1',
      'itunes:key': itunesKey,
      'amll:connect-next': line?.connectNext ? 'true' : undefined,
      'amll:bookmarked': line?.bookmarked ? 'true' : undefined,
    })

    const mainWords = line ? line.syllables : []
    const bgWords = backgrounds.flatMap((bgLine) => bgLine.syllables)

    if (line) {
      if (isWordLevelLyric) {
        for (const word of line.syllables) {
          if (word.text.trim().length === 0) lineP.appendChild(doc.createTextNode(word.text))
          else lineP.appendChild(makeWordSpan(word))
        }
      } else {
        const word = line.syllables[0]!
        lineP.appendChild(doc.createTextNode(word.text))
        lineP.setAttribute('begin', ms2str(word.startTime))
        lineP.setAttribute('end', ms2str(word.endTime))
      }
    }

    for (const bgLine of backgrounds) lineP.appendChild(makeBackgroundSpan(bgLine))

    if (line?.translation) lineP.appendChild(makeLineTransSpan(line.translation))
    if (line?.romanization) lineP.appendChild(makeLineRomanSpan(line.romanization))

    if (
      mainWords.some((w) => w.romanization && w.romanization.trim().length > 0) ||
      bgWords.some((w) => w.romanization && w.romanization.trim().length > 0)
    ) {
      romanizationMap.set(itunesKey, { main: mainWords, bg: bgWords })
    }

    lineEls.push(lineP)
  }

  function makeTransliterationsEl(): Element {
    const transliterations = h('transliterations')
    const transliteration = h('transliteration')

    for (const [key, { main, bg }] of romanizationMap.entries()) {
      const textEl = h('text', { for: key })

      for (const word of main)
        if (word.romanization && word.romanization.trim().length > 0)
          textEl.appendChild(makeRomanizationSpan(word))
        else if (word.text.trim().length === 0 && textEl.hasChildNodes())
          textEl.appendChild(doc.createTextNode(word.text))

      const hasBgRoman = bg.some((w) => w.romanization && w.romanization.trim().length > 0)
      if (hasBgRoman) {
        const bgSpan = h('span', { 'ttm:role': 'x-bg' })

        const romanBgWords = bg.filter((w) => w.romanization && w.romanization.trim().length > 0)

        for (const [sylIndex, word] of romanBgWords.entries()) {
          const span = makeRomanizationSpan(word)

          if (sylIndex === 0 && span.firstChild)
            span.firstChild.nodeValue = `(${span.firstChild.nodeValue}`

          if (sylIndex === romanBgWords.length - 1 && span.firstChild)
            span.firstChild.nodeValue = `${span.firstChild.nodeValue})`

          bgSpan.appendChild(span)

          const originalIndex = bg.indexOf(word)
          if (originalIndex > -1 && originalIndex < bg.length - 1) {
            const nextWord = bg[originalIndex + 1]!
            if (nextWord && nextWord.text.trim().length === 0)
              bgSpan.appendChild(doc.createTextNode(nextWord.text))
          }
        }
        textEl.appendChild(bgSpan)
      }
      transliteration.appendChild(textEl)
    }

    transliterations.appendChild(transliteration)
    return transliterations
  }

  function makeItunesMetadataEls(): Element[] {
    if (!romanizationMap.size && songwriters.length === 0) return []
    const itunesMeta = h('iTunesMetadata', {
      xmlns: 'http://music.apple.com/lyric-ttml-internal',
    })
    if (romanizationMap.size) itunesMeta.appendChild(makeTransliterationsEl())
    if (songwriters.length > 0)
      itunesMeta.appendChild(
        h(
          'songwriters',
          songwriters.map((name) => h('songwriter', name)),
        ),
      )
    return [itunesMeta]
  }

  doc.appendChild(
    makeRootTT([
      h('head', [makeMetadataEl(makeItunesMetadataEls())]),
      h('body', { dur: ms2str(docEndTime) }, [
        h('div', { begin: ms2str(docStartTime), end: ms2str(docEndTime) }, lineEls),
      ]),
    ]),
  )

  return new XMLSerializer().serializeToString(doc)
}
