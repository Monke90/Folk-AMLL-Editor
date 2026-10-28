<template>
  <div class="import-options">
    <section class="group">
      <div class="group-head">
        <span class="group-title">{{ tt.cleanUp.title() }}</span>
        <Button
          v-if="canRestore"
          :label="tt.cleanUp.restore()"
          icon="mdi mdi-undo-variant"
          variant="text"
          severity="secondary"
          size="small"
          @click="emit('restore')"
        />
      </div>
      <button type="button" class="tool" :disabled="!hasText" @click="emit('process')">
        <i class="mdi mdi-auto-fix tool-icon" aria-hidden="true" />
        <span class="tool-text">
          <span class="tool-label">{{ tt.cleanUp.process() }}</span>
          <span class="hint">{{ tt.cleanUp.processHint() }}</span>
        </span>
      </button>
      <div class="steps">
        <button
          type="button"
          class="disclosure"
          :aria-expanded="prefs.processStepsOpen"
          @click="prefs.processStepsOpen = !prefs.processStepsOpen"
        >
          <i class="mdi mdi-chevron-right chevron" :class="{ open: prefs.processStepsOpen }" />
          <span>{{ tt.steps.advanced() }}</span>
        </button>
        <AnimatedFold :folded="!prefs.processStepsOpen">
          <label v-for="key in processStepKeys" :key="key" class="step-row">
            <span class="tool-text">
              <span>{{ tt.steps[key]() }}</span>
              <span class="hint">{{ tt.steps[`${key}Hint`]() }}</span>
            </span>
            <ToggleSwitch
              :model-value="stepEnabled(key)"
              @update:model-value="(value: boolean) => setStep(key, value)"
            />
          </label>
        </AnimatedFold>
      </div>
      <button type="button" class="tool" :disabled="!canSplit || splitting" @click="emit('split')">
        <i
          :class="splitting ? 'pi pi-spin pi-spinner' : 'mdi mdi-scissors-cutting'"
          class="tool-icon"
          aria-hidden="true"
        />
        <span class="tool-text">
          <span class="tool-label">{{ tt.cleanUp.split() }}</span>
          <span class="hint">{{ tt.cleanUp.splitHint() }}</span>
        </span>
      </button>
      <label class="field">
        <span class="field-label">{{ tt.cleanUp.splitEngine() }}</span>
        <Select
          v-model="prefs.syllableEngine"
          :options="engineOptions"
          optionLabel="name"
          optionValue="key"
          fluid
        />
      </label>
    </section>

    <section class="group">
      <div class="group-head">
        <span class="group-title">{{ tt.normalize.title() }}</span>
      </div>
      <label class="switch-row">
        <span class="tool-text">
          <span>{{ tt.normalize.apostrophes() }}</span>
          <span class="hint">{{ tt.normalize.apostrophesHint() }}</span>
        </span>
        <ToggleSwitch v-model="prefs.normalizeApostrophes" />
      </label>
      <label class="switch-row">
        <span class="tool-text">
          <span>{{ tt.normalize.cyrillicEs() }}</span>
          <span class="hint">{{ tt.normalize.cyrillicEsHint() }}</span>
        </span>
        <ToggleSwitch v-model="prefs.normalizeCyrillicEs" />
      </label>
    </section>

    <label class="switch-row" v-if="showSongwriters">
      <span>{{ tt.songwriters() }}</span>
      <ToggleSwitch v-model="prefs.fetchSongwriters" />
    </label>

    <section class="group">
      <button
        type="button"
        class="disclosure"
        :aria-expanded="formatOpen"
        @click="formatOpen = !formatOpen"
      >
        <i class="mdi mdi-chevron-right chevron" :class="{ open: formatOpen }" />
        <span class="group-title">{{ tt.format.title() }}</span>
      </button>
      <AnimatedFold :folded="!formatOpen">
        <div class="format-fields">
          <label class="field">
            <span class="field-label">{{ tt.format.mode() }}</span>
            <Select
              v-model="prefs.mode"
              :options="modeItems"
              optionLabel="label"
              optionValue="value"
              fluid
            />
          </label>
          <template v-if="prefs.mode !== 'lyric'">
            <label class="field">
              <span class="field-label">{{ tt.format.layout() }}</span>
              <Select
                v-model="prefs.layout"
                :options="layoutItems"
                optionLabel="label"
                optionValue="value"
                fluid
              />
            </label>
            <label class="field" v-if="prefs.layout === 'same-line-separator'">
              <span class="field-label">{{ tt.format.lineSeparator() }}</span>
              <InputText v-model="prefs.lineSeparator" fluid />
            </label>
            <label class="switch-row">
              <span>{{ tt.format.swap() }}</span>
              <ToggleSwitch v-model="prefs.swapTransAndRoman" />
            </label>
          </template>
          <label class="field">
            <span class="field-label">{{ tt.format.wordSeparator() }}</span>
            <InputText v-model="prefs.wordSeparator" fluid />
          </label>
          <label class="switch-row">
            <span>{{ tt.format.usePrefixes() }}</span>
            <ToggleSwitch v-model="prefs.usePrefixes" />
          </label>
          <template v-if="prefs.usePrefixes">
            <label class="field">
              <span class="field-label">{{ tt.format.bgPrefix() }}</span>
              <InputText v-model="prefs.bgPrefix" fluid />
            </label>
            <label class="field">
              <span class="field-label">{{ tt.format.duetPrefix() }}</span>
              <InputText v-model="prefs.duetPrefix" fluid />
            </label>
          </template>
        </div>
      </AnimatedFold>
    </section>
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, ref } from 'vue'

import { DEFAULT_LYRIC_PREP_OPTIONS, type LyricPrepOptions } from '@core/lyricsImport/lyricPrep'
import { lyricsImportPrefs as prefs } from '@core/lyricsImport/storage'
import engines from '@core/syllabify'

import AnimatedFold from '@ui/components/AnimatedFold.vue'
import { Button, InputText, Select, ToggleSwitch } from 'primevue'

const tt = t.importLyrics

defineProps<{
  hasText: boolean
  canRestore: boolean
  canSplit: boolean
  splitting: boolean
  /** Whether the picked song came from Genius, which is where songwriters are fetched from */
  showSongwriters: boolean
}>()
const emit = defineEmits<{ process: []; split: []; restore: [] }>()

/** The steps Process lyrics runs, each with its own switch */
const processStepKeys = [
  'removeInlineBrackets',
  'backgroundVocals',
  'capitalizeBackground',
  'emDashes',
  'splitHyphens',
  'splitCjk',
  'punctuationSpacing',
  'collapseSpaces',
  'splitWords',
] as const satisfies readonly (keyof LyricPrepOptions)[]

const stepEnabled = (key: keyof LyricPrepOptions) =>
  prefs.value.processSteps[key] ?? DEFAULT_LYRIC_PREP_OPTIONS[key]
function setStep(key: keyof LyricPrepOptions, value: boolean) {
  prefs.value.processSteps = { ...prefs.value.processSteps, [key]: value }
}

const engineOptions = engines.map(({ key, name }) => ({ key, name }))

const formatOpen = ref(false)
const modeItems = computed(() => [
  { value: 'lyric', label: tt.format.modes.lyric() },
  { value: 'lyric-trans', label: tt.format.modes.lyricTrans() },
  { value: 'lyric-roman', label: tt.format.modes.lyricRoman() },
  { value: 'lyric-trans-roman', label: tt.format.modes.lyricTransRoman() },
])
const layoutItems = computed(() => [
  { value: 'interleaved-line', label: tt.format.layouts.interleavedLine() },
  { value: 'same-line-separator', label: tt.format.layouts.sameLineSeparator() },
])
</script>

<style lang="scss" scoped>
.import-options {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.group-title {
  font-weight: 600;
}
.hint {
  font-size: 0.8rem;
  opacity: 0.65;
}
.tool {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: var(--p-content-hover-background);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .tool-icon {
    margin-top: 0.1rem;
    font-size: 1.2rem;
    color: var(--p-primary-color);
  }
}
.tool-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.tool-label {
  font-weight: 500;
}
.disclosure {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  align-self: flex-start;
  padding: 0.15rem 0.1rem;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  .chevron {
    transition: transform 0.2s var(--global-ease);
    &.open {
      transform: rotate(90deg);
    }
  }
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-left: 0.4rem;
}
.step-row,
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.25rem 0;
  cursor: pointer;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  .field-label {
    font-size: 0.9rem;
    opacity: 0.8;
  }
}
.format-fields {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 0.4rem;
}
</style>
