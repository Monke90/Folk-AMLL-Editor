<template>
  <div class="status" v-if="error">{{ error }}</div>
  <div class="status" v-else-if="searching">{{ tt.online.searching() }}</div>
  <div class="status" v-else-if="!results.length">
    {{ hasSearched ? tt.online.noResults() : tt.online.startTip() }}
  </div>
  <div class="results" v-else>
    <button
      v-for="track in results"
      :key="track.id"
      type="button"
      class="result"
      :disabled="loadingId !== null"
      @click="emit('pick', track)"
    >
      <span class="cover">
        <img
          v-if="track.cover && !brokenCovers.has(track.cover)"
          :src="coverUrl(track.cover)"
          referrerpolicy="no-referrer"
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
        </span>
        <span class="badges" v-if="matches(track) || track.note === 'synced'">
          <span class="badge match" v-if="matches(track)">{{ tt.online.matchesAudio() }}</span>
          <span class="badge" v-if="track.note === 'synced'">{{
            tt.online.syncedAvailable()
          }}</span>
        </span>
      </span>
      <span class="duration" v-if="track.duration !== undefined && Number.isFinite(track.duration)">
        {{ formatTrackDuration(track.duration) }}
      </span>
      <i v-if="loadingId === track.id" class="pi pi-spin pi-spinner" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { reactive } from 'vue'

import { formatTrackDuration, matchesAudioDuration } from '@core/lyricsImport/trackUtils'
import type { ImportTrack } from '@core/lyricsImport/types'

const tt = t.importLyrics

const props = defineProps<{
  results: ImportTrack[]
  searching: boolean
  hasSearched: boolean
  error: string
  /** Length of the loaded audio in seconds (0 when nothing is loaded) */
  audioSeconds: number
  loadingId: ImportTrack['id'] | null
  /** Whether covers go through the image proxy (Genius art is hotlink-protected) */
  proxyCovers?: boolean
}>()
const emit = defineEmits<{ pick: [track: ImportTrack] }>()

const brokenCovers = reactive(new Set<string>())
const matches = (track: ImportTrack) => matchesAudioDuration(track.duration, props.audioSeconds)

/**
 * Genius cover art blocks hotlinking, so it is loaded through an image proxy that also
 * resizes it, the same as ttml-tool does. Other sources are loaded directly.
 */
function coverUrl(url: string) {
  if (!props.proxyCovers) return url
  let cleaned = url.trim()
  if (cleaned.startsWith('//')) cleaned = `https:${cleaned}`
  const encoded = encodeURIComponent(cleaned.replace(/^http:/, 'https:'))
  return `https://wsrv.nl/?url=${encoded}&w=100&h=100&fit=cover`
}
</script>

<style lang="scss" scoped>
.status {
  padding: 1.5rem 0.5rem;
  text-align: center;
  opacity: 0.7;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}
.result {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border: none;
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
    cursor: progress;
  }
}
.cover {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: var(--p-content-border-radius);
  background: var(--p-content-hover-background);
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  i {
    opacity: 0.5;
    font-size: 1.2rem;
  }
}
.info {
  flex: 1;
  min-width: 0;
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
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.15rem;
}
.badge {
  padding: 0 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  background: var(--p-content-hover-background);
  &.match {
    background: color-mix(in srgb, var(--p-green-500), transparent 80%);
    color: var(--p-green-500);
  }
}
.duration {
  flex-shrink: 0;
  font-size: 0.85rem;
  opacity: 0.7;
}
</style>
