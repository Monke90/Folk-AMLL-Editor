<template>
  <div class="plain-import">
    <div class="editor-col">
      <div class="col-label">{{ tt.plain.editorLabel() }}</div>
      <CodeMirror class="editor" v-model:content="text" showLineNumbers />
    </div>
    <div class="options-col">
      <div class="col-label">{{ tt.plain.optionsLabel() }}</div>
      <div class="field">
        <label>{{ tt.plain.mode() }}</label>
        <Select v-model="prefs.mode" :options="modeItems" optionLabel="label" optionValue="value" />
      </div>
      <div class="field" v-if="prefs.mode !== 'lyric'">
        <label>{{ tt.plain.layout() }}</label>
        <Select
          v-model="prefs.layout"
          :options="layoutItems"
          optionLabel="label"
          optionValue="value"
        />
      </div>
      <div class="field" v-if="prefs.mode !== 'lyric' && prefs.layout === 'same-line-separator'">
        <label for="il-line-sep">{{ tt.plain.lineSeparator() }}</label>
        <InputText id="il-line-sep" v-model="prefs.lineSeparator" />
      </div>
      <div class="field row" v-if="prefs.mode === 'lyric-trans-roman'">
        <ToggleSwitch v-model="prefs.swapTransAndRoman" input-id="il-swap" />
        <label for="il-swap">{{ tt.plain.swap() }}</label>
      </div>
      <div class="field">
        <label for="il-word-sep">{{ tt.plain.wordSeparator() }}</label>
        <InputText id="il-word-sep" v-model="prefs.wordSeparator" />
        <small>{{ tt.plain.wordSeparatorTip() }}</small>
      </div>
      <div class="field row">
        <ToggleSwitch v-model="prefs.usePrefixes" input-id="il-prefixes" />
        <label for="il-prefixes">{{ tt.plain.usePrefixes() }}</label>
      </div>
      <template v-if="prefs.usePrefixes">
        <div class="field">
          <label for="il-bg">{{ tt.plain.bgPrefix() }}</label>
          <InputText id="il-bg" v-model="prefs.bgPrefix" />
        </div>
        <div class="field">
          <label for="il-duet">{{ tt.plain.duetPrefix() }}</label>
          <InputText id="il-duet" v-model="prefs.duetPrefix" />
        </div>
      </template>
      <div class="field">
        <Button
          :label="tt.plain.processLyrics()"
          icon="mdi mdi-auto-fix"
          severity="secondary"
          @click="processLyrics"
        />
        <small>{{ tt.plain.processLyricsTip() }}</small>
      </div>
    </div>
    <div class="actions">
      <Button
        :label="tt.cancel()"
        icon="mdi mdi-close"
        severity="secondary"
        @click="emit('close')"
      />
      <Button
        :label="tt.import()"
        icon="mdi mdi-arrow-right"
        :disabled="!text.trim()"
        @click="doImport"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, ref } from 'vue'

import { fileState as FS } from '@core/file'
import { prepareTextImport } from '@core/lyricsImport/lyricPrep'
import { lyricsImportPrefs as prefs } from '@core/lyricsImport/storage'
import { textToLineDrafts } from '@core/lyricsImport/textToLines'
import { draftsToPersist } from '@core/lyricsImport/toPersist'

import CodeMirror from '@ui/components/CodeMirror.vue'
import { Button, InputText, Select, ToggleSwitch, useToast } from 'primevue'

const tt = t.importLyrics
const toast = useToast()
const emit = defineEmits<{ close: [] }>()

const text = ref('')

const modeItems = computed(() => [
  { value: 'lyric', label: tt.plain.modes.lyric() },
  { value: 'lyric-trans', label: tt.plain.modes.lyricTrans() },
  { value: 'lyric-roman', label: tt.plain.modes.lyricRoman() },
  { value: 'lyric-trans-roman', label: tt.plain.modes.lyricTransRoman() },
])
const layoutItems = computed(() => [
  { value: 'interleaved-line', label: tt.plain.layouts.interleavedLine() },
  { value: 'same-line-separator', label: tt.plain.layouts.sameLineSeparator() },
])

/** Clean up pasted lyrics: drop section headers, split words, turn (parentheses) into bg lines */
function processLyrics() {
  text.value = prepareTextImport(text.value, false)
  prefs.value.wordSeparator = '\\'
  prefs.value.usePrefixes = true
}

async function doImport() {
  const p = prefs.value
  const drafts = textToLineDrafts(text.value, {
    mode: p.mode,
    layout: p.layout,
    lineSeparator: p.lineSeparator,
    swapTransAndRoman: p.swapTransAndRoman,
    wordSeparator: p.wordSeparator,
    backgroundPrefix: p.usePrefixes ? p.bgPrefix : '',
    duetPrefix: p.usePrefixes ? p.duetPrefix : '',
  })
  if (!drafts.length) {
    toast.add({ severity: 'warn', summary: tt.plain.empty(), life: 3000 })
    return
  }
  try {
    await FS.importPersist(draftsToPersist(drafts))
  } catch (e) {
    // The user cancelled the unsaved-changes confirmation
    if (e instanceof Error && e.message === 'The user aborted a request.') return
    console.error(e)
    toast.add({ severity: 'error', summary: tt.importFailed(), detail: String(e), life: 5000 })
    return
  }
  toast.add({ severity: 'success', summary: tt.imported(drafts.length), life: 3000 })
  emit('close')
}
</script>

<style lang="scss" scoped>
.plain-import {
  display: grid;
  grid-template-columns: 1fr 18rem;
  grid-template-rows: 1fr auto;
  gap: 0.8rem 1rem;
  height: 100%;
  min-height: 0;
}
.editor-col,
.options-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
}
.options-col {
  overflow-y: auto;
  padding-right: 0.3rem;
}
.editor {
  flex: 1;
  height: 0;
}
.col-label {
  opacity: 0.9;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  &.row {
    flex-direction: row;
    align-items: center;
    gap: 0.6rem;
  }
  small {
    opacity: 0.7;
  }
}
.actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
</style>
