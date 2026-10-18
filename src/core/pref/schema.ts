import { type HotKey, getDefaultHotkeyMap } from '@core/hotkey'
import type { SpectrogramColor } from '@core/spectrogram/colors'
import type { ThemeAccent } from '@core/theme'

import { isAppleDevice } from '@utils/detectAppleDevice'

export interface PreferenceSchema {
  // Data
  maxUndoSteps: number
  autoSaveEnabled: boolean
  autoSaveIntervalMinutes: number
  packAudioToProject: boolean
  ttmlAsDefault: boolean
  askPermissionOnOpen: boolean
  allowConsecutiveBackgroundLines: boolean
  discordRichPresenceEnabled: boolean
  // Shortcuts
  macStyleShortcuts: boolean
  hotkeyMap: HotKey.Map
  audioSeekingStepMs: number
  // Timing
  globalLatencyMs: number
  alwaysIgnoreBackground: boolean
  hideLineTiming: boolean
  highlightSelectedLineOnProgress: boolean
  // Roman
  sylRomanEnabled: boolean
  swapTranslateRoman: boolean
  hideTranslateRoman: boolean
  // Spectrogram
  spectrogramColor: SpectrogramColor
  spectrogramShowSyllableBlocks: boolean
  spectrogramBlockScope: 'selected' | 'all'
  // Theme
  themeMode: 'system' | 'light' | 'dark'
  themeAccent: ThemeAccent
  // Spell check
  spellCheckEnabled: boolean
  // Misc
  notifyCompatIssuesOnStartup: boolean
  sidebarWidth: number
  spectrogramHeight: number
  scrollWithPlayback: boolean
}

export const getDefaultPref = (): PreferenceSchema => ({
  maxUndoSteps: 100,
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 3,
  packAudioToProject: true,
  ttmlAsDefault: false,
  askPermissionOnOpen: true,
  allowConsecutiveBackgroundLines: false,
  discordRichPresenceEnabled: false,
  macStyleShortcuts: isAppleDevice(),
  hotkeyMap: getDefaultHotkeyMap(),
  audioSeekingStepMs: 5000,
  globalLatencyMs: 0,
  alwaysIgnoreBackground: false,
  hideLineTiming: true,
  highlightSelectedLineOnProgress: true,
  sylRomanEnabled: false,
  swapTranslateRoman: false,
  hideTranslateRoman: false,
  spectrogramColor: 'icyBlue',
  spectrogramShowSyllableBlocks: false,
  spectrogramBlockScope: 'all',
  themeMode: 'system',
  themeAccent: 'emerald',
  spellCheckEnabled: false,
  notifyCompatIssuesOnStartup: true,
  sidebarWidth: 360,
  spectrogramHeight: 240,
  scrollWithPlayback: false,
})
