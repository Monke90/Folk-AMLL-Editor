import { debounce } from 'lodash-es'
import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'

import { loadPreference, savePreference } from '@core/pref'

export const usePrefStore = defineStore('preference', () => {
  const state = reactive(loadPreference())
  // Saving compares and serializes every preference, so batch rapid changes (e.g. dragging a
  // slider) into one write
  const save = debounce(() => savePreference(state), 300)
  watch(() => state, save, { deep: true })
  window.addEventListener('pagehide', () => save.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save.flush()
  })
  return { ...toRefs(state) }
})
