<template>
  <div
    class="spicy-preview"
    :class="{ 'sp-simple': prefStore.spicySimpleLyrics }"
    style="--spicy-accent: var(--p-primary-500)"
  >
    <div
      class="sp-background"
      :class="{ 'sp-animatedBackground': prefStore.spicyBackground === 'animated' }"
    />
    <div v-if="prefStore.spicyBackground === 'color'" class="sp-colorBackground" />
    <div class="sp-overlay" />
    <div v-if="prefStore.spicyShowFps" class="sp-fpsCounter">FPS: {{ fps }}</div>
    <div
      ref="viewportRef"
      class="sp-viewport"
      :class="{ 'sp-hasDuetLines': hasDuetLines }"
      @wheel.passive="pauseFollow"
      @touchstart.passive="pauseFollow"
      @touchmove.passive="pauseFollow"
      @pointerdown="pauseFollow"
    >
      <div class="sp-virtualContent">
        <div
          v-for="(line, index) in lines"
          :key="line.id"
          class="sp-row"
          :style="{ paddingBottom: `${rowGap(index)}cqw` }"
        >
          <div
            :ref="(el) => setNode(lineNodes, line.id, el)"
            class="sp-line"
            :class="{
              'sp-dotLine': line.isDotLine,
              'sp-lineSynced': line.isLineSynced,
              'sp-rtl': line.isRtl,
              'sp-backgroundLine': line.isBackground,
              'sp-duet': line.isDuet,
            }"
            :dir="line.isRtl ? 'rtl' : undefined"
            @click="seekTo(line)"
          >
            <div v-if="line.isDotLine" class="sp-dotGroup">
              <span
                v-for="(word, wi) in line.words"
                :key="keyFor(line, word, wi)"
                :ref="(el) => setNode(wordNodes, keyFor(line, word, wi), el)"
                class="sp-dot"
                >{{ word.text }}</span
              >
            </div>
            <template v-else-if="line.isLineSynced">{{ line.text }}</template>
            <template v-else>
              <template v-for="group in groupSpicyTokens(line.words)" :key="groupKey(line, group)">
                <span
                  v-if="group.items.length > 1"
                  class="sp-wordGroup"
                  :class="{ 'sp-wordBoundary': group.hasTrailingSpace }"
                >
                  <SpicyToken
                    v-for="(item, ii) in group.items"
                    :key="keyFor(line, item.token, item.wordIndex)"
                    :line="line"
                    :token="item.token"
                    :word-index="item.wordIndex"
                    :part-of-word="ii < group.items.length - 1"
                    :set-node="setWordNode"
                  />
                </span>
                <SpicyToken
                  v-else
                  :line="line"
                  :token="group.items[0]!.token"
                  :word-index="group.items[0]!.wordIndex"
                  :word-boundary="group.hasTrailingSpace"
                  :set-node="setWordNode"
                />
              </template>
            </template>
            <span
              v-if="prefStore.spicyShowTranslation && !line.isDotLine && line.translation"
              class="sp-translation"
              >{{ line.translation }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { debounce } from 'lodash-es'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { findSpicyScrollIndex } from '@core/spicy/activeLine'
import { createSpicyAnimator } from '@core/spicy/animator'
import { joinSplitWordsInLines } from '@core/spicy/joinSplit'
import { Spring } from '@core/spicy/math'
import { type SpicyLine, buildSpicyLines, groupSpicyTokens, keyFor } from '@core/spicy/model'
import type { SpringSet } from '@core/spicy/animator'

import { useCoreStore, usePrefStore, useRuntimeStore, useStaticStore } from '@states/stores'

import { tryRaf } from '@utils/tryRaf'

import SpicyToken from './SpicyToken.vue'

import './spicy.scss'

const coreStore = useCoreStore()
const prefStore = usePrefStore()
const runtimeStore = useRuntimeStore()
const staticStore = useStaticStore()
const { progressComputed, amendedProgressComputed, playingComputed, seek } = audioEngine

// Node and spring bookkeeping lives outside Vue: the animator writes styles straight to the
// elements every frame, which reactive state would only slow down.
const lineNodes = new Map<string, HTMLElement>()
const wordNodes = new Map<string, HTMLElement>()
const springs = new Map<string, SpringSet>()
const lineGlowSprings = new Map<string, Spring>()

type ElementRef = Element | { $el?: unknown } | null
function setNode(map: Map<string, HTMLElement>, key: string, el: ElementRef) {
  if (el instanceof HTMLElement) map.set(key, el)
  else map.delete(key)
}
const setWordNode = (key: string, el: ElementRef) => setNode(wordNodes, key, el)

//#region Lines
const lines = shallowRef<SpicyLine[]>([])
const hasDuetLines = computed(() => lines.value.some((line) => line.isDuet && !line.isDotLine))
const GAP_NORMAL = 1
const GAP_LINE_TO_BG = 0.2
/** Trailing gap of a row in cqw; interlude rows carry their own gap in CSS */
function rowGap(index: number) {
  const all = lines.value
  if (index >= all.length - 1 || all[index]!.isDotLine) return 0
  const next = all[index + 1]!
  return next.isBackground && !next.isDotLine ? GAP_LINE_TO_BG : GAP_NORMAL
}

let animate: ReturnType<typeof createSpicyAnimator> | null = null
let dirty = true
let lastScrollIndex = -2

function rebuild() {
  const source = prefStore.spicyJoinSplitWords
    ? joinSplitWordsInLines(coreStore.lyricLines)
    : coreStore.lyricLines
  lines.value = buildSpicyLines(source, {
    simple: prefStore.spicySimpleLyrics,
    romanized: prefStore.spicyShowRomanization,
    forceLineSynced: prefStore.spicyForceLineSynced,
  })
  springs.clear()
  lineGlowSprings.clear()
  animate = createSpicyAnimator({
    lines: lines.value,
    simple: prefStore.spicySimpleLyrics,
    lineNodes,
    wordNodes,
    springs,
    lineGlowSprings,
  })
  dirty = true
}
// Rebuilding on every keystroke or drag step is wasteful, so quick changes are applied once
const rebuildSoon = debounce(rebuild, 80)
rebuild()
watch(() => coreStore.lyricLines, rebuildSoon, { deep: true })
watch(
  () => [
    prefStore.spicySimpleLyrics,
    prefStore.spicyForceLineSynced,
    prefStore.spicyJoinSplitWords,
    prefStore.spicyShowRomanization,
  ],
  rebuild,
)
//#endregion

//#region Scroll and seek
const viewportRef = ref<HTMLElement>()
const FOLLOW_PAUSE_MS = 2500
const SCROLL_ANCHOR = 0.4
let pausedUntil = 0
let pendingResume = false
function pauseFollow() {
  pausedUntil = performance.now() + FOLLOW_PAUSE_MS
  pendingResume = true
}

function scrollToLine(index: number, instant: boolean) {
  const viewport = viewportRef.value
  const line = lines.value[index]
  const row = line && lineNodes.get(line.id)?.parentElement
  if (!viewport || !row) return
  const rowRect = row.getBoundingClientRect()
  const viewRect = viewport.getBoundingClientRect()
  const rowTop = rowRect.top - viewRect.top + viewport.scrollTop
  const top = rowTop + rowRect.height / 2 - viewport.clientHeight * SCROLL_ANCHOR
  viewport.scrollTo({ top: Math.max(0, top), behavior: instant ? 'instant' : 'smooth' })
}

function seekTo(line: SpicyLine) {
  if (line.isDotLine) return
  seek(line.startTime)
  pausedUntil = 0
  pendingResume = true
}
//#endregion

//#region Frame loop
const fps = ref(0)
let raf = 0
let lastTime = -1
let first = true
let fpsFrames = 0
let fpsStamp = 0

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  if (prefStore.spicyShowFps) {
    fpsFrames++
    if (!fpsStamp) fpsStamp = now
    if (now - fpsStamp >= 1000) {
      fps.value = Math.round((fpsFrames * 1000) / (now - fpsStamp))
      fpsFrames = 0
      fpsStamp = now
    }
  }
  const time = amendedProgressComputed.value
  const playing = playingComputed.value
  // Nothing is moving: no need to touch the DOM again
  if (!playing && time === lastTime && !dirty) return
  const seeked = lastTime < 0 || Math.abs(time - lastTime) > 400 || time < lastTime
  lastTime = time
  dirty = false
  animate?.(time, now, seeked || !playing)

  const index = findSpicyScrollIndex(lines.value, time)
  if (now >= pausedUntil && index >= 0 && (index !== lastScrollIndex || pendingResume)) {
    lastScrollIndex = index
    pendingResume = false
    scrollToLine(index, first)
    first = false
  }
}
onMounted(() => {
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  rebuildSoon.cancel()
})
//#endregion

//#region Editor hand-off (selection follows what the preview shows)
onMounted(() => runtimeStore.clearSelection())
onUnmounted(() => {
  if (coreStore.lyricLines.length === 0) return
  for (const [index, line] of coreStore.lyricLines.entries()) {
    if (line.endTime > progressComputed.value) {
      runtimeStore.selectLine(line)
      tryRaf(() => {
        if (!staticStore.editorHook) return
        else staticStore.editorHook.scrollTo(index, { align: 'center' })
        return true
      })
      return
    }
  }
  runtimeStore.selectLine(coreStore.lyricLines.at(-1)!)
  tryRaf(() => {
    if (!staticStore.editorHook) return
    else staticStore.editorHook.scrollTo(coreStore.lyricLines.length - 1, { align: 'end' })
    return true
  })
})

// The preview always plays at normal speed
let enteringPlaybackRate: number | null = null
onMounted(() => {
  if (audioEngine.playbackRateRef.value !== 1) {
    enteringPlaybackRate = audioEngine.playbackRateRef.value
    audioEngine.playbackRateRef.value = 1
  }
})
onUnmounted(() => {
  if (enteringPlaybackRate !== null) {
    audioEngine.playbackRateRef.value = enteringPlaybackRate
    enteringPlaybackRate = null
  }
})
//#endregion

function groupKey(line: SpicyLine, group: ReturnType<typeof groupSpicyTokens>[number]) {
  const first = group.items[0]!
  return `group:${keyFor(line, first.token, first.wordIndex)}`
}
</script>

<style lang="scss">
.spicy-preview {
  flex: 1;
  min-width: 0;
}
</style>
