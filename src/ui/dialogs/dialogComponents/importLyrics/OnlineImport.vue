<template>
  <div class="online-import">
    <!-- Genius needs the user's own access token first -->
    <div class="token-setup" v-if="source === 'genius' && !geniusAccessToken">
      <h3>{{ tt.online.tokenTitle() }}</h3>
      <p>{{ tt.online.tokenDesc() }}</p>
      <div class="token-links">
        <a :href="GENIUS_TOKEN_GUIDE_URL" target="_blank" rel="noopener noreferrer">{{
          tt.online.tokenGuide()
        }}</a>
        <a :href="GENIUS_API_CLIENTS_URL" target="_blank" rel="noopener noreferrer">{{
          tt.online.tokenCreate()
        }}</a>
      </div>
      <form class="token-form" @submit.prevent="saveToken">
        <InputText
          v-model="tokenInput"
          type="password"
          autocomplete="off"
          :placeholder="tt.online.tokenPlaceholder()"
        />
        <Button type="submit" :label="tt.online.tokenSave()" :disabled="!tokenInput.trim()" />
      </form>
      <div class="error" v-if="error">{{ error }}</div>
    </div>

    <!-- Lyrics preview of the chosen song -->
    <div class="preview" v-else-if="selected">
      <div class="preview-head">
        <Button
          :label="tt.online.back()"
          icon="mdi mdi-arrow-left"
          severity="secondary"
          size="small"
          @click="selected = undefined"
        />
        <div class="preview-title">
          <strong>{{ selected.name }}</strong> — {{ selected.artist }}
        </div>
      </div>
      <div class="loading" v-if="loadingLyrics">{{ tt.online.loadingLyrics() }}</div>
      <div class="error" v-else-if="error">{{ error }}</div>
      <template v-else>
        <div class="preview-options">
          <div class="check">
            <Checkbox v-model="prefs.processOnlineLyrics" input-id="il-process" binary />
            <label for="il-process" :title="tt.plain.processLyricsTip()">{{
              tt.plain.processLyrics()
            }}</label>
          </div>
          <div class="check">
            <ToggleSwitch v-model="manualEdit" input-id="il-manual" />
            <label for="il-manual">{{ tt.online.manualEdit() }}</label>
          </div>
          <span class="count">{{ tt.online.lineCount(lineCount) }}</span>
        </div>
        <CodeMirror
          v-if="manualEdit"
          class="preview-editor"
          v-model:content="lyrics"
          showLineNumbers
        />
        <div class="preview-text" v-else>
          <div v-for="(line, i) in previewLines" :key="i" class="preview-line">
            <template v-for="(part, j) in line" :key="j"
              ><span :class="{ dim: part.dim }">{{ part.text }}</span></template
            >&nbsp;
          </div>
        </div>
      </template>
    </div>

    <!-- Search -->
    <div class="search" v-else>
      <form class="search-bar" @submit.prevent="runSearch">
        <InputText
          v-model="query"
          class="search-input"
          :placeholder="tt.online.searchPlaceholder()"
        />
        <Button
          type="submit"
          :label="tt.online.search()"
          icon="mdi mdi-magnify"
          :disabled="!query.trim() || searching"
        />
        <Button
          v-if="source === 'genius'"
          :label="tt.online.tokenChange()"
          icon="mdi mdi-key-remove"
          severity="secondary"
          @click="clearToken"
        />
      </form>
      <div class="error" v-if="error">{{ error }}</div>
      <div class="status" v-else-if="searching">{{ tt.online.searching() }}</div>
      <div class="status" v-else-if="!searched">{{ tt.online.startTip() }}</div>
      <div class="status" v-else-if="!results.length">{{ tt.online.noResults() }}</div>
      <div class="results" v-else>
        <button
          v-for="track in results"
          :key="track.id"
          type="button"
          class="result"
          @click="choose(track)"
        >
          <span class="cover">
            <img
              v-if="track.cover && !brokenCovers.has(track.cover)"
              :src="track.cover"
              crossorigin="anonymous"
              loading="lazy"
              alt=""
              @error="brokenCovers.add(track.cover!)"
            />
            <i v-else class="mdi mdi-music" />
          </span>
          <span class="info">
            <span class="name">{{ track.name }}</span>
            <span class="meta">
              {{ track.artist || tt.online.unknownArtist() }}
              <template v-if="track.album"> · {{ track.album }}</template>
              <template v-if="track.duration">
                · {{ formatTrackDuration(track.duration) }}</template
              >
            </span>
          </span>
          <span class="badges">
            <span class="badge match" v-if="matchesAudioDuration(track.duration, audioSeconds)">{{
              tt.online.matchesAudio()
            }}</span>
            <span class="badge" v-if="track.note === 'synced'">{{
              tt.online.syncedAvailable()
            }}</span>
          </span>
        </button>
      </div>
    </div>

    <div class="actions" v-if="!(source === 'genius' && !geniusAccessToken)">
      <Button
        :label="tt.cancel()"
        icon="mdi mdi-close"
        severity="secondary"
        @click="emit('close')"
      />
      <Button
        v-if="selected"
        :label="tt.import()"
        icon="mdi mdi-arrow-right"
        :disabled="loadingLyrics || !lyrics.trim()"
        @click="doImport"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, reactive, ref, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { fileState as FS } from '@core/file'
import { lyricsImportPrefs as prefs, geniusAccessToken } from '@core/lyricsImport/storage'
import {
  GENIUS_API_CLIENTS_URL,
  GENIUS_TOKEN_GUIDE_URL,
  ImportHttpError,
  searchTracks,
} from '@core/lyricsImport/sources'
import { textToLineDrafts } from '@core/lyricsImport/textToLines'
import { draftsToPersist, trackToMetadata } from '@core/lyricsImport/toPersist'
import {
  formatTrackDuration,
  matchesAudioDuration,
  prioritizeMatchingTracks,
  queryFromFilename,
} from '@core/lyricsImport/trackUtils'
import type { ImportTrack, OnlineSourceId } from '@core/lyricsImport/types'

import CodeMirror from '@ui/components/CodeMirror.vue'
import { Button, Checkbox, InputText, ToggleSwitch, useToast } from 'primevue'

const tt = t.importLyrics
const toast = useToast()

const props = defineProps<{ source: OnlineSourceId; visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const query = ref(queryFromFilename(audioEngine.filenameComputed.value))
const results = ref<ImportTrack[]>([])
const searched = ref(false)
const searching = ref(false)
const error = ref('')
const brokenCovers = reactive(new Set<string>())

const selected = ref<ImportTrack>()
const lyrics = ref('')
const loadingLyrics = ref(false)
const manualEdit = ref(false)

const tokenInput = ref('')

// Length of the loaded audio in seconds (0 when nothing is loaded)
const audioSeconds = computed(() => (audioEngine.lengthComputed.value ?? 0) / 1000)

// Search with the current audio's name as soon as this pane is first shown
watch(
  () => props.visible,
  (shown) => {
    if (!shown) return
    // Re-prefill when the dialog is reopened with different audio and nothing was searched yet
    if (!searched.value && !query.value.trim())
      query.value = queryFromFilename(audioEngine.filenameComputed.value)
  },
)

let searchSeq = 0
function describeError(e: unknown, fallback: string): string {
  if (e instanceof ImportHttpError) {
    if (props.source === 'genius' && (e.status === 401 || e.status === 403))
      return tt.online.tokenRejected()
    return `${fallback}: ${e.message}`
  }
  return `${fallback}: ${String(e)}`
}

async function runSearch() {
  const q = query.value.trim()
  if (!q) return
  const seq = ++searchSeq
  searching.value = true
  error.value = ''
  try {
    const found = await searchTracks(props.source, q, geniusAccessToken.value)
    if (seq !== searchSeq) return // a newer search superseded this one
    results.value = prioritizeMatchingTracks(found, audioSeconds.value)
    searched.value = true
  } catch (e) {
    if (seq !== searchSeq) return
    if (
      props.source === 'genius' &&
      e instanceof ImportHttpError &&
      [401, 403].includes(e.status)
    ) {
      // The stored token is bad: ask for a new one
      geniusAccessToken.value = ''
      error.value = tt.online.tokenRejected()
    } else error.value = describeError(e, tt.online.searchFailed())
    results.value = []
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

function saveToken() {
  const token = tokenInput.value.trim()
  if (!token) return
  geniusAccessToken.value = token
  tokenInput.value = ''
  error.value = ''
  if (query.value.trim()) void runSearch()
}
function clearToken() {
  geniusAccessToken.value = ''
  results.value = []
  searched.value = false
  error.value = ''
}

async function choose(track: ImportTrack) {
  selected.value = track
  error.value = ''
  manualEdit.value = false
  lyrics.value = ''
  if (track.lyrics !== undefined) {
    lyrics.value = track.lyrics
    if (!lyrics.value.trim()) error.value = tt.online.noLyrics()
    return
  }
  if (!track.fetchLyrics) {
    error.value = tt.online.noLyrics()
    return
  }
  loadingLyrics.value = true
  try {
    const text = await track.fetchLyrics()
    if (selected.value !== track) return
    lyrics.value = text
    if (!text.trim()) error.value = tt.online.noLyrics()
  } catch (e) {
    if (selected.value !== track) return
    error.value = describeError(e, tt.online.lyricsFailed())
  } finally {
    if (selected.value === track) loadingLyrics.value = false
  }
}

function toDrafts(text: string) {
  const process = prefs.value.processOnlineLyrics
  return textToLineDrafts(text, {
    processLyrics: process,
    sectionHeaders: 'discard',
    wordSeparator: process ? '\\' : '',
    splitHyphens: false,
    collapseWhitespace: !process,
    backgroundPrefix: process ? '<' : '',
  })
}

const lineCount = computed(() => toDrafts(lyrics.value).length)

interface PreviewPart {
  text: string
  dim: boolean
}
/** Text for the read-only preview, with (parenthesized) parts dimmed */
const previewLines = computed<PreviewPart[][]>(() =>
  lyrics.value.split(/\r?\n/).map((line) => {
    const parts: PreviewPart[] = []
    for (const piece of line.split(/(\([^)]*\))/)) {
      if (piece) parts.push({ text: piece, dim: piece.startsWith('(') && piece.endsWith(')') })
    }
    return parts
  }),
)

async function doImport() {
  const track = selected.value
  if (!track) return
  const drafts = toDrafts(lyrics.value)
  if (!drafts.length) {
    toast.add({ severity: 'warn', summary: tt.plain.empty(), life: 3000 })
    return
  }
  try {
    await FS.importPersist(draftsToPersist(drafts, trackToMetadata(track)))
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
.online-import {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  height: 100%;
  min-height: 0;
}
.token-setup,
.search,
.preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.token-setup {
  max-width: 34rem;
  h3 {
    margin: 0;
  }
  p {
    margin: 0;
    opacity: 0.85;
  }
}
.token-links {
  display: flex;
  gap: 1.2rem;
  flex-wrap: wrap;
}
.token-form,
.search-bar {
  display: flex;
  gap: 0.6rem;
}
.token-form :deep(input),
.search-input {
  flex: 1;
}
.error {
  color: var(--p-button-text-danger-color);
}
.status {
  opacity: 0.7;
}
.results {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.result {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover {
    background: var(--p-content-hover-background);
  }
}
.cover {
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.3rem;
  overflow: hidden;
  background: var(--p-content-hover-background);
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  i {
    font-size: 1.4rem;
    opacity: 0.6;
  }
}
.info {
  flex: 1;
  width: 0;
  display: flex;
  flex-direction: column;
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.85rem;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.badges {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}
.badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  &.match {
    background: var(--p-highlight-background);
    color: var(--p-highlight-color);
  }
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.preview-options {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .count {
    margin-left: auto;
    opacity: 0.7;
  }
}
.preview-editor {
  flex: 1;
  height: 0;
}
.preview-text {
  flex: 1;
  overflow-y: auto;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  .dim {
    opacity: 0.5;
  }
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
</style>
