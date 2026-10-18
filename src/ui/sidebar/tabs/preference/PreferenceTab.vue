<script setup lang="ts">
import { currentLocaleItem, localeItemList, localeOptNotMatch, localeOptRef, t } from '@i18n'
import { shallowRef, watch } from 'vue'

import { compatibilityMap } from '@core/compat'
import { type PreferenceSchema, getDefaultPref } from '@core/pref'
import type { SpectrogramColor } from '@core/spectrogram/colors'
import { THEME_ACCENTS, THEME_ACCENT_LABELS, type ThemeAccent } from '@core/theme'

import { usePrefStore, useRuntimeStore, useStaticStore } from '@states/stores'

import PrefItem from './PrefItem.vue'
import PrefNumberItem from './PrefNumberItem.vue'
import PrefSwitchItem from './PrefSwitchItem.vue'
import AnimatedFold from '@ui/components/AnimatedFold.vue'
import { Button, Select } from 'primevue'

const tt = t.sidebar.preference

const prefStore = usePrefStore()
const staticStore = useStaticStore()
const runtimeStore = useRuntimeStore()

async function handleReset() {
  const confirmed = await staticStore.waitForConfirmHook?.({
    header: tt.resetConfirm.header(),
    message: tt.resetConfirm.message(),
    acceptLabel: tt.resetConfirm.action(),
    acceptIcon: 'mdi mdi-restore',
  })
  if (!confirmed) return
  const defaultPrefs = getDefaultPref()
  for (const [_key, value] of Object.entries(defaultPrefs)) {
    const key = _key as keyof PreferenceSchema
    ;(prefStore as any)[key] = value
  }
}

function openGithubRepo() {
  window.open(__REPO_URL__, '_blank')
}
const displayName = __APP_DISPLAY_NAME__

const selectedLanguageItem = shallowRef(currentLocaleItem)
watch(selectedLanguageItem, (val) => {
  if (!val) return
  localeOptRef.value = val.code
})

const specColorOptns = [
  { label: 'Icy Blue', value: 'icyBlue' },
  { label: 'Inferno', value: 'inferno' },
  { label: 'Cubehelix', value: 'cubehelix' },
  { label: 'Viridis', value: 'viridis' },
  { label: 'Gray', value: 'gray' },
]
const selectedSpecColorOptn = shallowRef(
  (() => {
    if (typeof prefStore.spectrogramColor === 'string')
      return (
        specColorOptns.find((opt) => opt.value === prefStore.spectrogramColor) ?? specColorOptns[0]
      )
  })(),
)
watch(selectedSpecColorOptn, (val) => {
  if (!val) return
  prefStore.spectrogramColor = val.value as SpectrogramColor
})

const themeModeOptns = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]
const selectedThemeModeOptn = shallowRef(
  themeModeOptns.find((opt) => opt.value === prefStore.themeMode) ?? themeModeOptns[0],
)
watch(selectedThemeModeOptn, (val) => {
  if (!val) return
  prefStore.themeMode = val.value as PreferenceSchema['themeMode']
})

const themeAccentOptns = THEME_ACCENTS.map((accent) => ({
  accent,
  label: THEME_ACCENT_LABELS[accent],
}))
function selectAccent(accent: ThemeAccent) {
  prefStore.themeAccent = accent
}
</script>

<template>
  <div class="pref-panel">
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.data() }}</div>
      <PrefSwitchItem pref-key="autoSaveEnabled" :disabled="!compatibilityMap.fileSystem" />
      <PrefNumberItem
        pref-key="autoSaveIntervalMinutes"
        :disabled="!compatibilityMap.fileSystem || !prefStore.autoSaveEnabled"
        :min="1"
        :max="60"
      />
      <PrefNumberItem pref-key="maxUndoSteps" :min="1" :max="5000" placeholder="100" />
      <PrefSwitchItem pref-key="packAudioToProject" />
      <PrefSwitchItem pref-key="ttmlAsDefault" />
      <PrefSwitchItem pref-key="askPermissionOnOpen" />
    </div>
    <div class="pref-group">
      <div class="pref-group-title">Appearance</div>
      <PrefItem label="Theme" desc="Follow the system, or force light/dark mode">
        <Select v-model="selectedThemeModeOptn" :options="themeModeOptns" optionLabel="label" />
      </PrefItem>
      <PrefItem label="Accent color" desc="Pick a basic accent color theme for the app">
        <div class="theme-accent-swatches">
          <div
            v-for="optn in themeAccentOptns"
            :key="optn.accent"
            class="theme-accent-swatch"
            :class="[`theme-swatch-${optn.accent}`, { selected: prefStore.themeAccent === optn.accent }]"
            :title="optn.label"
            @click="selectAccent(optn.accent)"
          ></div>
        </div>
      </PrefItem>
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.key() }}</div>
      <PrefItem :label="tt.items.keyBinding()" :desc="tt.items.keyBindingDesc()">
        <Button
          severity="secondary"
          :label="tt.items.keyBindingAction()"
          icon="mdi mdi-keyboard-outline"
          @click="runtimeStore.dialogShown.keyBinding = !runtimeStore.dialogShown.keyBinding"
        />
      </PrefItem>
      <PrefSwitchItem pref-key="macStyleShortcuts" />
      <PrefNumberItem pref-key="audioSeekingStepMs" :min="100" :max="20000" placeholder="5,000" />
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.content() }}</div>
      <PrefSwitchItem pref-key="swapTranslateRoman" />
      <PrefSwitchItem pref-key="hideTranslateRoman" />
      <PrefSwitchItem pref-key="sylRomanEnabled" />
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.timing() }}</div>
      <PrefNumberItem pref-key="globalLatencyMs" placeholder="0" :min="-5000" :max="5000" />
      <PrefSwitchItem pref-key="alwaysIgnoreBackground" />
      <PrefSwitchItem pref-key="hideLineTiming" />
      <PrefSwitchItem pref-key="highlightSelectedLineOnProgress" />
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.spectrogram() }}</div>
      <PrefItem :label="tt.items.spectrogramColor()" :desc="tt.items.spectrogramColorDesc()">
        <Select v-model="selectedSpecColorOptn" :options="specColorOptns" optionLabel="label" />
      </PrefItem>
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.compatibility() }}</div>
      <PrefSwitchItem pref-key="notifyCompatIssuesOnStartup" />
      <PrefItem :label="tt.items.compatibilityReport()" :desc="tt.items.compatibilityReportDesc()">
        <Button
          severity="secondary"
          :label="tt.items.compatibilityReportAction()"
          icon="mdi mdi-monitor"
          @click="runtimeStore.dialogShown.compatibility = !runtimeStore.dialogShown.compatibility"
        />
      </PrefItem>
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.misc() }}</div>
      <PrefItem :label="tt.items.language()" :desc="tt.items.languageDesc()">
        <Select v-model="selectedLanguageItem" :options="localeItemList" optionLabel="name" />
      </PrefItem>
      <AnimatedFold :folded="!localeOptNotMatch">
        <div class="refresh-tip p-color-warn">
          <i class="mdi mdi-refresh"></i>
          {{ tt.refreshToTakeEffect() }}
        </div>
      </AnimatedFold>
      <PrefItem :label="tt.items.resetAll()" :desc="tt.items.resetAllDesc()">
        <Button
          severity="danger"
          variant="outlined"
          :label="tt.items.resetAllAction()"
          icon="mdi mdi-restore"
          @click="handleReset"
        />
      </PrefItem>
    </div>
    <div class="pref-group">
      <div class="pref-group-title">{{ tt.groups.about() }}</div>
      <PrefItem :label="tt.items.aboutApp(displayName)" :desc="tt.items.aboutAppDesc()">
        <Button
          severity="secondary"
          :label="tt.items.aboutAppAction()"
          icon="mdi mdi-information-outline"
          @click="runtimeStore.dialogShown.about = !runtimeStore.dialogShown.about"
        />
      </PrefItem>
      <PrefItem :label="tt.items.githubRepo()" :desc="tt.items.githubRepoDesc()">
        <Button
          severity="secondary"
          :label="tt.items.githubRepoAction()"
          icon="pi pi-github"
          @click="openGithubRepo()"
        />
      </PrefItem>
    </div>
  </div>
</template>

<style lang="scss">
.pref-group {
  margin-bottom: 2rem;
}
.pref-group-title {
  color: var(--p-primary-color);
  font-weight: bold;
}
.refresh-tip {
  padding-top: 0.5rem;
  font-size: 0.9rem;
}
.theme-accent-swatches {
  display: flex;
  gap: 0.6rem;
}
@each $accent in (emerald, blue, violet, rose, amber, teal) {
  .theme-swatch-#{$accent} {
    background-color: var(--p-#{$accent}-500);
    --swatch-color: var(--p-#{$accent}-500);
  }
}
</style>
