<template>
  <div
    class="tsyl"
    @mousedown.stop="handleMouseDown"
    :class="{ selected: isSelected, active: isActive }"
  >
    <Timestamp
      class="tsyl-timestamp"
      begin
      v-model="props.syllable.startTime"
      v-tooltip="tt.startTime()"
    />
    <div class="tsyl-content">
      <i
        v-if="props.syllable.bookmarked"
        class="pi pi-bookmark-fill"
        style="color: var(--p-button-text-warn-color); margin-right: 0.3em"
      ></i>
      <span class="tsyl-text" @dblclick="handleTextDbClick">
        {{ props.syllable.text }}
      </span>
    </div>
    <div class="tsyl-bar" aria-hidden="true">
      <i :style="{ width: `${fillPercent}%` }"></i>
    </div>
    <Timestamp
      class="tsyl-timestamp"
      end
      v-model="props.syllable.endTime"
      v-tooltip="tt.endTime()"
    />
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { type LyricLine, type LyricSyllable, View } from '@core/types'

import { usePrefStore, useRuntimeStore, useStaticStore } from '@states/stores'

import { forceOutsideBlur } from '@utils/forceOutsideBlur'
import { tryRaf } from '@utils/tryRaf'

import Timestamp from './Timestamp.vue'

const tt = t.editor.syllable

const props = defineProps<{
  syllable: LyricSyllable
  parent: LyricLine
  parentIndex: number
}>()
const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()
function handleMouseDown() {
  forceOutsideBlur()
  runtimeStore.selectLineSyl(props.parent, props.syllable)
}
const isSelected = computed(() => {
  return runtimeStore.selectedSyllables.has(props.syllable)
})

const isActive = computed(
  () =>
    (props.syllable.startTime || props.syllable.endTime) &&
    audioEngine.amendedProgressComputed.value >= props.syllable.startTime &&
    audioEngine.amendedProgressComputed.value <= props.syllable.endTime,
)

// How much of the syllable's bar is filled: nothing until it has a duration, the playback
// position while it is playing, and full once timed. Only the playing syllable follows the
// playhead, so the rest do not re-render on every frame.
const fillPercent = computed(() => {
  const { startTime, endTime } = props.syllable
  if (!(endTime > startTime)) return 0
  if (!isActive.value) return 100
  const played = (audioEngine.amendedProgressComputed.value - startTime) / (endTime - startTime)
  return Math.min(100, Math.max(0, played * 100))
})

const emit = defineEmits<{
  (e: 'needScroll', parentIndex: number): void
}>()
watch([isActive, () => prefStore.scrollWithPlayback], () => {
  if (props.parent.background) return
  if (isActive.value && prefStore.scrollWithPlayback) emit('needScroll', props.parentIndex)
})
// watch([isSelected, () => prefStore.scrollWithPlayback], () => {
//   if (isSelected.value && !prefStore.scrollWithPlayback) emit('needScroll', props.parentIndex)
// })

function handleTextDbClick() {
  runtimeStore.currentView = View.Content
  const id = props.syllable.id
  tryRaf(() => {
    const hooks = useStaticStore().syllableHooks.get(id)
    if (hooks) {
      hooks.focusInput()
      return true
    }
  })
}
</script>

<style lang="scss">
// Each syllable is a small card: start time on top, the word in a chip, a bar showing how much
// of it is timed, and the end time at the bottom.
.tsyl {
  min-height: calc(var(--syl-height) - 1.4rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin: 0.45rem 0.2rem;
  padding: 0.4rem 0.45rem;
  border: 1px solid transparent;
  border-radius: 0.7rem;
  transition:
    border-color 0.1s,
    background-color 0.1s;
  &:hover {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 94%);
  }
  &.selected {
    border-color: var(--p-primary-color);
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 90%);
    transition: none;
    .tsyl-timestamp {
      opacity: 1;
    }
    .tsyl-content {
      border-color: var(--p-primary-color);
    }
  }
  &.active {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 82%);
    .tsyl-content {
      color: var(--p-primary-color);
      border-color: var(--p-primary-color);
      background-color: color-mix(in srgb, var(--p-primary-color), transparent 85%);
    }
  }
}
.tsyl-timestamp {
  opacity: 0.8;
  .timestamp-caption,
  .timestamp-input {
    width: 8.5ch;
    font-size: 0.78rem;
    text-align: center;
  }
}
.tsyl-content {
  min-width: 3rem;
  padding: 0.3rem 0.8rem;
  text-align: center;
  font-size: 1.35rem;
  font-weight: 500;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.55rem;
  background-color: var(--p-content-background);
  transition:
    border-color 0.1s,
    color 0.1s,
    background-color 0.1s;
}
.tsyl-text {
  white-space: pre;
}
.tsyl-bar {
  align-self: stretch;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background-color: var(--p-content-border-color);
  i {
    display: block;
    height: 100%;
    border-radius: 2px;
    background-color: var(--p-primary-color);
  }
}
</style>
