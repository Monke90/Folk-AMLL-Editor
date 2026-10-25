/*
 * Syllable-block timeline logic for the spectrogram.
 *
 * Ported from spicylyrics/ttml-tool (AGPL-3.0):
 *   src/modules/spectrogram/utils/timeline-mutations.ts
 *   src/modules/segmentation/utils/segment-processing.ts
 * which derives from AMLL TTML Tool, Copyright 2023-2025 Steve Xiao and contributors.
 * Alt-drag gap preview/direction handling there is itself adapted from apoint123's upstream
 * (ecd0594f, GPLv3).
 *
 * Kept deliberately free of Vue/Pinia so the maths can be tested on its own.
 */
import type { LyricLine } from '@core/types'

/** Shortest a word may be shrunk to by a divider or pan drag. */
export const MIN_WORD_DURATION_MS = 10
/** Divider drags snap to a target when it is closer than this many pixels. */
export const SNAP_THRESHOLD_PX = 7

export interface WordSegment {
  type: 'word'
  /** Id of the syllable this segment mirrors */
  id: string
  text: string
  romanization: string
  startTime: number
  endTime: number
}

export interface GapSegment {
  type: 'gap'
  id: string
  startTime: number
  endTime: number
}

export type ProcessedSegment = WordSegment | GapSegment

/** A line split into timed words and the empty gaps between them */
export interface ProcessedLine {
  id: string
  /** The live line this was built from; only written to by {@link commitProcessedLine} */
  line: LyricLine
  startTime: number
  endTime: number
  segments: ProcessedSegment[]
}

export function processLine(line: LyricLine): ProcessedLine {
  const words: WordSegment[] = line.syllables
    .filter((syl) => syl.text.trim() !== '' && syl.endTime > syl.startTime)
    .map((syl) => ({
      type: 'word' as const,
      id: syl.id,
      text: syl.text,
      romanization: syl.romanization,
      startTime: syl.startTime,
      endTime: syl.endTime,
    }))
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime)

  const segments: ProcessedSegment[] = []
  let cursor = line.startTime
  for (const word of words) {
    if (word.startTime > cursor) {
      segments.push({
        type: 'gap',
        id: `${line.id}-gap-${cursor}`,
        startTime: cursor,
        endTime: word.startTime,
      })
    }
    segments.push(word)
    cursor = word.endTime
  }
  if (line.endTime > cursor) {
    segments.push({
      type: 'gap',
      id: `${line.id}-gap-end`,
      startTime: cursor,
      endTime: line.endTime,
    })
  }

  return { id: line.id, line, startTime: line.startTime, endTime: line.endTime, segments }
}

/** Returns the closest target within the threshold, or the time unchanged */
export function snapToTargets(
  timeMs: number,
  zoom: number,
  targetsMs: readonly number[],
  thresholdPx = SNAP_THRESHOLD_PX,
): number {
  let closest: number | null = null
  let minDistancePx = thresholdPx
  const timePx = (timeMs / 1000) * zoom
  for (const target of targetsMs) {
    const distancePx = Math.abs(timePx - (target / 1000) * zoom)
    if (distancePx < minDistancePx) {
      minDistancePx = distancePx
      closest = target
    }
  }
  return closest ?? timeMs
}

/**
 * @param segmentIndex index of the segment left of the divider; `-1` is the line start
 * @param isGapCreation Alt-drag: turn the movement into a gap between two words
 * @param lockedGapDirection direction an Alt-drag is committed to once it has moved a little
 */
export function getUpdatedLineForDivider(
  originalLine: ProcessedLine,
  segmentIndex: number,
  newTime: number,
  isGapCreation: boolean,
  lockedGapDirection?: 'left' | 'right' | null,
): ProcessedLine {
  const segments = [...originalLine.segments]
  let newStartTime = originalLine.startTime
  let newEndTime = originalLine.endTime

  const leftSegment = segments[segmentIndex] ?? null
  const rightSegment = segments[segmentIndex + 1] ?? null

  const minTime =
    leftSegment && leftSegment.type === 'word'
      ? leftSegment.startTime + MIN_WORD_DURATION_MS
      : leftSegment
        ? leftSegment.startTime
        : 0

  const maxTime =
    rightSegment && rightSegment.type === 'word'
      ? rightSegment.endTime - MIN_WORD_DURATION_MS
      : rightSegment
        ? rightSegment.endTime
        : Infinity

  let clampedTime = newTime
  if (minTime <= maxTime) {
    clampedTime = Math.max(minTime, clampedTime)
    clampedTime = Math.min(maxTime, clampedTime)
  }
  clampedTime = Math.max(0, clampedTime)

  const newSegments = [...segments]

  if (segmentIndex === -1) {
    if (rightSegment && rightSegment.type === 'word') {
      clampedTime = Math.min(clampedTime, rightSegment.endTime - MIN_WORD_DURATION_MS)
    }
    newStartTime = clampedTime
    if (rightSegment) newSegments[segmentIndex + 1] = { ...rightSegment, startTime: clampedTime }
  } else if (segmentIndex === segments.length - 1) {
    if (leftSegment && leftSegment.type === 'word') {
      clampedTime = Math.max(clampedTime, leftSegment.startTime + MIN_WORD_DURATION_MS)
    }
    newEndTime = clampedTime
    if (leftSegment) newSegments[segmentIndex] = { ...leftSegment, endTime: clampedTime }
  } else if (leftSegment && rightSegment) {
    const originalTime = leftSegment.endTime
    if (isGapCreation && leftSegment.type === 'word' && rightSegment.type === 'word') {
      if (lockedGapDirection === 'right') clampedTime = Math.max(originalTime, clampedTime)
      else if (lockedGapDirection === 'left') clampedTime = Math.min(originalTime, clampedTime)

      if (clampedTime > originalTime) {
        newSegments[segmentIndex + 1] = { ...rightSegment, startTime: clampedTime }
        newSegments.splice(segmentIndex + 1, 0, {
          type: 'gap',
          id: `preview-gap-${leftSegment.id}`,
          startTime: originalTime,
          endTime: clampedTime,
        })
      } else if (clampedTime < originalTime) {
        newSegments[segmentIndex] = { ...leftSegment, endTime: clampedTime }
        newSegments.splice(segmentIndex + 1, 0, {
          type: 'gap',
          id: `preview-gap-${leftSegment.id}`,
          startTime: clampedTime,
          endTime: originalTime,
        })
      }
    } else {
      newSegments[segmentIndex] = { ...leftSegment, endTime: clampedTime }
      newSegments[segmentIndex + 1] = { ...rightSegment, startTime: clampedTime }
    }
  }

  return { ...originalLine, startTime: newStartTime, endTime: newEndTime, segments: newSegments }
}

/** Moves one word, pushing the edges of its neighbours along with it */
export function getUpdatedLineForWordPan(
  line: ProcessedLine,
  wordId: string,
  desiredNewStartMS: number,
): ProcessedLine {
  const segmentIndex = line.segments.findIndex((s) => s.id === wordId)
  if (segmentIndex === -1) return line

  const segment = line.segments[segmentIndex]
  if (!segment || segment.type !== 'word') return line

  const leftSegment = line.segments[segmentIndex - 1] ?? null
  const rightSegment = line.segments[segmentIndex + 1] ?? null

  const wordDurationMS = segment.endTime - segment.startTime

  let minStartMS: number
  if (!leftSegment) minStartMS = line.startTime
  else if (leftSegment.type === 'gap') minStartMS = leftSegment.startTime
  else minStartMS = leftSegment.startTime + MIN_WORD_DURATION_MS

  let maxStartMS: number
  if (!rightSegment) maxStartMS = line.endTime - wordDurationMS
  else if (rightSegment.type === 'gap') maxStartMS = rightSegment.endTime - wordDurationMS
  else maxStartMS = rightSegment.endTime - MIN_WORD_DURATION_MS - wordDurationMS

  if (minStartMS > maxStartMS) minStartMS = Math.min(minStartMS, maxStartMS)

  let newStartMS = Math.max(minStartMS, desiredNewStartMS)
  newStartMS = Math.min(maxStartMS, newStartMS)
  const newEndMS = newStartMS + wordDurationMS

  if (Math.round(newStartMS) === Math.round(segment.startTime)) return line

  const newSegments = [...line.segments]
  newSegments[segmentIndex] = { ...segment, startTime: newStartMS, endTime: newEndMS }
  if (leftSegment) newSegments[segmentIndex - 1] = { ...leftSegment, endTime: newStartMS }
  if (rightSegment) newSegments[segmentIndex + 1] = { ...rightSegment, startTime: newEndMS }

  return { ...line, segments: newSegments }
}

/** Moves a whole line, keeping the spacing of everything in it */
export function getUpdatedLineForLinePan(line: ProcessedLine, newStartMS: number): ProcessedLine {
  newStartMS = Math.max(0, newStartMS)
  const deltaMS = newStartMS - line.startTime
  if (Math.round(deltaMS) === 0) return line

  return {
    ...line,
    startTime: newStartMS,
    endTime: line.endTime + deltaMS,
    segments: line.segments.map((segment) => ({
      ...segment,
      startTime: segment.startTime + deltaMS,
      endTime: segment.endTime + deltaMS,
    })),
  }
}

/**
 * Writes an edited line back into the live lyric data. Times are rounded here because the
 * pan drags work in fractional milliseconds. Gap segments are only a preview and are dropped.
 */
export function commitProcessedLine(updated: ProcessedLine) {
  const words = new Map<string, WordSegment>()
  for (const segment of updated.segments) if (segment.type === 'word') words.set(segment.id, segment)

  for (const syl of updated.line.syllables) {
    const word = words.get(syl.id)
    if (!word) continue
    syl.startTime = Math.round(word.startTime)
    syl.endTime = Math.round(word.endTime)
  }
  updated.line.startTime = Math.round(updated.startTime)
  updated.line.endTime = Math.round(updated.endTime)
}
