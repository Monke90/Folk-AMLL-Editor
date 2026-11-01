<template>
  <header class="titlebar" :data-tauri-drag-region="isDesktopApp || undefined">
    <div class="leftbar" :data-tauri-drag-region="isDesktopApp || undefined">
      <div class="brand-mark" aria-hidden="true">F</div>
      <SplitButton
        :label="tt.open()"
        :icon="`mdi ${openWorking ? 'mdi-refresh' : 'mdi-folder-outline'}`"
        severity="secondary"
        :model="openMenuItems"
        @click="handleOpenClick"
        v-tooltip="tipHotkey(tt.openTip(), 'open')"
        :disabled="openWorking"
      >
        <template #item="{ item, props }">
          <TieredMenuItem :item="item" :binding="props" />
        </template>
      </SplitButton>

      <Button
        icon="mdi mdi-cog"
        variant="text"
        v-tooltip="tipHotkey(tt.preferences(), 'preferences')"
        :severity="
          runtimeStore.openedSidebars.includes(SidebarKey.Preference) ? undefined : 'secondary'
        "
        @click="runtimeStore.toogleSidebar(SidebarKey.Preference)"
      />
      <Button
        icon="mdi mdi-undo"
        variant="text"
        severity="secondary"
        @click="editHistory.undo()"
        :disabled="!editHistory.undoable.value"
        v-tooltip="tipHotkey(tt.undo(), 'undo')"
      />
      <Button
        icon="mdi mdi-redo"
        variant="text"
        severity="secondary"
        @click="editHistory.redo()"
        :disabled="!editHistory.redoable.value"
        v-tooltip="tipHotkey(tt.redo(), 'redo')"
      />
      <div class="filename-section" :data-tauri-drag-region="isDesktopApp || undefined">
        <input
          v-if="renaming"
          ref="renameInput"
          class="filename-input"
          v-model="renameDraft"
          :aria-label="tt.rename()"
          spellcheck="false"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="renaming = false"
          @blur="commitRename"
        />
        <div v-else class="filename-text" @dblclick="startRename" v-tooltip="tt.renameTip()">
          <span class="name">{{ filename }}</span
          ><span class="asterisk" v-if="isDirty">*</span>
        </div>
      </div>
    </div>
    <div class="centerbar" :data-tauri-drag-region="isDesktopApp || undefined">
      <ViewSwitcher />
    </div>
    <div class="rightbar" :data-tauri-drag-region="isDesktopApp || undefined">
      <div class="save-state-section" :data-tauri-drag-region="isDesktopApp || undefined">
        <span class="readonly" v-if="!compatibilityMap.fileSystem">{{
          tt.saveStatus.compatMode()
        }}</span>
        <span class="readonly" v-else-if="readonlyComputed">{{
          tt.saveStatus.permissionNotGranted()
        }}</span>
        <span class="saved-at" v-if="savedAtDateComputed">{{
          tt.saveStatus.savedAt(savedAtDateComputed)
        }}</span>
      </div>
      <SplitButton
        :label="tt.save()"
        :icon="`mdi ${saveWorking ? 'mdi-refresh' : 'mdi-content-save-outline'}`"
        :model="saveMenuItems"
        @click="handleSaveClick"
        v-tooltip="tipHotkey(tt.saveTip(), 'save')"
        :disabled="saveWorking"
      >
        <template #item="{ item, props }">
          <TieredMenuItem :item="item" :binding="props" />
        </template>
      </SplitButton>
      <WindowControls v-if="isDesktopApp" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { nextTick, ref, useTemplateRef } from 'vue'

import { compatibilityMap } from '@core/compat'
import { fileState as FS } from '@core/file'
import { useGlobalKeyboard } from '@core/hotkey'

import { editHistory } from '@states/services/history'
import { useRuntimeStore } from '@states/stores'

import { tipHotkey } from '@utils/generateTooltip'

import { SidebarKey } from '@ui/sidebar'

import ViewSwitcher from './ViewSwitcher.vue'
import WindowControls from './WindowControls.vue'
import TieredMenuItem from '@ui/components/TieredMenuItem.vue'
import { Button, SplitButton } from 'primevue'

import { useTitlebarFileLogics } from './fileLogics'

const tt = t.titlebar

// True inside the Tauri desktop app, which has no native title bar and needs its own window buttons
const isDesktopApp = '__TAURI_INTERNALS__' in window

const {
  displayFilenameComputed: filename,
  readonlyComputed,
  savedAtComputed: savedAtDateComputed,
} = FS
const { isDirty } = editHistory

const runtimeStore = useRuntimeStore()

// Double-click the file name to rename the project
const renaming = ref(false)
const renameDraft = ref('')
const renameInput = useTemplateRef('renameInput')
function startRename() {
  renameDraft.value = filename.value.replace(/\.(ttml|alp)$/i, '')
  renaming.value = true
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}
function commitRename() {
  if (!renaming.value) return
  renaming.value = false
  if (renameDraft.value.trim()) FS.renameFile(renameDraft.value)
}

const openWorking = ref(false)
const saveWorking = ref(false)

const {
  handleSaveClick,
  handleOpenClick,
  handleSaveAsClick,
  handleCreateBlankProject,
  handleExportToClipboard,
  handleImportFromClipboard,
  openMenuItems,
  saveMenuItems,
} = useTitlebarFileLogics({
  openWorking,
  saveWorking,
})

useGlobalKeyboard('preferences', () => runtimeStore.toogleSidebar(SidebarKey.Preference))
useGlobalKeyboard('save', handleSaveClick)
if (compatibilityMap.fileSystem) useGlobalKeyboard('saveAs', handleSaveAsClick)
useGlobalKeyboard('open', handleOpenClick)
useGlobalKeyboard('new', handleCreateBlankProject)
useGlobalKeyboard('exportToClipboard', handleExportToClipboard)
useGlobalKeyboard('importFromClipboard', handleImportFromClipboard)
</script>

<style lang="scss">
.titlebar {
  white-space: pre;
  display: flex;
  margin: 0 0.5rem 0.5rem;
  gap: 0.8rem;
  .leftbar,
  .rightbar {
    flex: 1;
    display: flex;
    gap: 0.3rem;
  }
  .leftbar {
    justify-content: flex-start;
  }
  .rightbar {
    justify-content: flex-end;
  }
  .filename-section {
    padding: 0 0.5rem;
    opacity: 0.9;
    width: 0;
    flex-grow: 1;
    display: flex;
    align-items: center;
    white-space: pre;
    overflow-x: hidden;
    position: relative;
    mask-image: linear-gradient(to left, transparent, black 1.5rem);
    .filename-input {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      padding: 0.2rem 0.5rem;
      border: 1px solid var(--p-primary-color);
      border-radius: 8px;
      background: var(--p-content-background);
      color: var(--p-text-color);
      font-size: 1rem;
    }
    .filename-text {
      cursor: text;
      line-height: 1;
      .name {
        font-size: 1.1rem;
        user-select: none;
      }
      .asterisk {
        color: var(--p-primary-color);
        font-weight: bold;
        margin-left: 0.1rem;
        user-select: none;
      }
    }
    @media (display-mode: standalone) {
      display: none;
    }
  }
  .save-state-section {
    display: flex;
    align-items: center;
    padding: 0 0.8rem;
    line-height: 1;
    color: var(--p-button-text-secondary-color);
    opacity: 0.9;
    span + span {
      &::before {
        content: '·';
        margin: 0 0.3rem;
      }
    }
  }
  @media screen and (max-width: 720px) {
    .filename-section,
    .save-state-section {
      display: none;
    }
  }
}
</style>
