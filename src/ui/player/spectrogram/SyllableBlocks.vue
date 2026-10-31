<template>
  <div
    v-if="prefStore.spectrogramShowSyllableBlocks"
    ref="layerEl"
    class="syl-blocks-layer"
    :style="{ height: `${ctx.displayHeight.value}px` }"
  >
    <!-- Same coordinate space as the spectrogram tiles, so blocks line up with them exactly -->
    <div
      class="syl-blocks-content"
      :style="{ transform: `translate3d(${-Math.round(ctx.scrollLeft.value)}px, 0, 0)` }"
    >
      <div
        v-for="entry in lineEntries"
        :key="entry.id"
        class="syl-line"
        :class="{
          'touching-start': entry.touchingStart,
          'touching-end': entry.touchingEnd,
          'bg-vocal': entry.line.background,
        }"
        :style="{ left: `${entry.left}px`, width: `${entry.width}px` }"
        role="button"
        tabindex="0"
        aria-label="Lyric Line"
        @mousedown="handleLineMouseDown($event, entry)"
      >
        <template v-for="part in entry.parts" :key="part.key">
          <div
            v-if="part.kind === 'divider'"
            class="syl-divider"
            :class="{ touching: part.touching }"
            :style="{ left: `${part.left}px`, width: `${DIVIDER_WIDTH_PX}px` }"
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
            :aria-valuenow="part.timeMs"
            @mousedown="handleDividerMouseDown($event, entry.id, part.segmentIndex)"
            @contextmenu.prevent
            @keydown="handleDividerKeydown($event, entry.id, part)"
            @focus="releaseFocusOnOutsideClick"
          >
            <div class="syl-divider-line"></div>
          </div>

          <div
            v-else-if="part.kind === 'word'"
            class="syl-word"
            :class="{ selected: part.selected, 'bg-vocal': entry.line.background }"
            :style="{ left: `${part.left}px`, width: `${part.width}px` }"
            role="button"
            tabindex="0"
            @click.stop
            @mousedown="handleWordMouseDown($event, entry, part.segment)"
            @contextmenu.prevent.stop="auditionWord(entry, part.segment)"
            @keydown.enter.prevent.stop="auditionWord(entry, part.segment)"
          >
            <template v-if="part.hasRoman">
              <span class="syl-word-roman">{{ part.segment.romanization }}</span>
              <span class="syl-word-origin">{{ part.segment.text }}</span>
            </template>
            <template v-else>{{ part.segment.text }}</template>
          </div>

          <div
            v-else
            class="syl-gap"
            :style="{ left: `${part.left}px`, width: `${part.width}px` }"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { useSpectrogramContext } from '@core/spectrogram/SpectrogramContext'
import {
  type ProcessedLine,
  type WordSegment,
  commitProcessedLine,
  getUpdatedLineForDivider,
  getUpdatedLineForLinePan,
  getUpdatedLineForWordPan,
  processLine,
  snapToTargets,
} from '@core/spectrogram/timelineMutations'
import type { LyricLine } from '@core/types'

import { useCoreStore, usePrefStore, useRuntimeStore } from '@states/stores'

const ctx = useSpectrogramContext()
const coreStore = useCoreStore()
const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()

// Measurements below match the spicylyrics/ttml-tool timeline
const DIVIDER_WIDTH_PX = 15
const NUDGE_MS = 10
const SHIFT_NUDGE_MS = 50
/** Lines this far outside the viewport (px) are still rendered */
const BUFFER_PX = 500

interface DividerPart {
  kind: 'divider'
  key: string
  segmentIndex: number
  timeMs: number
  left: number
  touching: boolean
}
interface WordPart {
  kind: 'word'
  key: string
  segment: WordSegment
  left: number
  width: number
  selected: boolean
  hasRoman: boolean
}
interface GapPart {
  kind: 'gap'
  key: string
  left: number
  width: number
}
type Part = DividerPart | WordPart | GapPart

interface LineEntry {
  id: string
  line: LyricLine
  left: number
  width: number
  touchingStart: boolean
  touchingEnd: boolean
  parts: Part[]
}

const layerEl = ref<HTMLElement | null>(null)

// Every line, split into words and gaps. Drags edit `preview` instead of the lyrics and are
// only written back on mouse up, so this is not recomputed on every mouse move.
const processedLines = computed(() => coreStore.lyricLines.map(processLine))
const preview = shallowRef<ProcessedLine | null>(null)

const selectedSylIds = computed(() => new Set([...runtimeStore.selectedSyllables].map((s) => s.id)))

// How many lines start/end at each time, to tell which line edges touch a neighbour
const boundaryCounts = computed(() => {
  const starts = new Map<number, number>()
  const ends = new Map<number, number>()
  for (const line of processedLines.value) {
    starts.set(line.startTime, (starts.get(line.startTime) ?? 0) + 1)
    ends.set(line.endTime, (ends.get(line.endTime) ?? 0) + 1)
  }
  return { starts, ends }
})

function buildEntry(original: ProcessedLine, zoom: number): LineEntry | null {
  const previewLine = preview.value
  const display = previewLine && previewLine.id === original.id ? previewLine : original
  const startTime = Math.max(0, display.startTime)
  const endTime = Math.max(0, display.endTime)
  if (endTime <= startTime) return null

  const width = ((endTime - startTime) / 1000) * zoom
  if (width < 1) return null

  const { starts, ends } = boundaryCounts.value
  // Other lines only: subtract this line's own original edge if it happens to coincide
  const touchingStart = (ends.get(startTime) ?? 0) - (original.endTime === startTime ? 1 : 0) > 0
  const touchingEnd = (starts.get(endTime) ?? 0) - (original.startTime === endTime ? 1 : 0) > 0

  const segments = display.segments
  const lastIndex = segments.length - 1
  const parts: Part[] = []

  const pushDivider = (segmentIndex: number, timeMs: number, touching: boolean) => {
    if (timeMs < 0) return
    let offsetPx = -DIVIDER_WIDTH_PX / 2
    if (segmentIndex === -1 && touching) offsetPx = 0
    else if (segmentIndex === lastIndex && touching) offsetPx = -DIVIDER_WIDTH_PX
    parts.push({
      kind: 'divider',
      key: `divider-${segmentIndex}`,
      segmentIndex,
      timeMs,
      left: ((timeMs - startTime) / 1000) * zoom + offsetPx,
      touching,
    })
  }

  pushDivider(-1, startTime, touchingStart)
  segments.forEach((segment, index) => {
    if (segment.endTime > segment.startTime) {
      const left = ((segment.startTime - startTime) / 1000) * zoom
      const segmentWidth = ((segment.endTime - segment.startTime) / 1000) * zoom
      if (segment.type === 'word') {
        parts.push({
          kind: 'word',
          key: segment.id,
          segment,
          left,
          width: segmentWidth,
          selected: selectedSylIds.value.has(segment.id),
          hasRoman: prefStore.sylRomanEnabled && segment.romanization.trim() !== '',
        })
      } else if (segmentWidth >= 1) {
        parts.push({ kind: 'gap', key: segment.id, left, width: segmentWidth })
      }
    }
    pushDivider(index, segment.endTime, index === lastIndex ? touchingEnd : false)
  })

  return {
    id: original.id,
    line: original.line,
    left: (startTime / 1000) * zoom,
    width,
    touchingStart,
    touchingEnd,
    parts,
  }
}

const lineEntries = computed<LineEntry[]>(() => {
  if (!prefStore.spectrogramShowSyllableBlocks) return []
  const zoom = ctx.zoom.value
  if (zoom <= 0) return []

  const scrollLeft = ctx.scrollLeft.value
  const viewStartMs = ((scrollLeft - BUFFER_PX) / zoom) * 1000
  const viewEndMs = ((scrollLeft + ctx.containerWidth.value + BUFFER_PX) / zoom) * 1000

  // Everything in the buffered view, plus the nearest line on each side
  const toRender = new Set<ProcessedLine>()
  let closestLeft: ProcessedLine | null = null
  let foundClosestRight = false
  for (const line of processedLines.value) {
    if (line.endTime > viewStartMs && line.startTime < viewEndMs) {
      toRender.add(line)
      continue
    }
    if (line.endTime <= viewStartMs) closestLeft = line
    if (line.startTime >= viewEndMs && !foundClosestRight) {
      toRender.add(line)
      foundClosestRight = true
    }
  }
  if (closestLeft) toRender.add(closestLeft)

  let visible = [...toRender]
  if (prefStore.spectrogramBlockScope === 'selected') {
    visible = visible.filter((line) => runtimeStore.selectedLines.has(line.line))
  }

  const entries: LineEntry[] = []
  for (const line of visible) {
    const entry = buildEntry(line, zoom)
    if (entry) entries.push(entry)
  }
  return entries
})

//#region Dragging
type DragOperation =
  | {
      type: 'divider'
      lineId: string
      segmentIndex: number
      zoom: number
      startX: number
      isGapCreation: boolean
    }
  | {
      type: 'word-pan'
      lineId: string
      wordId: string
      initialMouseTimeMS: number
      initialWordStartMS: number
    }
  | { type: 'line-pan'; lineId: string; initialMouseTimeMS: number; initialLineStartMS: number }

let drag: DragOperation | null = null
let lockedGapDirection: 'left' | 'right' | null = null
let snapTargetsMs: number[] = []

function pointerTimeMs(clientX: number): number | null {
  const rect = layerEl.value?.getBoundingClientRect()
  if (!rect || ctx.zoom.value <= 0) return null
  return ((ctx.scrollLeft.value + (clientX - rect.left)) / ctx.zoom.value) * 1000
}

function beginDrag(operation: DragOperation) {
  endDrag()
  drag = operation

  // Line start/end handles snap to the playhead and to the edges of other lines
  if (operation.type === 'divider') {
    const line = processedLines.value.find((l) => l.id === operation.lineId)
    if (line && (operation.segmentIndex === -1 || operation.segmentIndex === line.segments.length - 1)) {
      snapTargetsMs = [
        audioEngine.getProgress(),
        ...processedLines.value
          .filter((l) => l.id !== operation.lineId)
          .flatMap((l) => [l.startTime, l.endTime]),
      ]
    }
  }

  window.addEventListener('mousemove', handleDragMove)
  window.addEventListener('mouseup', handleDragEnd, { once: true })
}

function endDrag() {
  drag = null
  lockedGapDirection = null
  snapTargetsMs = []
  preview.value = null
  window.removeEventListener('mousemove', handleDragMove)
  window.removeEventListener('mouseup', handleDragEnd)
}

function handleDragMove(e: MouseEvent) {
  const operation = drag
  if (!operation) return
  e.preventDefault()

  const original = processedLines.value.find((l) => l.id === operation.lineId)
  if (!original) return

  switch (operation.type) {
    case 'divider': {
      const deltaX = e.clientX - operation.startX
      if (operation.isGapCreation && !lockedGapDirection) {
        if (deltaX > 2) lockedGapDirection = 'right'
        else if (deltaX < -2) lockedGapDirection = 'left'
      }
      if (operation.isGapCreation && !lockedGapDirection) return

      const anchorMs =
        operation.segmentIndex === -1
          ? original.startTime
          : original.segments[operation.segmentIndex]?.endTime
      if (anchorMs === undefined) return

      let newTime = anchorMs + Math.round((deltaX / operation.zoom) * 1000)
      // Holding Shift turns snapping off
      if (!e.shiftKey) newTime = snapToTargets(newTime, operation.zoom, snapTargetsMs)

      preview.value = getUpdatedLineForDivider(
        original,
        operation.segmentIndex,
        newTime,
        operation.isGapCreation,
        lockedGapDirection,
      )
      break
    }
    case 'word-pan': {
      const mouseMs = pointerTimeMs(e.clientX)
      if (mouseMs === null) return
      preview.value = getUpdatedLineForWordPan(
        original,
        operation.wordId,
        operation.initialWordStartMS + (mouseMs - operation.initialMouseTimeMS),
      )
      break
    }
    case 'line-pan': {
      const mouseMs = pointerTimeMs(e.clientX)
      if (mouseMs === null) return
      preview.value = getUpdatedLineForLinePan(
        original,
        operation.initialLineStartMS + (mouseMs - operation.initialMouseTimeMS),
      )
      break
    }
  }
}

function handleDragEnd(e: MouseEvent) {
  e.preventDefault()
  if (preview.value) commitProcessedLine(preview.value)
  endDrag()
}
//#endregion

//#region Block interaction
function handleLineMouseDown(e: MouseEvent, entry: LineEntry) {
  if (e.button !== 0) return
  e.stopPropagation()
  const original = processedLines.value.find((l) => l.id === entry.id)
  const mouseMs = pointerTimeMs(e.clientX)
  if (!original || mouseMs === null) return

  beginDrag({
    type: 'line-pan',
    lineId: entry.id,
    initialMouseTimeMS: mouseMs,
    initialLineStartMS: original.startTime,
  })
  runtimeStore.selectLine(entry.line)
}

function selectWord(entry: LineEntry, segment: WordSegment) {
  const syl = entry.line.syllables.find((s) => s.id === segment.id)
  if (syl) runtimeStore.selectLineSyl(entry.line, syl)
}

function handleWordMouseDown(e: MouseEvent, entry: LineEntry, segment: WordSegment) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const mouseMs = pointerTimeMs(e.clientX)
  if (mouseMs === null) return

  beginDrag({
    type: 'word-pan',
    lineId: entry.id,
    wordId: segment.id,
    initialMouseTimeMS: mouseMs,
    initialWordStartMS: segment.startTime,
  })
  selectWord(entry, segment)
}

function handleDividerMouseDown(e: MouseEvent, lineId: string, segmentIndex: number) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  // preventDefault blocks mouse focus, which the arrow-key nudge needs
  ;(e.currentTarget as HTMLElement).focus({ preventScroll: true })
  beginDrag({
    type: 'divider',
    lineId,
    segmentIndex,
    zoom: ctx.zoom.value,
    startX: e.clientX,
    isGapCreation: e.altKey,
  })
}

// Mouse focus is blocked elsewhere, so drop focus on any outside click to give plain
// arrow keys back to audio seeking
function releaseFocusOnOutsideClick(e: FocusEvent) {
  const divider = e.currentTarget as HTMLElement
  const onPointerDown = (pointerEvent: PointerEvent) => {
    if (!divider.contains(pointerEvent.target as Node)) divider.blur()
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  divider.addEventListener(
    'blur',
    () => document.removeEventListener('pointerdown', onPointerDown, true),
    { once: true },
  )
}

function handleDividerKeydown(e: KeyboardEvent, lineId: string, part: DividerPart) {
  if (e.key === 'Escape') {
    ;(e.currentTarget as HTMLElement).blur()
    return
  }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  e.stopPropagation()

  const original = processedLines.value.find((l) => l.id === lineId)
  if (!original) return

  const nudgeMs = e.shiftKey ? SHIFT_NUDGE_MS : NUDGE_MS
  const newTime = e.key === 'ArrowRight' ? part.timeMs + nudgeMs : part.timeMs - nudgeMs
  commitProcessedLine(getUpdatedLineForDivider(original, part.segmentIndex, newTime, false))
}
//#endregion

//#region Audition (right-click / Enter on a word)
const audioEl = audioEngine.audioEl
let auditionTimer: ReturnType<typeof setInterval> | null = null

function stopAudition() {
  if (auditionTimer !== null) clearInterval(auditionTimer)
  auditionTimer = null
  audioEl.removeEventListener('pause', stopAudition)
}

function auditionWord(entry: LineEntry, segment: WordSegment) {
  selectWord(entry, segment)
  stopAudition()
  audioEngine.seek(segment.startTime)
  audioEngine.play()
  // Stop at the end of the word, or as soon as playback is paused by anything else
  audioEl.addEventListener('pause', stopAudition)
  auditionTimer = setInterval(() => {
    if (audioEngine.getPreciseProgress() >= segment.endTime) {
      stopAudition()
      audioEngine.pause()
    }
  }, 10)
}
//#endregion

watch(
  () => prefStore.spectrogramShowSyllableBlocks,
  (shown) => {
    if (!shown) endDrag()
  },
)

onUnmounted(() => {
  endDrag()
  stopAudition()
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

  // The ttml-tool timeline is always drawn on its dark theme, so these are fixed values.
  // Grays are its exact dark-scale values.
  --syl-gray-12: #ffffff;
  --syl-gray-11: #cad3db;
  --syl-gray-a3: rgba(255, 255, 255, 0.055);
  --syl-gray-a4: rgba(255, 255, 255, 0.075);
  --syl-radius-1: 3px;
  // ttml-tool takes these from its Radix accent scale. Here they are rebuilt from the app's
  // primary colour; the percentages are the tint strengths and are the knobs to adjust.
  --syl-accent-a3: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
  --syl-accent-a6: color-mix(in srgb, var(--p-primary-color) 41%, transparent);
  --syl-accent-a8: color-mix(in srgb, var(--p-primary-color) 69%, transparent);
  --syl-accent-8: color-mix(in srgb, var(--p-primary-color) 78%, #0c0f12);
  --syl-accent-11: color-mix(in srgb, var(--p-primary-color) 55%, #ffffff);
}

.syl-blocks-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 100%;
  will-change: transform;
}

.syl-line {
  position: absolute;
  top: 0;
  height: 100%;
  box-sizing: border-box;
  pointer-events: auto;
  background-color: var(--syl-accent-a3);
  border: 1px solid var(--syl-accent-8);
  border-radius: var(--syl-radius-1);
  transition:
    filter 0.05s ease-in-out,
    background-color 0.05s ease-in-out,
    border-color 0.05s ease-in-out;

  &.touching-start {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  &.touching-end {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.syl-word {
  position: absolute;
  top: 0;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  overflow: hidden;
  padding: 4px 4px 0 4px;
  border: 1px solid var(--syl-accent-8);
  border-radius: var(--syl-radius-1);
  color: var(--syl-gray-12);
  font-size: 16px;
  line-height: 1.5;
  white-space: nowrap;
  user-select: none;
  pointer-events: auto;

  &.selected {
    background-color: var(--syl-accent-a6);
  }

  // ttml-tool points this at a variable it never defines, so the border falls back to the
  // text colour; that effective result is used here.
  &:hover,
  &:focus-visible {
    border-color: var(--syl-gray-12);
    outline: none;
  }
}

.syl-word-roman {
  width: 100%;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  color: var(--syl-gray-11);
}

.syl-word-origin {
  width: 100%;
  overflow: hidden;
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
}

.syl-gap {
  position: absolute;
  top: 0;
  height: 100%;
  box-sizing: border-box;
  pointer-events: none;
  background: repeating-linear-gradient(
    45deg,
    var(--syl-gray-a4),
    var(--syl-gray-a4) 5px,
    var(--syl-gray-a3) 5px,
    var(--syl-gray-a3) 10px
  );
  border: 1px solid var(--syl-accent-8);
  border-radius: var(--syl-radius-1);
}

.syl-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  justify-content: center;
  align-items: stretch;
  cursor: ew-resize;
  pointer-events: auto;

  &:focus {
    outline: none;
  }
}

.syl-divider-line {
  width: 2px;
  height: 100%;
  background-color: var(--syl-accent-8);
  opacity: 0.7;
  border-radius: 1px;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease,
    width 0.15s ease,
    height 0.15s ease;

  .syl-divider.touching & {
    height: 60%;
    align-self: center;
  }

  .syl-divider:hover &,
  .syl-divider:focus & {
    width: 3px;
    background-color: var(--syl-accent-11);
    opacity: 1;
    box-shadow: 0 0 6px var(--syl-accent-a8);
  }
}
</style>
