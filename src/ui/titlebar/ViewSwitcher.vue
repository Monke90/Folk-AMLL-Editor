<script setup lang="ts">
import { t } from '@i18n'
import { nextTick, ref, watch } from 'vue'

import { View } from '@core/types'

import { useRuntimeStore } from '@states/stores'

import { SelectButton } from 'primevue'

const tt = t.titlebar.view

const runtimeStore = useRuntimeStore()

// Middle view selector
const viewOptions = [
  { name: tt.content(), value: View.Content, icon: 'mdi-format-align-left' },
  { name: tt.timing(), value: View.Timing, icon: 'mdi-clock-outline' },
  { name: tt.preview(), value: View.Preview, icon: 'mdi-eye-outline' },
]

const stateToView = () => viewOptions.find((v) => v.value === runtimeStore.currentView)!
const viewHandler = ref<(typeof viewOptions)[number] | null>(stateToView())
watch(viewHandler, (value) => {
  if (!value) nextTick(() => (viewHandler.value = stateToView()))
  else runtimeStore.currentView = value.value
})
watch(
  () => runtimeStore.currentView,
  () => (viewHandler.value = stateToView()),
)
</script>

<template>
  <SelectButton
    v-model="viewHandler"
    :options="viewOptions"
    optionLabel="name"
    optionDisabled="disabled"
    size="large"
    class="view-switcher"
  >
    <template #option="{ option }">
      <i :class="['mdi', option.icon, 'view-switcher-icon']" aria-hidden="true"></i>
      <span>{{ option.name }}</span>
    </template>
  </SelectButton>
</template>

<style lang="scss">
.view-switcher.view-switcher {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  .p-togglebutton-content {
    gap: 0.45rem;
  }
  .view-switcher-icon {
    font-size: 1.15em;
  }
}
</style>
