<template>
  <div class="window-controls">
    <button type="button" class="wc-btn" title="Minimize" aria-label="Minimize" @click="minimize">
      <i class="mdi mdi-window-minimize" />
    </button>
    <button
      type="button"
      class="wc-btn"
      :title="maximized ? 'Restore' : 'Maximize'"
      :aria-label="maximized ? 'Restore' : 'Maximize'"
      @click="toggleMaximize"
    >
      <i :class="maximized ? 'mdi mdi-window-restore' : 'mdi mdi-window-maximize'" />
    </button>
    <button type="button" class="wc-btn close" title="Close" aria-label="Close" @click="close">
      <i class="mdi mdi-window-close" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

// Talks to the desktop app's window through Tauri's built-in IPC. This is only mounted inside
// the desktop app (see Titlebar.vue), so there is no npm package to install for it.
const invoke = (
  window as unknown as {
    __TAURI_INTERNALS__: { invoke: (cmd: string, args?: object) => Promise<unknown> }
  }
).__TAURI_INTERNALS__.invoke
const call = (command: string) => invoke(`plugin:window|${command}`, { label: 'main' })

const maximized = ref(false)
async function refreshMaximized() {
  try {
    maximized.value = Boolean(await call('is_maximized'))
  } catch (e) {
    console.error(e)
  }
}

const minimize = () => void call('minimize')
const toggleMaximize = () => void call('toggle_maximize')
const close = () => void call('close')

onMounted(() => {
  void refreshMaximized()
  window.addEventListener('resize', refreshMaximized)
})
onUnmounted(() => window.removeEventListener('resize', refreshMaximized))
</script>

<style lang="scss" scoped>
.window-controls {
  display: flex;
  align-items: stretch;
  margin-left: 0.5rem;
}
.wc-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  border: none;
  border-radius: var(--p-content-border-radius);
  background: transparent;
  color: var(--p-button-text-secondary-color, inherit);
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.15s;
  &:hover {
    background: var(--p-content-hover-background);
  }
  &.close:hover {
    background: #e5484d;
    color: #fff;
  }
}
</style>
