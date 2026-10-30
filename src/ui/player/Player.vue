<template>
  <Card class="player">
    <template #content>
      <KeepAlive>
        <Spectrogram v-if="showSpectrogram" class="spectrogram-view" />
      </KeepAlive>
      <div class="player-toolbar">
        <div class="player-group">
          <Button
            :icon="`mdi ${loading ? 'mdi-refresh' : 'mdi-folder-music-outline'}`"
            :disabled="loading"
            severity="secondary"
            variant="text"
            @click="() => handleSelectFile()"
            v-tooltip="tipHotkey(tt.chooseAudioFile(), 'chooseMedia')"
          />
          <Button
            icon="mdi mdi-tune-vertical"
            severity="secondary"
            variant="text"
            @click="tooglePopover"
            v-tooltip="tipMultiLine(tt.playOptions(), tt.playOptionsWheel())"
            @wheel="handlePopBtnWheel"
          />
          <Popover ref="popover"> <PopoverPane /> </Popover>
        </div>
        <div class="player-group player-transport">
          <Button
            icon="mdi mdi-rewind"
            severity="secondary"
            variant="text"
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
            icon="mdi mdi-fast-forward"
            severity="secondary"
            variant="text"
            :disabled="!activatedRef"
            @click="audioEngine.seekBy(optimizedStep)"
            v-tooltip="tipHotkey(t.hotkey.commands.seekForward(), 'seekForward')"
          />
        </div>
        <ProgressTime />
        <Waveform :show-view-region="showSpectrogram" />
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

import { usePrefStore } from '@states/stores'

import { tipHotkey, tipMultiLine } from '@utils/generateTooltip'

import PopoverPane from './Popover.vue'
import ProgressTime from './ProgressTime.vue'
import Waveform from './Waveform.vue'
import Spectrogram from './spectrogram/Spectrogram.vue'
import { Button, Card, Popover, useToast } from 'primevue'

const tt = t.player

const { playingComputed, activatedRef } = audioEngine
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

const showSpectrogram = ref(false)
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
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
  }
  .player-group {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding: 3px;
    border-radius: 12px;
    border: 1px solid var(--p-content-border-color);
    background: var(--global-background);
    flex-shrink: 0;
    --p-button-icon-only-width: 2.2rem;
  }
  .player-play {
    flex-shrink: 0;
    width: 2.6rem;
    height: 2.6rem;
    margin: 0 0.15rem;
  }
  .waveform {
    border: 1px solid var(--p-content-border-color);
    border-radius: 10px;
    background: var(--global-background);
  }
}
</style>
