<template>
  <canvas ref="canvasEl" class="spectrogram-wavebars"></canvas>
</template>

<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { useSpectrogramContext } from '@core/spectrogram/SpectrogramContext'
import { type VocalMap, detectVocals, vocalScoreBetween } from '@core/spectrogram/vocalDetect'
import { useEffectiveDark } from '@core/theme'

import { usePrefStore } from '@states/stores'

// The band is drawn as a row of bars, one per slice of time: tall bars in the accent color,
// shorter ones fading toward the background. A bar is BAR_PX wide on screen whatever the
// zoom, and covers BAR_PX / zoom seconds, so bars stay put while scrolling.
const BAR_PX = 10
const GAP_PX = 1
/** Height left free under the bars for the syllable chip row */
const CHIPS_RESERVE_PX = 46

const ctx = useSpectrogramContext()
const prefStore = usePrefStore()
const isDark = useEffectiveDark()
const canvasEl = useTemplateRef('canvasEl')
const { width, height } = useElementSize(canvasEl)

// Peak level per millisecond, built once per audio file
const ENVELOPE_RATE = 1000
const envelopes = new WeakMap<AudioBuffer, { peaks: Float32Array; max: number }>()
function getEnvelope(buffer: AudioBuffer) {
  const cached = envelopes.get(buffer)
  if (cached) return cached
  const step = Math.max(1, Math.floor(buffer.sampleRate / ENVELOPE_RATE))
  const length = Math.ceil(buffer.length / step)
  const peaks = new Float32Array(length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      let peak = peaks[i]!
      const end = Math.min(data.length, (i + 1) * step)
      for (let j = i * step; j < end; j++) {
        const v = Math.abs(data[j]!)
        if (v > peak) peak = v
      }
      peaks[i] = peak
    }
  }
  let max = 0
  for (const v of peaks) if (v > max) max = v
  const envelope = { peaks, max: max || 1 }
  envelopes.set(buffer, envelope)
  return envelope
}

// Which parts sound like a voice. Computed in the background; bars are all colored until it lands
const vocals = shallowRef<VocalMap | null>(null)
watch(
  [() => audioEngine.audioBuffer, () => prefStore.spectrogramDetectVocals],
  async ([buffer, enabled]) => {
    vocals.value = null
    if (!buffer || !enabled) return
    const result = await detectVocals(buffer)
    if (audioEngine.audioBuffer === buffer) vocals.value = result
  },
  { immediate: true },
)

type Rgb = [number, number, number]
function readColor(el: HTMLElement, cssColor: string): Rgb {
  el.style.color = cssColor
  const match = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)
  if (!match) return [245, 166, 91]
  return [Number(match[0]), Number(match[1]), Number(match[2])]
}
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] * t + b[0] * (1 - t)),
  Math.round(a[1] * t + b[1] * (1 - t)),
  Math.round(a[2] * t + b[2] * (1 - t)),
]
const css = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`

let frame = 0
function scheduleDraw() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    draw()
  })
}
function draw() {
  const canvas = canvasEl.value
  const buffer = audioEngine.audioBuffer
  if (!canvas || width.value === 0 || height.value === 0) return
  const dpr = devicePixelRatio
  canvas.width = Math.round(width.value * dpr)
  canvas.height = Math.round(height.value * dpr)
  const g = canvas.getContext('2d')
  if (!g) return
  g.scale(dpr, dpr)
  g.clearRect(0, 0, width.value, height.value)
  if (!buffer) return

  const accent = readColor(canvas, 'var(--p-primary-color)')
  const ground = readColor(canvas, 'var(--global-background)')
  const muted = readColor(canvas, 'var(--p-text-muted-color)')
  // Loud bars are the most saturated, quiet ones fade toward the background
  const shade = (base: Rgb, level: number) =>
    mixRgb(base, ground, level > 0.7 ? 1 : level > 0.45 ? 0.55 : 0.22)
  const voices = vocals.value

  const { peaks, max } = getEnvelope(buffer)
  const zoom = ctx.zoom.value
  const scroll = ctx.scrollLeft.value
  const barSec = BAR_PX / zoom
  const gain = ctx.gain.value / 3
  const baseline = Math.max(0, height.value - CHIPS_RESERVE_PX)
  const first = Math.floor(scroll / BAR_PX)
  const last = Math.ceil((scroll + width.value) / BAR_PX)
  for (let k = Math.max(0, first); k <= last; k++) {
    const from = Math.floor(k * barSec * ENVELOPE_RATE)
    if (from >= peaks.length) break
    const to = Math.max(
      from + 1,
      Math.min(peaks.length, Math.floor((k + 1) * barSec * ENVELOPE_RATE)),
    )
    let peak = 0
    for (let i = from; i < to; i++) if (peaks[i]! > peak) peak = peaks[i]!
    const level = Math.min(1, Math.sqrt(peak / max) * gain)
    const h = Math.max(2, level * baseline * 0.96)
    // Voice-like bars keep the accent; everything else is pulled toward gray
    const voice = voices ? vocalScoreBetween(voices, k * barSec, (k + 1) * barSec) : 1
    g.fillStyle = css(mixRgb(shade(accent, level), shade(muted, level * 0.8), voice))
    g.fillRect(k * BAR_PX - scroll, baseline - h, BAR_PX - GAP_PX, h)
  }
}

onMounted(() => nextTick(scheduleDraw))
onUnmounted(() => cancelAnimationFrame(frame))
watch(
  [
    ctx.scrollLeft,
    ctx.zoom,
    ctx.gain,
    width,
    height,
    () => audioEngine.audioBuffer,
    () => prefStore.themeAccent,
    vocals,
    isDark,
  ],
  scheduleDraw,
)
</script>

<style lang="scss">
.spectrogram-wavebars {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
