<template>
  <aside class="timing-helper">
    <span class="helper-title">{{ tt.nowTiming() }}</span>
    <div class="helper-current" :class="{ empty: !currentSyl }">
      <template v-if="currentSyl">
        <span class="helper-current-text">{{ currentSyl.text }}</span>
        <span class="helper-current-time monospace">
          {{ ms2str(currentSyl.startTime) }} → {{ ms2str(currentSyl.endTime) }}
        </span>
      </template>
      <span v-else class="helper-current-hint">{{ tt.nothingSelected() }}</span>
    </div>
    <span class="helper-title">{{ tt.hotkeys() }}</span>
    <div class="helper-keys">
      <template v-for="cmd in commands" :key="cmd">
        <template v-if="hotkeyStr(cmd)">
          <span class="helper-key-label">{{ t.hotkey.commands[cmd]() }}</span>
          <kbd class="helper-key monospace">{{ hotkeyStr(cmd) }}</kbd>
        </template>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed } from 'vue'

import { type HotKey, getHotkeyStr } from '@core/hotkey'

import { usePrefStore, useRuntimeStore } from '@states/stores'

import { ms2str } from '@utils/formatTime'

const tt = t.editor.timingHelper

const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()

const commands = [
  'markBegin',
  'markEndBegin',
  'markEnd',
  'goPrevSyl',
  'goNextSyl',
  'playCurrSyl',
] as const satisfies HotKey.Command[]

const currentSyl = computed(() => {
  const first = runtimeStore.selectedSyllables.values().next()
  return first.done ? null : first.value
})
// Reading the map here keeps the list in step with rebinding in Preferences
const hotkeyStr = (cmd: HotKey.Command) => (prefStore.hotkeyMap[cmd] ? getHotkeyStr(cmd) : '')
</script>

<style lang="scss">
.timing-helper {
  width: 16rem;
  align-self: stretch;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  margin: 0.25rem 1rem 0.25rem 0;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.7rem;
  background: var(--p-content-background);
  overflow-y: auto;
  @media screen and (max-width: 1100px) {
    display: none;
  }
}
.helper-title {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}
.helper-current {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.8rem;
  border: 1px solid var(--p-primary-color);
  border-radius: var(--p-border-radius-lg);
  background: color-mix(in srgb, var(--p-primary-color), transparent 90%);
  &.empty {
    border-color: var(--p-content-border-color);
    background: transparent;
  }
}
.helper-current-text {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--p-primary-color);
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}
.helper-current-time {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}
.helper-current-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}
.helper-keys {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.5rem 0.6rem;
  font-size: 0.85rem;
}
.helper-key {
  padding: 0.15rem 0.5rem;
  border-radius: var(--p-border-radius-md);
  border: 1px solid var(--p-form-field-border-color);
  background: var(--p-form-field-background);
  font-size: 0.75rem;
}
</style>
