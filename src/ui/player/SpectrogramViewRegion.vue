<template>
  <div
    v-if="visible"
    class="view-region"
    :class="{ dragging }"
    :style="{ left: `${rect.left}px`, width: `${rect.width}px` }"
  >
    <div class="view-region-handle left" @mousedown="startDrag($event, 'resizeLeft')"></div>
    <div class="view-region-body" @mousedown="startDrag($event, 'pan')"></div>
    <div class="view-region-handle right" @mousedown="startDrag($event, 'resizeRight')"></div>
  </div>
</template>

<script setup lang="ts">
// Shows which part of the song the spectrogram currently displays, on top of the mini waveform.
// Dragging the body pans the spectrogram; dragging an edge zooms it.
// Layout and drag behaviour follow NaeNae's AudioRegion / useAudioRegion.
import { computed, onBeforeUnmount, ref } from 'vue'

import { audioEngine } from '@core/audio'
import {
  type ViewportSnapshot,
  isViewportDragging,
  panView,
  regionRect,
  resizeView,
  spectrogramViewport,
} from '@core/spectrogram/viewport'

type DragType = 'pan' | 'resizeLeft' | 'resizeRight'

interface DragState {
  type: DragType
  startClientX: number
  sliderLeft: number
  secPerPx: number
  initial: ViewportSnapshot
}

const props = defineProps<{
  /** The element the region is laid over (the waveform), used to map the pointer to time */
  container: HTMLElement | null
  /** Width of that element in px */
  sliderWidth: number
}>()
const emit = defineEmits<{ dragging: [value: boolean] }>()

/** Keeps the region grabbable when the spectrogram shows only a tiny slice of the song */
const MIN_REGION_WIDTH_PX = 8

const { zoom, scrollLeft, containerWidth } = spectrogramViewport
const durationSec = computed(() => audioEngine.lengthComputed.value / 1000)
const dragging = ref(false)

const visible = computed(
  () =>
    durationSec.value > 0 && props.sliderWidth > 0 && containerWidth.value > 0 && zoom.value > 0,
)

const rect = computed(() =>
  regionRect(
    {
      zoom: zoom.value,
      scrollLeft: scrollLeft.value,
      containerWidth: containerWidth.value,
      durationSec: durationSec.value,
    },
    props.sliderWidth,
    MIN_REGION_WIDTH_PX,
  ),
)

let drag: DragState | null = null

function startDrag(e: MouseEvent, type: DragType) {
  if (e.button !== 0 || !props.container || !visible.value) return
  // Stop the waveform underneath from treating this as a seek
  e.preventDefault()
  e.stopPropagation()

  drag = {
    type,
    startClientX: e.clientX,
    sliderLeft: props.container.getBoundingClientRect().left,
    secPerPx: durationSec.value / props.sliderWidth,
    initial: {
      zoom: zoom.value,
      scrollLeft: scrollLeft.value,
      containerWidth: containerWidth.value,
      durationSec: durationSec.value,
    },
  }
  setDragging(true)
  window.addEventListener('mousemove', handleMove)
  window.addEventListener('mouseup', endDrag)
}

function handleMove(e: MouseEvent) {
  const d = drag
  if (!d) return

  const next =
    d.type === 'pan'
      ? panView(d.initial, (e.clientX - d.startClientX) * d.secPerPx)
      : resizeView(
          d.initial,
          d.type === 'resizeLeft' ? 'left' : 'right',
          (e.clientX - d.sliderLeft) * d.secPerPx,
        )
  if (!next) return
  zoom.value = next.zoom
  scrollLeft.value = next.scrollLeft
}

function endDrag() {
  drag = null
  setDragging(false)
  window.removeEventListener('mousemove', handleMove)
  window.removeEventListener('mouseup', endDrag)
}

function setDragging(value: boolean) {
  dragging.value = value
  isViewportDragging.value = value
  emit('dragging', value)
}

onBeforeUnmount(() => {
  if (drag) endDrag()
})
</script>

<style lang="scss">
.view-region {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  box-sizing: border-box;
  // Straight edges on purpose: the window is a plain frame, not a pill
  border-left: 2px solid var(--p-primary-color);
  border-right: 2px solid var(--p-primary-color);
  background-color: color-mix(in srgb, var(--p-primary-color), transparent 85%);
  pointer-events: none;

  .view-region-body {
    position: absolute;
    inset: 0;
    cursor: grab;
    pointer-events: auto;
  }
  &.dragging .view-region-body {
    cursor: grabbing;
  }

  .view-region-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    // On a very narrow region, never let the handles swallow the body
    max-width: 40%;
    cursor: ew-resize;
    pointer-events: auto;
    z-index: 1;
    &.left {
      left: -2px;
    }
    &.right {
      right: -2px;
    }
  }
}
</style>
