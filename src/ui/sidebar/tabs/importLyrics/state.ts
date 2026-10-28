import { ref, shallowRef } from 'vue'

import type { ImportTrack, OnlineSourceId } from '@core/lyricsImport/types'

// Kept outside the panel so closing the sidebar doesn't lose a draft.

/** The text in the import editor */
export const importText = ref('')
/** The text from before the first text tool ran, to restore. `null` when no tool has run */
export const originalText = ref<string | null>(null)
/** The online song whose details are filled in on import */
export const pickedTrack = shallowRef<{ track: ImportTrack; source: OnlineSourceId } | null>(null)
