import { useStorage } from '@vueuse/core'

import { type LyricsImportPrefs, getDefaultLyricsImportPrefs } from './types'

/**
 * Plain text import options. Kept in their own localStorage entry (not in the main preferences),
 * and `mergeDefaults` fills in options added by later versions.
 */
export const lyricsImportPrefs = useStorage<LyricsImportPrefs>(
  'amll_editor:lyricsImport',
  getDefaultLyricsImportPrefs(),
  undefined,
  { mergeDefaults: true },
)

/**
 * The user's own Genius "Client Access Token". Stored in this browser's localStorage so it only
 * has to be entered once; clearing it (empty string) makes the Genius pane ask for a token again.
 */
export const geniusAccessToken = useStorage<string>('amll_editor:geniusToken', '')
