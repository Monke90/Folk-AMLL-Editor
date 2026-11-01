/*
 * Adapted from the Spicy Lyrics renderer (AGPL-3.0-or-later).
 * Original project: https://github.com/Spikerko/Spicy-Lyrics
 */
import { findSpicyBlurAnchor } from './activeLine'
import { lineGlowSpline } from './curves'
import { progressAt, Spring, stateAt } from './math'
import type { SpicyLine } from './model'
import { keyFor } from './model'
import { createTokenAnimator } from './tokenAnimation'
export type SpringSet = {
  scale: Spring
  y: Spring
  glow: Spring
  opacity: Spring
}

type LineState = 'not-sung' | 'active' | 'sung'

interface AnimationContext {
  lines: SpicyLine[]
  simple: boolean
  lineNodes: Map<string, HTMLElement>
  wordNodes: Map<string, HTMLElement>
  springs: Map<string, SpringSet>
  lineGlowSprings: Map<string, Spring>
}

const settled = (set: SpringSet | undefined) =>
  !set ||
  (set.scale.isSettled() && set.y.isSettled() && set.glow.isSettled() && set.opacity.isSettled())

/** Spicy's blur step per row away from the active one, and its ceiling. */
const BLUR_STEP = 1.25
const BLUR_MAX = BLUR_STEP * 5.465
/** How far behind the playhead Spicy animates in Simple Lyrics mode, in ms. */
const SIMPLE_LYRICS_LAG = 33.5

export function createSpicyAnimator({
  lines,
  simple,
  lineNodes,
  wordNodes,
  springs,
  lineGlowSprings,
}: AnimationContext) {
  let lastNow = 0
  // Animation bookkeeping lives here, outside React, and is rebuilt with the
  // lines. Only active rows and rows whose springs are still settling after a
  // state change get word work; a long song's resting rows cost one state
  // comparison per frame.
  const lineStates: Array<LineState | undefined> = []
  const lineResting: boolean[] = []
  const blurValues: Array<string | undefined> = []
  // The line node each row was last drawn on, to spot rows that just mounted.
  const shownNodes: Array<HTMLElement | undefined> = []
  let blurAnchor = -1

  /** Keys of every word and held letter node in a line. */
  const nodeKeys = (line: SpicyLine) => {
    const keys: string[] = []
    for (let wi = 0; wi < line.words.length; wi++) {
      const word = line.words[wi]!
      const rootKey = keyFor(line, word, wi)
      keys.push(rootKey)
      if (word.letters)
        for (let index = 0; index < word.letters.length; index++)
          keys.push(
            `${rootKey}:${word.startTime + index * ((word.endTime - word.startTime) / word.letters.length)}`,
          )
    }
    return keys
  }

  const lineSettled = (line: SpicyLine) => {
    if (line.isLineSynced && !line.isDotLine) {
      const glow = lineGlowSprings.get(line.id)
      return !glow || glow.isSettled()
    }
    return nodeKeys(line).every((key) => settled(springs.get(key)))
  }

  const animateLineSynced = (
    line: SpicyLine,
    node: HTMLElement,
    status: LineState,
    time: number,
    snap: boolean,
    dt: number,
  ) => {
    const lineProgress =
      status === 'active'
        ? progressAt(time, line.startTime, line.endTime)
        : status === 'sung'
          ? 1
          : 0
    if (simple) {
      // The normal line renderer writes this variable inline. Pin it here
      // as well, otherwise switching into SLM leaves a stale mid-sweep
      // normal-mode value that the SLM stylesheet cannot override.
      node.style.setProperty('--line-gradient-position', '100%')
      node.style.setProperty('--line-shadow-alpha', '0')
      return
    }
    let glow = lineGlowSprings.get(line.id)
    if (!glow) {
      glow = new Spring(0, 1, 0.5)
      lineGlowSprings.set(line.id, glow)
    }
    glow.setGoal(lineGlowSpline.at(lineProgress), snap)
    const currentGlow = glow.step(dt)
    node.style.setProperty('--line-shadow-blur', `${4 + 8 * currentGlow}px`)
    node.style.setProperty('--line-shadow-alpha', String(currentGlow * 0.5))
    node.style.setProperty(
      '--line-gradient-position',
      `${status === 'active' ? lineProgress * 100 : status === 'sung' ? 100 : -20}%`,
    )
  }

  const animateWords = (
    line: SpicyLine,
    lineState: LineState,
    time: number,
    snap: boolean,
    dt: number,
  ) => {
    for (let wi = 0; wi < line.words.length; wi++) {
      const word = line.words[wi]!
      const rootKey = keyFor(line, word, wi)
      // Spicy's TimeSetter cascades the line state to every child when
      // the line itself is not active. This matters for adjusted held-word
      // timings near a line boundary.
      const wordState =
        lineState === 'active' ? stateAt(time, word.startTime, word.endTime) : lineState
      const progress =
        wordState === 'active'
          ? progressAt(time, word.startTime, word.endTime)
          : wordState === 'sung'
            ? 1
            : 0
      const { animateNode, animateHeldGroup, animateHeldLetters } = createTokenAnimator({
        springs,
        wordNodes,
        wordState,
        simple,
        snap,
        dt,
        time,
      })
      if (line.isDotLine) animateNode(rootKey, wordNodes.get(rootKey), progress, true)
      else if (word.letters) {
        animateHeldGroup(rootKey, wordNodes.get(rootKey), progress)
        animateHeldLetters(word, rootKey, wordState)
      } else animateNode(rootKey, wordNodes.get(rootKey), progress)
    }
  }

  const writeBlur = (index: number, node: HTMLElement, status: LineState) => {
    const distance = blurAnchor < 0 ? 0 : Math.abs(index - blurAnchor)
    const value =
      status === 'active' || distance === 0
        ? '0px'
        : `${Math.min(BLUR_STEP * distance, BLUR_MAX)}px`
    if (blurValues[index] === value) return
    blurValues[index] = value
    node.style.setProperty('--blur', value)
  }

  /** `timeMs` is the playhead; `snap` jumps every spring to its goal (paused or seeked). */
  const animate = (timeMs: number, now: number, snap: boolean) => {
    const dt = lastNow ? (now - lastNow) / 1000 : 0
    lastNow = now
    // Spicy draws Simple Lyrics mode 33.5ms behind the playhead; its
    // scrolling still follows the playhead itself.
    const time = timeMs - (simple ? SIMPLE_LYRICS_LAG : 0)
    const anchor = findSpicyBlurAnchor(lines, time, blurAnchor)
    const anchorMoved = anchor !== blurAnchor
    blurAnchor = anchor
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const status = stateAt(time, line.startTime, line.endTime)
      const changed = lineStates[i] !== status
      lineStates[i] = status
      const node = lineNodes.get(line.id)
      // Only rows near the viewport are mounted. The others keep their
      // state here and are drawn from it when they mount.
      if (!node) {
        shownNodes[i] = undefined
        continue
      }
      // A row that just mounted carries none of the animation state yet:
      // write all of it and snap its springs to where they belong.
      const mounted = shownNodes[i] !== node
      shownNodes[i] = node
      if (mounted) blurValues[i] = undefined
      const lineSnap = snap || mounted
      if (changed || mounted) node.dataset.state = status
      if (line.isDotLine) {
        const prehidden = String(status === 'not-sung' || time > line.endTime - 500)
        if (node.dataset.prehidden !== prehidden) node.dataset.prehidden = prehidden
      }
      if (changed || anchorMoved || lineSnap) writeBlur(i, node, status)
      if (changed || mounted) lineResting[i] = false
      if (status !== 'active' && !lineSnap && lineResting[i]) continue

      if (line.isLineSynced && !line.isDotLine)
        animateLineSynced(line, node, status, time, lineSnap, dt)
      else animateWords(line, status, time, lineSnap, dt)
      lineResting[i] = status !== 'active' && lineSettled(line)
    }
  }
  return animate
}
