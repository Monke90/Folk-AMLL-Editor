<template>
  <Dialog v-model:visible="visible" modal :header="tt.header()" class="fetch-songwriters-modal">
    <!-- Genius needs the user's own access token first -->
    <div class="body" v-if="!geniusAccessToken">
      <p>{{ ti.tokenDesc() }}</p>
      <div class="links">
        <a :href="GENIUS_TOKEN_GUIDE_URL" target="_blank" rel="noopener noreferrer">{{
          ti.tokenGuide()
        }}</a>
        <a :href="GENIUS_API_CLIENTS_URL" target="_blank" rel="noopener noreferrer">{{
          ti.tokenCreate()
        }}</a>
      </div>
      <form class="row" @submit.prevent="saveToken">
        <InputText
          v-model="tokenInput"
          type="password"
          autocomplete="off"
          :placeholder="ti.tokenPlaceholder()"
        />
        <Button type="submit" :label="ti.tokenSave()" :disabled="!tokenInput.trim()" />
      </form>
    </div>
    <div class="body" v-else>
      <p>{{ tt.pickSong() }}</p>
      <form class="row" @submit.prevent="runSearch">
        <InputText v-model="query" :placeholder="ti.searchPlaceholder()" />
        <Button
          type="submit"
          :label="ti.search()"
          icon="mdi mdi-magnify"
          :disabled="!query.trim() || searching || applying"
        />
      </form>
      <label class="real-names">
        <Checkbox v-model="findRealNames" binary :disabled="applying" />
        <span>{{ tt.realNames() }}</span>
      </label>
      <div class="error" v-if="error">{{ error }}</div>
      <div class="status" v-else-if="searching">{{ ti.searching() }}</div>
      <div class="status" v-else-if="applying">{{ progress || tt.fetching() }}</div>
      <div class="status" v-else-if="searched && !results.length">{{ ti.noResults() }}</div>
      <div class="results" v-if="results.length">
        <button
          v-for="track in results"
          :key="track.id"
          type="button"
          class="result"
          :disabled="applying"
          @click="choose(track)"
        >
          <span class="name">{{ track.name }}</span>
          <span class="meta">{{ track.artist }}</span>
        </button>
      </div>
      <Button
        class="change-token"
        :label="ti.tokenChange()"
        icon="mdi mdi-key-remove"
        severity="secondary"
        size="small"
        @click="geniusAccessToken = ''"
      />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { ref, watch } from 'vue'

import { audioEngine } from '@core/audio'
import { geniusAccessToken } from '@core/lyricsImport/storage'
import {
  GENIUS_API_CLIENTS_URL,
  GENIUS_TOKEN_GUIDE_URL,
  ImportHttpError,
  applyGeniusSongMetadata,
  fetchGeniusSongwriters,
  searchTracks,
} from '@core/lyricsImport/sources'
import { queryFromFilename } from '@core/lyricsImport/trackUtils'
import type { ImportTrack } from '@core/lyricsImport/types'

import { useCoreStore } from '@states/stores'

import { Button, Checkbox, Dialog, InputText, useToast } from 'primevue'

const tt = t.sidebar.metadata.songwriters
const ti = t.importLyrics.online
const toast = useToast()
const coreStore = useCoreStore()

const [visible] = defineModel<boolean>({ required: true })

const tokenInput = ref('')
const query = ref('')
const results = ref<ImportTrack[]>([])
const searched = ref(false)
const searching = ref(false)
const applying = ref(false)
const error = ref('')
// Replace stage names with real names. On by default, as in ttml-tool.
const findRealNames = ref(true)
const progress = ref('')

/** "Title Artist" from the project's metadata, or else the audio file's name */
function defaultQuery(): string {
  const meta = coreStore.metadata
  const title = meta.musicName?.[0]?.trim()
  if (title) return [title, meta.artists?.[0]?.trim()].filter(Boolean).join(' ')
  return queryFromFilename(audioEngine.filenameComputed.value)
}

watch(visible, (shown) => {
  if (!shown) return
  query.value = defaultQuery()
  results.value = []
  searched.value = false
  error.value = ''
  if (geniusAccessToken.value && query.value.trim()) void runSearch()
})

function isAuthError(e: unknown) {
  return e instanceof ImportHttpError && (e.status === 401 || e.status === 403)
}
function handleError(e: unknown, fallback: string) {
  if (isAuthError(e)) {
    // The stored token is bad: ask for a new one
    geniusAccessToken.value = ''
    error.value = ''
    toast.add({ severity: 'warn', summary: ti.tokenRejected(), life: 5000 })
  } else {
    console.error(e)
    error.value = `${fallback}: ${e instanceof Error ? e.message : String(e)}`
  }
}

function saveToken() {
  const token = tokenInput.value.trim()
  if (!token) return
  geniusAccessToken.value = token
  tokenInput.value = ''
  if (query.value.trim()) void runSearch()
}

let searchSeq = 0
async function runSearch() {
  const q = query.value.trim()
  if (!q) return
  const seq = ++searchSeq
  searching.value = true
  error.value = ''
  try {
    const found = await searchTracks('genius', q, geniusAccessToken.value)
    if (seq !== searchSeq) return
    results.value = found
    searched.value = true
  } catch (e) {
    if (seq !== searchSeq) return
    results.value = []
    handleError(e, ti.searchFailed())
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

async function choose(track: ImportTrack) {
  applying.value = true
  error.value = ''
  progress.value = ''
  try {
    const result = await fetchGeniusSongwriters(track.id, geniusAccessToken.value, {
      findRealNames: findRealNames.value,
      onProgress: (name, current, total) => {
        progress.value = tt.findingRealName(name, current, total)
      },
    })
    if (!result.songwriters.length) {
      error.value = tt.noneFound()
      return
    }
    // Songwriters are replaced; title, artist and album are only filled in when empty
    coreStore.metadata = applyGeniusSongMetadata(coreStore.metadata, result)
    toast.add({ severity: 'success', summary: tt.fetched(), life: 3000 })
    visible.value = false
  } catch (e) {
    handleError(e, tt.failed())
  } finally {
    applying.value = false
    progress.value = ''
  }
}
</script>

<style lang="scss">
.fetch-songwriters-modal {
  width: 32rem;
  max-width: 94vw;
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    p {
      margin: 0;
      opacity: 0.85;
    }
  }
  .links {
    display: flex;
    gap: 1.2rem;
    flex-wrap: wrap;
  }
  .row {
    display: flex;
    gap: 0.6rem;
    input {
      flex: 1;
    }
  }
  .real-names {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: fit-content;
    cursor: pointer;
  }
  .error {
    color: var(--p-button-text-danger-color);
  }
  .status {
    opacity: 0.7;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-height: 18rem;
    overflow-y: auto;
  }
  .result {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.7rem;
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
    .name {
      font-weight: 600;
    }
    .meta {
      font-size: 0.85rem;
      opacity: 0.75;
    }
  }
  .change-token {
    align-self: flex-start;
  }
}
</style>
