<template></template>

<script setup lang="ts">
import { onUnmounted, watch } from 'vue'

import { audioEngine } from '@core/audio'

import { useCoreStore, usePrefStore } from '@states/stores'

// Publishes what the user is working on to the Discord desktop app. Only mounted in the desktop
// app (see App.vue); the Rust side (src-tauri/src/discord.rs) talks to Discord.
const invoke = (
  window as unknown as {
    __TAURI_INTERNALS__: { invoke: (cmd: string, args?: object) => Promise<unknown> }
  }
).__TAURI_INTERNALS__.invoke

const prefStore = usePrefStore()
const coreStore = useCoreStore()
const { playingComputed, progressComputed, lengthComputed, activatedRef } = audioEngine

const first = (key: string) => coreStore.metadata[key]?.[0]?.trim() || undefined

let lastPublishedProgress = 0
let lastPublishedAt = 0

async function publish() {
  if (!prefStore.discordRichPresenceEnabled) return
  const title = first('musicName') ?? first('ti')
  const artist = first('artists') ?? first('ar')
  const playing = activatedRef.value && playingComputed.value
  const payload: Record<string, unknown> = {
    details: title ?? 'Untitled project',
    state: playing ? (artist ?? 'Syncing lyrics') : artist ? `${artist} · Editing lyrics` : 'Editing lyrics',
    showRepositoryButton: true,
  }
  if (playing) {
    const now = Date.now()
    payload.startTimestamp = now - progressComputed.value
    if (lengthComputed.value > 0) payload.endTimestamp = now + (lengthComputed.value - progressComputed.value)
    lastPublishedProgress = progressComputed.value
    lastPublishedAt = now
  }
  try {
    await invoke('set_discord_activity', { payload })
  } catch (e) {
    console.warn('Discord Rich Presence:', e)
  }
}

async function clear() {
  try {
    await invoke('clear_discord_activity')
  } catch (e) {
    console.warn('Discord Rich Presence:', e)
  }
}

watch(
  [
    () => prefStore.discordRichPresenceEnabled,
    () => first('musicName') ?? first('ti'),
    () => first('artists') ?? first('ar'),
    () => activatedRef.value && playingComputed.value,
  ],
  ([enabled]) => (enabled ? void publish() : void clear()),
  { immediate: true },
)

// Re-publish when the user seeks, so the time shown in Discord stays right
watch(progressComputed, (progress) => {
  if (!prefStore.discordRichPresenceEnabled || !activatedRef.value || !playingComputed.value) return
  const expected = lastPublishedProgress + (Date.now() - lastPublishedAt)
  if (Math.abs(progress - expected) > 2000) void publish()
})

onUnmounted(() => void clear())
</script>
