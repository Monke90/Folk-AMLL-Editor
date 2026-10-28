<template>
  <!-- Genius needs the user's own access token first -->
  <div class="token-setup" v-if="source === 'genius' && !geniusAccessToken">
    <div class="token-title">{{ tt.online.tokenTitle() }}</div>
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
        fluid
      />
      <Button type="submit" :label="tt.online.tokenSave()" :disabled="!tokenInput.trim()" />
    </form>
  </div>
  <form class="search-bar" v-else @submit.prevent="emit('search')">
    <div class="search-row">
      <InputText
        v-model="query"
        class="search-input"
        :placeholder="tt.online.searchPlaceholder()"
        :aria-label="tt.online.search()"
        fluid
      />
      <Button
        type="submit"
        :label="tt.online.search()"
        icon="mdi mdi-magnify"
        :disabled="!query.trim() || searching"
        :loading="searching"
      />
    </div>
    <Button
      v-if="source === 'genius'"
      class="change-token"
      :label="tt.online.tokenChange()"
      icon="mdi mdi-key-remove"
      severity="secondary"
      variant="text"
      size="small"
      @click="geniusAccessToken = ''"
    />
  </form>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { ref } from 'vue'

import { geniusAccessToken } from '@core/lyricsImport/storage'
import { GENIUS_API_CLIENTS_URL, GENIUS_TOKEN_GUIDE_URL } from '@core/lyricsImport/sources'
import type { OnlineSourceId } from '@core/lyricsImport/types'

import { Button, InputText } from 'primevue'

const tt = t.importLyrics

defineProps<{ source: OnlineSourceId; searching: boolean }>()
const emit = defineEmits<{ search: [] }>()
const [query] = defineModel<string>('query', { required: true })

const tokenInput = ref('')
function saveToken() {
  const token = tokenInput.value.trim()
  if (!token) return
  geniusAccessToken.value = token
  tokenInput.value = ''
  if (query.value.trim()) emit('search')
}
</script>

<style lang="scss" scoped>
.token-setup {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  .token-title {
    font-weight: 600;
  }
  p {
    margin: 0;
    opacity: 0.85;
    font-size: 0.9rem;
  }
  .token-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.2rem;
    font-size: 0.9rem;
  }
  .token-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
}
.search-bar {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  .search-row {
    display: flex;
    gap: 0.5rem;
    .search-input {
      flex: 1;
      min-width: 0;
    }
  }
  .change-token {
    align-self: flex-start;
  }
}
</style>
