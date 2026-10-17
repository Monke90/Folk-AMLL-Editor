import { ref } from 'vue'

import { DEFAULT_ZOOM } from './viewportMath'

export * from './viewportMath'

/**
 * Spectrogram viewport state shared between the spectrogram itself and the
 * mini waveform in the player toolbar. They are sibling components, so this
 * lives at module level instead of in provide/inject.
 *
 * The "view region" drawn on the waveform is derived directly from these
 * values, and dragging it writes straight back to them. There is no request
 * queue in between, so the two can never disagree.
 */
export const spectrogramViewport = {
  /** Pixels per second */
  zoom: ref(DEFAULT_ZOOM),
  /** Distance in px between 0s and the left edge of the visible area */
  scrollLeft: ref(0),
  /** Width in px of the visible area. 0 until the spectrogram has been laid out */
  containerWidth: ref(0),
}

/** True while the user drags the view region, so wheel animations stand down */
export const isViewportDragging = ref(false)
