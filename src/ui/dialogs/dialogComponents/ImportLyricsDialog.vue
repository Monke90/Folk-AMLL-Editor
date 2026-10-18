<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="tt.header()"
    class="import-lyrics-modal"
    maximizable
  >
    <div class="source-nav" role="tablist" :aria-label="tt.sourcesLabel()">
      <button
        v-for="item in sources"
        :key="item.id"
        type="button"
        role="tab"
        class="source-btn"
        :class="{ active: item.id === current }"
        :aria-selected="item.id === current"
        @click="current = item.id"
      >
        <i :class="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </div>
    <div class="source-pane" role="tabpanel">
      <KeepAlive>
        <PlainTextImport v-if="current === 'plainText'" @close="visible = false" />
        <OnlineImport
          v-else
          :key="current"
          :source="current"
          :visible="visible"
          @close="visible = false"
        />
      </KeepAlive>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, ref } from 'vue'

import type { ImportSourceId } from '@core/lyricsImport/types'

import { Dialog } from 'primevue'

import OnlineImport from './importLyrics/OnlineImport.vue'
import PlainTextImport from './importLyrics/PlainTextImport.vue'

const tt = t.importLyrics

const [visible] = defineModel<boolean>({ required: true })
const current = ref<ImportSourceId>('plainText')

const sources = computed(() => [
  { id: 'plainText' as const, label: tt.sources.plainText(), icon: 'mdi mdi-text' },
  { id: 'genius' as const, label: tt.sources.genius(), icon: 'mdi mdi-alpha-g-circle-outline' },
  { id: 'lrclib' as const, label: tt.sources.lrclib(), icon: 'mdi mdi-database-search-outline' },
  { id: 'lyrically' as const, label: tt.sources.lyrically(), icon: 'mdi mdi-music-note-eighth' },
])
</script>

<style lang="scss">
.import-lyrics-modal {
  &:not(.p-dialog-maximized) {
    width: 85vw;
    height: 80vh;
    max-width: 96rem;
    max-height: 60rem;
  }
  .p-dialog-content {
    height: 0;
    flex: 1;
    display: flex;
    gap: 1rem;
  }
  .source-nav {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 11rem;
    flex-shrink: 0;
    padding-right: 1rem;
    border-right: 1px solid var(--p-content-border-color);
  }
  .source-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: none;
    border-radius: var(--p-content-border-radius);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    &:hover {
      background: var(--p-content-hover-background);
    }
    &.active {
      background: var(--p-highlight-background);
      color: var(--p-highlight-color);
    }
  }
  .source-pane {
    flex: 1;
    width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}
</style>
