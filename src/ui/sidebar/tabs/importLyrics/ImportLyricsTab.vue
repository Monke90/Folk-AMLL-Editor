<template>
  <div class="import-lyrics-panel">
    <SelectButton
      v-model="source"
      :options="sourceOptions"
      optionLabel="label"
      optionValue="value"
      :allowEmpty="false"
      :aria-label="tt.sourcesLabel()"
      class="source-picker"
    />

    <OnlineSearchBar
      v-if="onlineSource"
      v-model:query="query"
      :source="onlineSource"
      :searching="searching"
      @search="handleSearch"
    />

    <template v-if="resultsVisible">
      <OnlineResults
        :results="sortedResults"
        :searching="searching"
        :hasSearched="hasSearched"
        :error="error"
        :audioSeconds="audioSeconds"
        :loadingId="loadingId"
        :proxyCovers="onlineSource === 'genius'"
        @pick="handlePick"
      />
      <Button
        v-if="importText.trim()"
        class="link-button"
        :label="tt.online.backToText()"
        icon="mdi mdi-arrow-left"
        variant="text"
        severity="secondary"
        size="small"
        @click="showResults = false"
      />
    </template>
    <template v-else>
      <div class="error" v-if="error">{{ error }}</div>
      <Button
        v-if="onlineSource && hasSearched"
        class="link-button"
        :label="tt.online.showResults()"
        variant="text"
        severity="secondary"
        size="small"
        @click="showResults = true"
      />
      <div class="editor-wrap">
        <LyricMarkupEditor
          v-model="importText"
          :format="format"
          :ariaLabel="tt.textLabel()"
          :placeholder="tt.textPlaceholder()"
        />
      </div>
    </template>

    <div class="picked" v-if="pickedTrack">
      <span class="picked-text">{{
        tt.online.usingTrack(pickedTrack.track.name, pickedTrack.track.artist)
      }}</span>
      <Button
        icon="mdi mdi-close"
        variant="text"
        severity="secondary"
        size="small"
        :aria-label="tt.online.dropTrack()"
        :title="tt.online.dropTrack()"
        @click="pickedTrack = null"
      />
    </div>

    <ImportOptions
      :hasText="!!importText.trim()"
      :canRestore="originalText !== null"
      :canSplit="!!importText.trim() && !!format.wordSeparator"
      :splitting="splitting"
      :showSongwriters="pickedTrack?.source === 'genius'"
      @process="handleProcess"
      @split="handleSplit"
      @restore="handleRestore"
    />

    <div class="footer">
      <span class="line-count">{{ tt.lineCount(lineCount) }}</span>
      <Button
        :label="tt.import()"
        icon="mdi mdi-arrow-right"
        :disabled="lineCount === 0 || importing"
        :loading="importing"
        @click="doImport"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { cloneDeep } from 'lodash-es'
import { computed, onMounted, ref, toRaw, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { fileState as FS } from '@core/file'
import { importTextToDrafts, segmentImportTextAsync } from '@core/lyricsImport/importText'
import { DEFAULT_LYRIC_PREP_OPTIONS, prepareTextImport } from '@core/lyricsImport/lyricPrep'
import { normalizeDrafts } from '@core/lyricsImport/normalize'
import {
  ImportHttpError,
  applyGeniusSongMetadata,
  fetchGeniusSongwriters,
  searchTracks,
} from '@core/lyricsImport/sources'
import { geniusAccessToken, lyricsImportPrefs as prefs } from '@core/lyricsImport/storage'
import { draftsToPersist } from '@core/lyricsImport/toPersist'
import {
  applyTrackMetadata,
  prioritizeMatchingTracks,
  queryFromFilename,
} from '@core/lyricsImport/trackUtils'
import type {
  ImportSourceId,
  ImportTextFormat,
  ImportTrack,
  OnlineSourceId,
} from '@core/lyricsImport/types'
import engines from '@core/syllabify'

import { useCoreStore, useRuntimeStore } from '@states/stores'

import ImportOptions from './ImportOptions.vue'
import LyricMarkupEditor from './LyricMarkupEditor.vue'
import OnlineResults from './OnlineResults.vue'
import OnlineSearchBar from './OnlineSearchBar.vue'
import { importText, originalText, pickedTrack } from './state'
import { Button, SelectButton, useToast } from 'primevue'

const tt = t.importLyrics
const toast = useToast()
const coreStore = useCoreStore()
const runtimeStore = useRuntimeStore()

// Lyrically is not offered here, as in ttml-tool
const visibleSources: ImportSourceId[] = ['plainText', 'lrclib', 'genius']
const source = computed<ImportSourceId>({
  get: () => (visibleSources.includes(prefs.value.source) ? prefs.value.source : 'plainText'),
  set: (value) => (prefs.value.source = value),
})
const sourceOptions = computed(() => [
  { value: 'plainText', label: tt.sources.plainText() },
  { value: 'lrclib', label: tt.sources.lrclib() },
  { value: 'genius', label: tt.sources.genius() },
])
const onlineSource = computed<OnlineSourceId | null>(() =>
  source.value === 'plainText' ? null : (source.value as OnlineSourceId),
)

/** How the text area is read */
const format = computed<ImportTextFormat>(() => {
  const p = prefs.value
  return {
    mode: p.mode,
    layout: p.layout,
    lineSeparator: p.lineSeparator,
    swapTransAndRoman: p.swapTransAndRoman,
    wordSeparator: p.wordSeparator,
    usePrefixes: p.usePrefixes,
    bgPrefix: p.bgPrefix,
    duetPrefix: p.duetPrefix,
  }
})

// --- Online search ---

// Length of the loaded audio in seconds (0 when nothing is loaded)
const audioSeconds = computed(() => (audioEngine.lengthComputed.value ?? 0) / 1000)

/** "Title Artist" from the project's metadata, or else the audio file's name */
const suggestedQuery = computed(() => {
  const meta = coreStore.metadata
  const title = meta.musicName?.[0]?.trim()
  if (title) return [title, meta.artists?.[0]?.trim()].filter(Boolean).join(' ')
  return queryFromFilename(audioEngine.filenameComputed.value)
})

const query = ref(suggestedQuery.value)
const results = ref<ImportTrack[]>([])
const searching = ref(false)
const hasSearched = ref(false)
const showResults = ref(false)
const loadingId = ref<ImportTrack['id'] | null>(null)
const error = ref('')
const sortedResults = computed(() => prioritizeMatchingTracks(results.value, audioSeconds.value))

const resultsVisible = computed(
  () =>
    !!onlineSource.value &&
    showResults.value &&
    !(onlineSource.value === 'genius' && !geniusAccessToken.value),
)

// Tags can arrive after the panel opens; only replace a query that was filled in here
let prefilled = suggestedQuery.value
watch(suggestedQuery, (next) => {
  if (hasSearched.value) return
  if (!query.value || query.value === prefilled) query.value = next
  prefilled = next
})

function changeSource() {
  results.value = []
  hasSearched.value = false
  error.value = ''
  showResults.value = !!onlineSource.value && !importText.value.trim()
}
watch(source, changeSource)
onMounted(() => {
  showResults.value = !!onlineSource.value && !importText.value.trim()
})

function describeError(e: unknown, fallback: string): string {
  if (e instanceof ImportHttpError) {
    if (onlineSource.value === 'genius' && (e.status === 401 || e.status === 403))
      return tt.online.tokenRejected()
    return `${fallback}: ${e.message}`
  }
  return `${fallback}: ${String(e)}`
}

let searchSeq = 0
async function handleSearch() {
  const source = onlineSource.value
  const q = query.value.trim()
  if (!source || !q) return
  const seq = ++searchSeq
  searching.value = true
  hasSearched.value = true
  showResults.value = true
  error.value = ''
  results.value = []
  try {
    const found = await searchTracks(source, q, geniusAccessToken.value)
    if (seq !== searchSeq) return // a newer search superseded this one
    results.value = found
  } catch (e) {
    if (seq !== searchSeq) return
    if (source === 'genius' && e instanceof ImportHttpError && [401, 403].includes(e.status)) {
      // The stored token is bad: ask for a new one
      geniusAccessToken.value = ''
      error.value = tt.online.tokenRejected()
    } else error.value = describeError(e, tt.online.searchFailed())
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

async function handlePick(track: ImportTrack) {
  const source = onlineSource.value
  if (!source) return
  loadingId.value = track.id
  error.value = ''
  try {
    const lyrics = (
      track.lyrics !== undefined ? track.lyrics : track.fetchLyrics ? await track.fetchLyrics() : ''
    ).trim()
    if (!lyrics) {
      error.value = tt.online.noLyrics()
      return
    }
    importText.value = lyrics
    originalText.value = null
    pickedTrack.value = { track, source }
    showResults.value = false
  } catch (e) {
    error.value = describeError(e, tt.online.lyricsFailed())
  } finally {
    loadingId.value = null
  }
}

// --- Text tools ---

/** Text transforms keep the text from before the first one, to restore */
function transformText(next: string) {
  if (next === importText.value) return false
  originalText.value ??= importText.value
  importText.value = next
  return true
}

function handleProcess() {
  transformText(
    prepareTextImport(importText.value, true, {
      ...DEFAULT_LYRIC_PREP_OPTIONS,
      ...prefs.value.processSteps,
    }),
  )
  // Process lyrics writes this format
  prefs.value.wordSeparator = '\\'
  prefs.value.usePrefixes = true
  prefs.value.bgPrefix = '<'
  toast.add({ severity: 'success', summary: tt.cleanUp.processed(), life: 3000 })
}

const splitting = ref(false)
async function handleSplit() {
  const engine = engines.find(({ key }) => key === prefs.value.syllableEngine) ?? engines[0]
  if (!engine) return
  splitting.value = true
  try {
    const next = await segmentImportTextAsync(importText.value, format.value, async (words) => {
      const split = await engine.processor(words, [], false)
      return split.map((parts) =>
        parts.map((part) => (typeof part === 'string' ? part : part.text)),
      )
    })
    if (transformText(next))
      toast.add({ severity: 'success', summary: tt.cleanUp.splitDone(), life: 3000 })
    else toast.add({ severity: 'info', summary: tt.cleanUp.splitNothing(), life: 3000 })
  } catch (e) {
    console.error(e)
    toast.add({
      severity: 'error',
      summary: tt.cleanUp.splitFailed(),
      detail: String(e),
      life: 5000,
    })
  } finally {
    splitting.value = false
  }
}

function handleRestore() {
  if (originalText.value === null) return
  importText.value = originalText.value
  originalText.value = null
}

// --- Import ---

const lineCount = computed(() => {
  try {
    return importTextToDrafts(importText.value, format.value).length
  } catch {
    return 0
  }
})

const importing = ref(false)
async function doImport() {
  const drafts = normalizeDrafts(importTextToDrafts(importText.value, format.value), prefs.value)
  if (!drafts.length) {
    toast.add({ severity: 'warn', summary: tt.empty(), life: 3000 })
    return
  }
  const picked = pickedTrack.value
  // Song details already in the project stay; the import fills empty ones
  let metadata = cloneDeep(toRaw(coreStore.metadata))
  if (picked) metadata = applyTrackMetadata(metadata, picked.track)

  importing.value = true
  try {
    await FS.importPersist(draftsToPersist(drafts, metadata))
  } catch (e) {
    // The user cancelled the unsaved-changes confirmation
    if (e instanceof Error && e.message === 'The user aborted a request.') return
    console.error(e)
    toast.add({ severity: 'error', summary: tt.importFailed(), detail: String(e), life: 5000 })
    return
  } finally {
    importing.value = false
  }
  toast.add({ severity: 'success', summary: tt.imported(drafts.length), life: 3000 })
  importText.value = ''
  originalText.value = null
  pickedTrack.value = null
  runtimeStore.closeCurrentSidebar()

  if (picked?.source === 'genius' && prefs.value.fetchSongwriters && geniusAccessToken.value) {
    try {
      const result = await fetchGeniusSongwriters(picked.track.id, geniusAccessToken.value, {
        findRealNames: true,
      })
      if (result.songwriters.length)
        coreStore.metadata = applyGeniusSongMetadata(coreStore.metadata, result)
    } catch (e) {
      console.error('Genius songwriter fetch failed', e)
      toast.add({ severity: 'warn', summary: tt.songwritersFailed(), life: 4000 })
    }
  }
}
</script>

<style lang="scss" scoped>
.import-lyrics-panel {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-bottom: 0 !important;
}
.source-picker {
  display: flex;
  :deep(.p-togglebutton) {
    flex: 1;
  }
}
.error {
  color: var(--p-button-text-danger-color, var(--p-red-500));
}
.link-button {
  align-self: flex-start;
}
.editor-wrap {
  height: 22rem;
  min-height: 12rem;
  resize: vertical;
  overflow: hidden;
}
.picked {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  opacity: 0.8;
  .picked-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.5rem 0 0.3rem;
  background-color: var(--global-background);
  .line-count {
    font-size: 0.85rem;
    opacity: 0.7;
  }
}
</style>
