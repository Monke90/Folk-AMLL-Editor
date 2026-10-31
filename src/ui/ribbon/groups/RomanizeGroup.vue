<template>
  <RibbonGroup :label="tt.groupLabel()">
    <div class="romanize-grid">
      <Select
        v-model="language"
        class="romanize-language"
        size="small"
        :options="languageOptions"
        optionLabel="label"
        optionValue="value"
        :aria-label="tt.language()"
        v-tooltip="tipDesc(tt.language(), tt.languageDesc())"
      />
      <Button
        :label="tt.romanize()"
        :icon="loading ? 'pi pi-spin pi-spinner' : undefined"
        size="small"
        severity="secondary"
        :disabled="loading"
        @click="run"
        v-tooltip="tipDesc(tt.romanize(), tt.romanizeDesc())"
      />
      <div class="romanize-enabled-row">
        <label class="romanize-enabled" v-tooltip="tipDesc(tt.enabled(), tt.enabledDesc())">
          <span>{{ tt.enabled() }}</span>
          <ToggleSwitch v-model="prefStore.sylRomanEnabled" />
        </label>
        <button
          type="button"
          class="romanize-about"
          :aria-label="tt.aboutTitle()"
          @click="aboutPopover?.toggle($event)"
        >
          <i class="mdi mdi-help-circle-outline" />
        </button>
      </div>
      <Popover ref="aboutPopover">
        <div class="romanize-about-body">
          <strong>{{ tt.aboutTitle() }}</strong>
          <p>{{ tt.aboutHow() }}</p>
          <p>{{ tt.aboutCanDo() }}</p>
          <p>{{ tt.aboutCannotDo() }}</p>
        </div>
      </Popover>
    </div>
  </RibbonGroup>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, ref, useTemplateRef } from 'vue'

import { geniusAccessToken } from '@core/lyricsImport/storage'
import { type PhoneticLanguage, romanize } from '@core/romanize'

import { useCoreStore, usePrefStore, useRuntimeStore } from '@states/stores'

import { tipDesc } from '@utils/generateTooltip'

import RibbonGroup from '../RibbonGroupShell.vue'
import { Button, Popover, Select, ToggleSwitch, useToast } from 'primevue'

const tt = t.ribbon.romanize

const coreStore = useCoreStore()
const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()
const toast = useToast()

const language = ref<PhoneticLanguage>('auto')
const languageOptions = computed(() => [
  { label: tt.autoDetect(), value: 'auto' },
  { label: tt.ja(), value: 'ja' },
  { label: tt.zh(), value: 'zh' },
  { label: tt.yue(), value: 'yue' },
  { label: tt.ko(), value: 'ko' },
])
const aboutPopover = useTemplateRef('aboutPopover')

const loading = ref(false)
async function run() {
  const selectedSyllables = [...runtimeStore.selectedSyllables]
  const selectedLines = [...runtimeStore.selectedLines]
  if (selectedSyllables.length === 0 && selectedLines.length === 0) {
    toast.add({ severity: 'info', summary: tt.noSelection(), life: 3000 })
    return
  }
  loading.value = true
  try {
    const metadata = coreStore.metadata
    const report = await romanize({
      allLines: coreStore.lyricLines,
      selectedLines,
      selectedSyllables,
      language: language.value,
      geniusToken: geniusAccessToken.value,
      title: (metadata.musicName ?? metadata.ti)?.[0] ?? '',
      artist: metadata.artists?.[0] ?? '',
    })
    const total = report.fromGenius + report.fromFallback
    toast.add({
      severity: total > 0 ? 'success' : 'info',
      summary: total > 0 ? tt.done() : tt.nothingToRomanize(),
      detail:
        total > 0
          ? `${tt.sourceGenius()}: ${report.fromGenius} · ${tt.sourceFallback()}: ${report.fromFallback}`
          : undefined,
      life: 4000,
    })
  } catch (e) {
    console.error(e)
    toast.add({ severity: 'error', summary: tt.failed(), detail: String(e), life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss">
.romanize-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.5rem;
  align-items: center;
  align-content: center;
  justify-items: start;
  padding: 0 0.5rem;
  .romanize-language {
    min-width: 8.5rem;
  }
  .romanize-enabled-row {
    grid-column: 1 / span 2;
    justify-self: center;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .romanize-enabled {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    cursor: pointer;
  }
  .romanize-about {
    all: unset;
    cursor: pointer;
    color: var(--p-text-muted-color);
    display: flex;
    &:hover {
      color: var(--p-text-color);
    }
  }
}
.romanize-about-body {
  max-width: 20rem;
  font-size: 0.85rem;
  p {
    margin: 0.4rem 0 0;
  }
}
</style>
