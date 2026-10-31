<template>
  <div class="spectrogram-toolkit">
    <div class="spectrogram-resize-handle" v-bind="resizeHandleProps"></div>
    <div class="spectrogram-slider">
      <div class="spectrogram-block-toolbar">
        <Button
          icon="pi pi-th-large"
          size="small"
          v-tooltip="'Show syllable blocks'"
          :severity="prefStore.spectrogramShowSyllableBlocks ? 'primary' : 'secondary'"
          :class="{ 'no-audio-block': !audioEngine.audioBuffer, 'flash-error': noAudioFlash }"
          @click="handleToggleBlocksClick"
        />
        <Button
          v-if="prefStore.spectrogramShowSyllableBlocks"
          :icon="prefStore.spectrogramBlockScope === 'all' ? 'pi pi-bars' : 'pi pi-align-left'"
          size="small"
          severity="secondary"
          v-tooltip="
            prefStore.spectrogramBlockScope === 'all'
              ? 'Editing all lines — click to switch to selected line only'
              : 'Editing selected line only — click to switch to all lines'
          "
          @click="
            prefStore.spectrogramBlockScope =
              prefStore.spectrogramBlockScope === 'all' ? 'selected' : 'all'
          "
        />
      </div>
      <Slider orientation="vertical" :min="0.5" :max="8" :step="0.5" v-model="gainModel" />
    </div>
    <div
      class="spectrogram-ruler-container"
      @wheel.prevent="handleWheel"
      @mousemove="handleMouseMove"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <div
        class="spectrogram-container"
        ref="containerEl"
        :style="{ height: `${ctx.displayHeight.value}px` }"
      >
        <WaveBars v-if="barsMode" />
        <div
          v-else
          class="spectrogram-content"
          :style="{
            width: `${ctx.totalContentWidth.value}px`,
            transform: `translate3d(${-Math.round(ctx.scrollLeft.value)}px, 0, 0)`,
          }"
        >
          <Tile v-for="tile in visibleTiles" :key="tile.id" v-bind="tile" />
        </div>

        <Playhead />
        <SyllableBlocks />

        <EmptyTip
          v-if="!audioEngine.audioBuffer"
          icon="pi pi-volume-off"
          :title="tt.emptyTip.title()"
          :tip="tt.emptyTip.detail()"
          compact
        />
      </div>
      <div class="spectrogram-ruler-clickable" @mousedown="handleRulerMouseDown">
        <Ruler
          :zoom="ctx.zoom.value"
          :scrollLeft="ctx.scrollLeft.value"
          :duration="audioEngine.lengthComputed.value / 1000"
          :width="containerWidth"
          flip
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { useElementSize } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { computed, ref, watch } from 'vue'

import { audioEngine } from '@core/audio/index.ts'
import { useSpectrogramProvider } from '@core/spectrogram/SpectrogramContext'
import { parseSpectrogramColor } from '@core/spectrogram/colors'
import { useSpectrogramInteraction } from '@core/spectrogram/useSpectrogramInteraction'
import { useSpectrogramResize } from '@core/spectrogram/useSpectrogramResize'
import { useSpectrogramTiles } from '@core/spectrogram/useSpectrogramTiles'
import { spectrogramViewport } from '@core/spectrogram/viewport'

import { usePrefStore } from '@states/stores'

import Playhead from './Playhead.vue'
import Ruler from './Ruler.vue'
import SyllableBlocks from './SyllableBlocks.vue'
import Tile from './Tile.vue'
import WaveBars from './WaveBars.vue'
import EmptyTip from '@ui/components/EmptyTip.vue'
import { Button, Slider } from 'primevue'

const tt = t.spectrogram

const prefStore = usePrefStore()

const containerEl = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(containerEl)
const { audioBufferComputed } = audioEngine

const gainModel = ref(3)
// zoom / scroll / width live in a shared module so the waveform's view region can read and drive them
const {
  zoom: zoomModel,
  scrollLeft: scrollLeftModel,
  containerWidth: containerWidthModel,
} = spectrogramViewport
const paletteIdModel = computed(() => {
  if (typeof prefStore.spectrogramColor === 'string') return prefStore.spectrogramColor
  return nanoid()
})
const paletteModel = computed(() => parseSpectrogramColor(prefStore.spectrogramColor))

// 初始化 Context 状态源
const ctx = useSpectrogramProvider({
  audioBufferComputed,
  gainModel,
  zoomModel,
  scrollLeftModel,
  paletteIdModel,
  paletteModel,
  containerWidthModel,
})

// 初始化交互相关
const { handleWheel, handleMouseMove, handleMouseEnter, handleMouseLeave } =
  useSpectrogramInteraction({
    ctx,
    containerEl,
  })

// 高度调整相关
const {
  height: resizedHeight,
  isResizing,
  resizeHandleProps,
} = useSpectrogramResize({
  initialHeight: prefStore.spectrogramHeight,
  minHeight: 120,
  maxHeight: 600,
})

// 拖拽调整高度时只修改 CSS 高度，停止拖拽时再更新渲染分辨率以避免每帧重渲染的性能问题
watch(
  [resizedHeight, isResizing],
  () => {
    const h = resizedHeight.value
    ctx.displayHeight.value = h
    if (!isResizing.value) {
      ctx.renderHeight.value = h
      prefStore.spectrogramHeight = h
    }
  },
  { immediate: true },
)

// 获取瓦片
const barsMode = computed(() => prefStore.spectrogramStyle === 'bars')
const { visibleTiles } = useSpectrogramTiles({
  ctx,
  audioBuffer: audioBufferComputed,
  enabled: computed(() => !barsMode.value),
})

// 无音频时点击「显示音节块」按钮，闪红提示而不是切换
const noAudioFlash = ref(false)
let noAudioFlashTimeout: ReturnType<typeof setTimeout> | null = null
function handleToggleBlocksClick() {
  if (!audioEngine.audioBuffer) {
    noAudioFlash.value = false
    requestAnimationFrame(() => {
      noAudioFlash.value = true
      if (noAudioFlashTimeout) clearTimeout(noAudioFlashTimeout)
      noAudioFlashTimeout = setTimeout(() => {
        noAudioFlash.value = false
      }, 1000)
    })
    return
  }
  prefStore.spectrogramShowSyllableBlocks = !prefStore.spectrogramShowSyllableBlocks
}

// 点击/拖动标尺以跳转到对应时间点
let seekingViaRuler = false
function rulerXToMs(clientX: number, rect: DOMRect) {
  const x = clientX - rect.left
  const ms = ((x + ctx.scrollLeft.value) / ctx.zoom.value) * 1000
  return Math.max(0, Math.min(ms, audioEngine.lengthComputed.value))
}
function handleRulerMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  seekingViaRuler = true
  audioEngine.seek(rulerXToMs(e.clientX, rect))
  document.addEventListener('mousemove', handleRulerDrag)
  document.addEventListener('mouseup', handleRulerMouseUp)
  const capturedRect = rect
  function handleRulerDrag(ev: MouseEvent) {
    if (!seekingViaRuler) return
    audioEngine.seek(rulerXToMs(ev.clientX, capturedRect))
  }
  function handleRulerMouseUp() {
    seekingViaRuler = false
    document.removeEventListener('mousemove', handleRulerDrag)
    document.removeEventListener('mouseup', handleRulerMouseUp)
  }
}
</script>

<style lang="scss">
.spectrogram-toolkit {
  display: flex;
  position: relative;
  align-items: stretch;
}

.spectrogram-ruler-container {
  position: relative;
  width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.spectrogram-ruler {
  font-family: var(--font-monospace);
}

.spectrogram-ruler-clickable {
  cursor: pointer;
}

.spectrogram-container {
  min-height: 120px;
  position: relative;
  overflow: hidden;
  contain: strict;
}

.spectrogram-content {
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.spectrogram-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0.3rem;
  background-color: var(--p-primary-color);
  z-index: 3;
  opacity: 0;
  transition: opacity 0.1s;
  &:hover {
    opacity: 0.7;
    transition-delay: 0.3s;
  }
  &:active {
    opacity: 0.7;
    transition: opacity 0.1s;
  }
  &,
  :root:has(&:active) * {
    cursor: ns-resize !important;
  }
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: -0.3rem;
    left: 0;
  }
}

.spectrogram-block-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.3rem;

  .no-audio-block {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .flash-error {
    animation: block-toolbar-flash-error 0.6s ease;
  }
}

@keyframes block-toolbar-flash-error {
  0%,
  100% {
    box-shadow: none;
  }
  30% {
    box-shadow: 0 0 0 2px #ef4444;
  }
}

.spectrogram-slider {
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
  gap: 0.5rem;
  align-items: center;
  .p-slider.p-slider {
    min-height: 0;
    flex: 1;
    margin: 0.8rem 0;
  }
}
</style>
