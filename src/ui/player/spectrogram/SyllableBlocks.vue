<template>
  <div
    class="syl-blocks-layer"
    v-if="prefStore.spectrogramShowSyllableBlocks"
    :style="{ height: `${ctx.displayHeight.value}px` }"
  >
    <div
      v-for="entry in visibleEntries"
      :key="entry.syl.id"
      class="syl-block"
      :class="{
        selected: runtimeStore.selectedSyllables.has(entry.syl),
        active: isActiveSyl(entry.syl),
        'line-alt': entry.lineIndex % 2 === 1,
        dragging: draggingKey === entry.syl.id,
      }"
      :style="blockStyle(entry.syl)"
      :title="entry.syl.text"
      @mousedown.stop="handleBlockMouseDown($event, entry.line, entry.syl)"
    >
      <span class="syl-block-text">{{ entry.syl.text }}</span>
    </div>

    <div
      v-for="h in visibleHandles"
      :key="h.key"
      class="syl-block-handle"
      :class="{ dragging: draggingKey === h.key }"
      :style="{ left: `${h.x}px` }"
      @mousedown.stop="handleHandleMouseDown($event, h)"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

import { audioEngine } from '@core/audio'
import { useSpectrogramContext } from '@core/spectrogram/SpectrogramContext'
import type { LyricLine, LyricSyllable } from '@core/types'

import { useCoreStore, usePrefStore, useRuntimeStore } from '@states/stores'

const ctx = useSpectrogramContext()
const coreStore = useCoreStore()
const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()

const MIN_DURATION_MS = 30
const SNAP_PX = 8
const TOUCH_EPS_MS = 1

function textSyls(line: LyricLine): LyricSyllable[] {
  return line.syllables.filter((s) => s.text.trim())
}

const scopeLines = computed<LyricLine[]>(() => {
  if (prefStore.spectrogramBlockScope === 'all') return coreStore.lyricLines
  const line = runtimeStore.getFirstSelectedLine()
  return line ? [line] : []
})

interface BlockEntry {
  line: LyricLine
  lineIndex: number
  syl: LyricSyllable
}

function inView(startMs: number, endMs: number, bufferedStart: number, bufferedEnd: number) {
  return endMs >= bufferedStart && startMs <= bufferedEnd
}

const visibleEntries = computed<BlockEntry[]>(() => {
  if (!prefStore.spectrogramShowSyllableBlocks) return []
  const bufferMs = 1000
  const startMs = ctx.viewStartTime.value * 1000 - bufferMs
  const endMs = ctx.viewEndTime.value * 1000 + bufferMs
  const entries: BlockEntry[] = []
  for (const line of scopeLines.value) {
    const lineIndex = coreStore.lyricLines.indexOf(line)
    for (const syl of textSyls(line)) {
      if (!inView(syl.startTime, syl.endTime, startMs, endMs)) continue
      entries.push({ line, lineIndex, syl })
    }
  }
  return entries
})

interface HandleEntry {
  key: string
  x: number
  kind: 'boundary' | 'edge-start' | 'edge-end'
  line: LyricLine
  leftSyl: LyricSyllable | null
  rightSyl: LyricSyllable | null
}

const visibleHandles = computed<HandleEntry[]>(() => {
  if (!prefStore.spectrogramShowSyllableBlocks) return []
  const bufferMs = 1000
  const startMs = ctx.viewStartTime.value * 1000 - bufferMs
  const endMs = ctx.viewEndTime.value * 1000 + bufferMs
  const handles: HandleEntry[] = []
  for (const line of scopeLines.value) {
    const syls = textSyls(line)
    for (let i = 0; i <= syls.length; i++) {
      const left = i > 0 ? syls[i - 1]! : null
      const right = i < syls.length ? syls[i]! : null
      const posMs = right ? right.startTime : left ? left.endTime : null
      if (posMs === null || posMs < startMs || posMs > endMs) continue
      if (left && right) {
        const touching = Math.abs(left.endTime - right.startTime) <= TOUCH_EPS_MS
        if (touching) {
          handles.push({
            key: `b-${left.id}-${right.id}`,
            x: msToPx(left.endTime),
            kind: 'boundary',
            line,
            leftSyl: left,
            rightSyl: right,
          })
        } else {
          handles.push({
            key: `${left.id}-end`,
            x: msToPx(left.endTime),
            kind: 'edge-end',
            line,
            leftSyl: left,
            rightSyl: null,
          })
          handles.push({
            key: `${right.id}-start`,
            x: msToPx(right.startTime),
            kind: 'edge-start',
            line,
            leftSyl: null,
            rightSyl: right,
          })
        }
      } else if (!left && right) {
        handles.push({
          key: `${right.id}-start`,
          x: msToPx(right.startTime),
          kind: 'edge-start',
          line,
          leftSyl: null,
          rightSyl: right,
        })
      } else if (left && !right) {
        handles.push({
          key: `${left.id}-end`,
          x: msToPx(left.endTime),
          kind: 'edge-end',
          line,
          leftSyl: left,
          rightSyl: null,
        })
      }
    }
  }
  return handles
})

function isActiveSyl(syl: LyricSyllable) {
  return (
    Boolean(syl.startTime || syl.endTime) &&
    audioEngine.amendedProgressComputed.value >= syl.startTime &&
    audioEngine.amendedProgressComputed.value <= syl.endTime
  )
}

function msToPx(ms: number) {
  return (ms / 1000) * ctx.zoom.value - ctx.scrollLeft.value
}

function blockStyle(syl: LyricSyllable) {
  const left = msToPx(syl.startTime)
  // 稍微多渲染 1px 宽度，盖住相邻方块之间因子像素取整产生的发丝间隙
  const width = Math.max(3, msToPx(syl.endTime) - left) + 1
  return { left: `${left}px`, width: `${width}px` }
}

function snapMs() {
  return ctx.zoom.value > 0 ? (SNAP_PX / ctx.zoom.value) * 1000 : 0
}

function syncLineBounds(line: LyricLine) {
  const firstTimed = line.syllables.find((s) => s.text.trim())
  const lastTimed = [...line.syllables].reverse().find((s) => s.text.trim())
  if (firstTimed) line.startTime = firstTimed.startTime
  if (lastTimed) line.endTime = lastTimed.endTime
}

type DragMode = 'move' | 'boundary' | 'edge-start' | 'edge-end'

interface DragState {
  mode: DragMode
  key: string
  line: LyricLine
  syl?: LyricSyllable
  leftSyl?: LyricSyllable
  rightSyl?: LyricSyllable
  neighborLeft?: LyricSyllable | null
  neighborRight?: LyricSyllable | null
  startClientX: number
  origTimes: Map<string, { start: number; end: number }>
}

let drag: DragState | null = null
const draggingKey = ref<string | null>(null)

function snapshotTimes(...syls: (LyricSyllable | null | undefined)[]) {
  const map = new Map<string, { start: number; end: number }>()
  for (const s of syls) {
    if (s) map.set(s.id, { start: s.startTime, end: s.endTime })
  }
  return map
}

function handleBlockMouseDown(e: MouseEvent, line: LyricLine, syl: LyricSyllable) {
  if (e.button !== 0) return
  e.preventDefault()
  runtimeStore.selectLineSyl(line, syl)

  const syls = textSyls(line)
  const idx = syls.indexOf(syl)
  const neighborLeft = idx > 0 ? syls[idx - 1]! : null
  const neighborRight = idx < syls.length - 1 ? syls[idx + 1]! : null

  drag = {
    mode: 'move',
    key: syl.id,
    line,
    syl,
    neighborLeft,
    neighborRight,
    startClientX: e.clientX,
    origTimes: snapshotTimes(syl, neighborLeft, neighborRight),
  }
  draggingKey.value = syl.id
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleHandleMouseDown(e: MouseEvent, h: HandleEntry) {
  if (e.button !== 0) return
  e.preventDefault()
  runtimeStore.selectLineSyl(h.line, h.leftSyl ?? h.rightSyl!)

  if (h.kind === 'boundary') {
    drag = {
      mode: 'boundary',
      key: h.key,
      line: h.line,
      leftSyl: h.leftSyl!,
      rightSyl: h.rightSyl!,
      startClientX: e.clientX,
      origTimes: snapshotTimes(h.leftSyl, h.rightSyl),
    }
  } else {
    const syl = (h.kind === 'edge-end' ? h.leftSyl : h.rightSyl)!
    drag = {
      mode: h.kind,
      key: h.key,
      line: h.line,
      syl,
      neighborLeft: h.kind === 'edge-start' ? null : undefined,
      neighborRight: h.kind === 'edge-end' ? null : undefined,
      startClientX: e.clientX,
      origTimes: snapshotTimes(syl),
    }
  }
  draggingKey.value = h.key
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function liveNeighbors(line: LyricLine, syl: LyricSyllable) {
  const syls = textSyls(line)
  const idx = syls.indexOf(syl)
  return {
    prev: idx > 0 ? syls[idx - 1]! : null,
    next: idx < syls.length - 1 ? syls[idx + 1]! : null,
  }
}

function handleDragMove(e: MouseEvent) {
  if (!drag || ctx.zoom.value <= 0) return
  const deltaPx = e.clientX - drag.startClientX
  const deltaMs = (deltaPx / ctx.zoom.value) * 1000
  const durationMs = ctx.duration.value * 1000
  const snap = snapMs()

  if (drag.mode === 'move') {
    const { line, syl } = drag
    const orig = drag.origTimes.get(syl!.id)!
    const { prev, next } = liveNeighbors(line, syl!)
    const prevOrig = drag.origTimes.get(prev?.id ?? '')
    const nextOrig = drag.origTimes.get(next?.id ?? '')
    const prevTouching = prev && prevOrig ? Math.abs(prevOrig.end - orig.start) <= TOUCH_EPS_MS : false
    const nextTouching = next && nextOrig ? Math.abs(orig.end - nextOrig.start) <= TOUCH_EPS_MS : false

    let lowerDelta = -Infinity
    let upperDelta = Infinity
    if (prev) {
      if (prevTouching && prevOrig) lowerDelta = prevOrig.start + MIN_DURATION_MS - orig.start
      else lowerDelta = prev.endTime - orig.start
    } else {
      lowerDelta = -orig.start
    }
    if (next) {
      if (nextTouching && nextOrig) upperDelta = nextOrig.end - MIN_DURATION_MS - orig.end
      else upperDelta = next.startTime - orig.end
    } else {
      upperDelta = durationMs - orig.end
    }

    const d = Math.max(lowerDelta, Math.min(deltaMs, upperDelta))
    const newStart = Math.round(orig.start + d)
    const newEnd = Math.round(orig.end + d)
    syl!.startTime = newStart
    syl!.endTime = newEnd
    if (prevTouching && prev) prev.endTime = newStart
    if (nextTouching && next) next.startTime = newEnd

    syncLineBounds(line)
  } else if (drag.mode === 'boundary') {
    const { line, leftSyl, rightSyl } = drag
    const leftOrig = drag.origTimes.get(leftSyl!.id)!
    const rightOrig = drag.origTimes.get(rightSyl!.id)!
    let newBoundary = leftOrig.end + deltaMs
    const minBoundary = leftOrig.start + MIN_DURATION_MS
    const maxBoundary = rightOrig.end - MIN_DURATION_MS
    newBoundary = Math.round(Math.max(minBoundary, Math.min(newBoundary, maxBoundary)))
    leftSyl!.endTime = newBoundary
    rightSyl!.startTime = newBoundary
    syncLineBounds(line)
  } else if (drag.mode === 'edge-start') {
    const { line, syl } = drag
    const orig = drag.origTimes.get(syl!.id)!
    const { prev } = liveNeighbors(line, syl!)
    let newStart = orig.start + deltaMs
    const lowerBound = prev ? prev.endTime : 0
    newStart = Math.max(lowerBound, Math.min(newStart, orig.end - MIN_DURATION_MS))
    if (prev && newStart - prev.endTime < snap) newStart = prev.endTime
    syl!.startTime = Math.round(newStart)
    syncLineBounds(line)
  } else if (drag.mode === 'edge-end') {
    const { line, syl } = drag
    const orig = drag.origTimes.get(syl!.id)!
    const { next } = liveNeighbors(line, syl!)
    let newEnd = orig.end + deltaMs
    const upperBound = next ? next.startTime : durationMs
    newEnd = Math.min(upperBound, Math.max(newEnd, orig.start + MIN_DURATION_MS))
    if (next && next.startTime - newEnd < snap) newEnd = next.startTime
    syl!.endTime = Math.round(newEnd)
    syncLineBounds(line)
  }
}

function handleDragEnd() {
  drag = null
  draggingKey.value = null
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
})
</script>

<style lang="scss">
.syl-blocks-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
}

.syl-block {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background-color: color-mix(in srgb, var(--p-primary-color), transparent 78%);
  cursor: grab;
  user-select: none;
  overflow: hidden;
  transition: background-color 0.1s;

  &.line-alt {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 88%);
  }

  &:hover {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 65%);
  }

  &.selected {
    box-shadow: inset 0 0 0 1.5px var(--p-primary-color);
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 55%);
  }

  &.active {
    box-shadow: inset 0 0 0 1.5px var(--p-primary-color);
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 40%);
  }

  &.dragging {
    cursor: grabbing;
    z-index: 1;
  }
}

.syl-block-text {
  pointer-events: none;
  font-size: 0.75rem;
  white-space: nowrap;
  padding: 0 0.6rem;
  color: var(--p-text-color);
  text-shadow: 0 0 4px var(--p-content-background);
}

.syl-block-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  // Wide grab area, centred on the boundary
  width: 15px;
  margin-left: -6px;
  pointer-events: auto;
  cursor: ew-resize;
  z-index: 3;
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    // Always visible, so boundaries can be found without hovering first
    width: 3px;
    transform: translateX(-50%);
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 10%);
    // Dark edge plus a faint light halo keep the line readable on both dark and bright parts
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.5),
      0 0 4px 1px rgb(255 255 255 / 0.25);
    transition:
      width 0.1s,
      background-color 0.1s;
  }
  &:hover::after,
  &.dragging::after {
    width: 9px;
    background-color: var(--p-primary-color);
  }
  &.dragging {
    z-index: 2;
  }
}
</style>
