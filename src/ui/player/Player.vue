<template>
  <Card class="player">
    <template #content>
      <div class="player-toolbar">
        <div class="player-transport">
          <Button
            icon="mdi mdi-chevron-double-left"
            severity="secondary"
            variant="text"
            rounded
            :disabled="!activatedRef"
            @click="audioEngine.seekBy(-optimizedStep)"
            v-tooltip="tipHotkey(t.hotkey.commands.seekBackward(), 'seekBackward')"
          />
          <Button
            :icon="`mdi ${playingComputed ? 'mdi-pause' : 'mdi-play'}`"
            class="player-play"
            rounded
            @click="audioEngine.togglePlay()"
            :disabled="!activatedRef"
            v-tooltip="tipHotkey(playingComputed ? tt.pause() : tt.play(), 'playPauseAudio')"
            ref="playPauseButton"
          />
          <Button
            icon="mdi mdi-chevron-double-right"
            severity="secondary"
            variant="text"
            rounded
            :disabled="!activatedRef"
            @click="audioEngine.seekBy(optimizedStep)"
            v-tooltip="tipHotkey(t.hotkey.commands.seekForward(), 'seekForward')"
          />
        </div>
        <div class="player-time monospace">
          <span class="player-time-now">{{ ms2str(amendedProgressComputed) }}</span>
          <span class="player-time-total"> / {{ ms2str(lengthComputed) }}</span>
        </div>
        <div class="player-spacer"></div>
        <div class="player-control">
          <span class="player-control-label">{{ tt.speed() }}</span>
          <button
            type="button"
            class="player-speed"
            @click="tooglePopover"
            @wheel="handlePopBtnWheel"
            v-tooltip="tipMultiLine(tt.playOptions(), tt.playOptionsWheel())"
          >
            {{ playbackRateRef.toFixed(1) }}×
          </button>
          <Popover ref="popover"> <PopoverPane /> </Popover>
        </div>
        <div class="player-control">
          <span class="player-control-label">{{ tt.volume() }}</span>
          <Slider class="player-mini-slider" :min="0" :max="100" v-model="volumePercent" />
        </div>
        <div class="player-control">
          <span class="player-control-label">{{ tt.zoom() }}</span>
          <Slider
            class="player-mini-slider"
            :min="0"
            :max="100"
            v-model="zoomPercent"
            :disabled="!showSpectrogram"
          />
        </div>
        <div class="player-tools">
          <Button
            :icon="`mdi ${loading ? 'mdi-refresh' : 'mdi-folder-music-outline'}`"
            :disabled="loading"
            severity="secondary"
            variant="text"
            @click="() => handleSelectFile()"
            v-tooltip="tipHotkey(tt.chooseAudioFile(), 'chooseMedia')"
          />
          <Button
            icon="mdi mdi-chart-box-outline"
            :severity="showSpectrogram ? 'primary' : 'secondary'"
            :variant="showSpectrogram ? undefined : 'text'"
            @click="showSpectrogram = !showSpectrogram"
            v-tooltip="
              !compatibilityMap.sharedArrayBuffer
                ? tt.spectrogramUnavailable()
                : showSpectrogram
                  ? tt.hideSpectrogram()
                  : tt.showSpectrogram()
            "
            :disabled="!compatibilityMap.sharedArrayBuffer"
          />
        </div>
      </div>
      <div class="player-overview">
        <Waveform :show-view-region="showSpectrogram" />
      </div>
      <KeepAlive>
        <Spectrogram v-if="showSpectrogram" class="spectrogram-view" />
      </KeepAlive>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { clamp } from 'lodash-es'
import { computed, ref, useTemplateRef } from 'vue'

import { audioEngine } from '@core/audio'
import { compatibilityMap } from '@core/compat'
import { fileBackend, possibleAudioExts } from '@core/file'
import { useGlobalKeyboard } from '@core/hotkey'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampScroll,
  clampZoom,
  spectrogramViewport,
} from '@core/spectrogram/viewport'

import { usePrefStore } from '@states/stores'

import { ms2str } from '@utils/formatTime'
import { tipHotkey, tipMultiLine } from '@utils/generateTooltip'

import PopoverPane from './Popover.vue'
import Waveform from './Waveform.vue'
import Spectrogram from './spectrogram/Spectrogram.vue'
import { Button, Card, Popover, Slider, useToast } from 'primevue'

const tt = t.player

const {
  playingComputed,
  activatedRef,
  amendedProgressComputed,
  lengthComputed,
  playbackRateRef,
  volumeRef,
} = audioEngine
const playPauseButton = useTemplateRef('playPauseButton')

const toast = useToast()

const isUserAbortError = (e: unknown) => {
  const err = e as Error
  return (
    err.message.includes('The user aborted a request') ||
    err.message.includes('is not allowed by the user agent')
  )
}
async function handleSelectFile() {
  try {
    loading.value = true
    const result = await fileBackend.read(
      'amll-editor-audio',
      [
        {
          description: tt.allSupportedFormats(),
          accept: { 'audio/*': possibleAudioExts.map((ext) => `.${ext}`) },
        },
      ],
      'music',
    )
    audioEngine.mount(new File([result.blob], result.filename))
    // loading will be set to false on audio loaded event
  } catch (e) {
    loading.value = false
    const detail = isUserAbortError(e) ? tt.failedToLoadAudio.detailAborted() : String(e)
    toast.add({
      severity: 'error',
      summary: tt.failedToLoadAudio.summary(),
      detail: detail,
      life: 3000,
    })
  }
}

const loading = ref(false)
audioEngine.onLoadStart(() => (loading.value = true))
audioEngine.onLoaded(() => {
  loading.value = false
  toast.add({
    severity: 'success',
    summary: tt.loadAudioSuccess(),
    detail: audioEngine.filenameComputed.value,
    life: 3000,
  })
})

useGlobalKeyboard('chooseMedia', () => handleSelectFile())
useGlobalKeyboard('playPauseAudio', () => {
  if (activatedRef.value) audioEngine.togglePlay()
  if (playPauseButton.value) ((playPauseButton.value as any).$el as HTMLButtonElement).focus()
})
useGlobalKeyboard('volumeDown', () => {
  audioEngine.volumeRef.value = Math.max(0, audioEngine.volumeRef.value - 0.1)
})
useGlobalKeyboard('volumeUp', () => {
  audioEngine.volumeRef.value = Math.min(1, audioEngine.volumeRef.value + 0.1)
})

const prefStore = usePrefStore()
const optimizedStep = computed(
  () => (prefStore.audioSeekingStepMs || 5000) * audioEngine.playbackRateRef.value,
)
useGlobalKeyboard('seekBackward', () => {
  audioEngine.seekBy(-optimizedStep.value)
})
useGlobalKeyboard('seekForward', () => {
  audioEngine.seekBy(optimizedStep.value)
})

const popover = useTemplateRef('popover')
const tooglePopover = (e: MouseEvent) => popover.value?.toggle(e)
function handlePopBtnWheel(e: WheelEvent) {
  if (!e.deltaY) return
  popover.value?.show(e)
  audioEngine.volumeRef.value = clamp(
    audioEngine.volumeRef.value - Math.sign(e.deltaY) * 0.05,
    0,
    1,
  )
}

// Open with the spectrogram showing, like the design, whenever the browser can compute it
const showSpectrogram = ref(compatibilityMap.sharedArrayBuffer)

const volumePercent = computed({
  get: () => Math.round(volumeRef.value * 100),
  set: (value: number) => (volumeRef.value = clamp(value / 100, 0, 1)),
})

// Zoom is exponential in pixels per second, so the slider works on a log scale. Zooming keeps
// the middle of the view where it is.
const { zoom, scrollLeft, containerWidth } = spectrogramViewport
const LOG_RANGE = Math.log(MAX_ZOOM / MIN_ZOOM)
const zoomPercent = computed({
  get: () => (Math.log(clampZoom(zoom.value) / MIN_ZOOM) / LOG_RANGE) * 100,
  set: (value: number) => {
    const next = clampZoom(MIN_ZOOM * Math.exp((value / 100) * LOG_RANGE))
    const middleSec = (scrollLeft.value + containerWidth.value / 2) / zoom.value
    zoom.value = next
    scrollLeft.value = clampScroll(
      middleSec * next - containerWidth.value / 2,
      next,
      lengthComputed.value / 1000,
      containerWidth.value,
    )
  },
})
</script>

<style lang="scss">
.player {
  border: 1px solid var(--p-content-border-color);
  overflow: hidden;
  margin: 0 0.5rem;
  display: flex;
  flex-direction: column;

  .p-card-body {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .p-card-content {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .player-toolbar {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0.6rem 1rem;
  }
  .player-transport {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .player-play {
    flex-shrink: 0;
    width: 2.6rem;
    height: 2.6rem;
  }
  .player-time {
    display: flex;
    align-items: baseline;
    white-space: pre;
    font-size: 1.05rem;
  }
  .player-time-now {
    color: var(--p-primary-color);
    font-weight: 500;
  }
  .player-time-total {
    color: var(--p-text-muted-color);
  }
  .player-spacer {
    flex: 1;
  }
  .player-control {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
  }
  .player-speed {
    padding: 0.2rem 0.6rem;
    border-radius: 8px;
    border: 1px solid var(--p-content-border-color);
    background: var(--p-content-background);
    color: var(--p-text-color);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    &:hover {
      border-color: var(--p-primary-color);
    }
  }
  .player-mini-slider {
    width: 7rem;
    --p-slider-track-size: 4px;
    --p-slider-range-background: var(--p-primary-color);
    --p-slider-track-background: var(--p-content-border-color);
    --p-slider-handle-width: 0.8rem;
    --p-slider-handle-height: 0.8rem;
  }
  .player-tools {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .player-overview {
    display: flex;
    height: 2.2rem;
    margin: 0 1rem 0.5rem;
  }
  .waveform {
    border: 1px solid var(--p-content-border-color);
    border-radius: 10px;
    background: var(--global-background);
  }
}
</style>
