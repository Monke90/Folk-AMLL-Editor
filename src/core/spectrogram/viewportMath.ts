/**
 * Pure math for the spectrogram viewport. No Vue imports on purpose, so it stays easy to test.
 *
 * Vocabulary: `zoom` is pixels per second, `scrollLeft` is the distance in px between 0s and the
 * left edge of the visible area, `containerWidth` is the width in px of the visible area.
 */

export const MIN_ZOOM = 10
export const MAX_ZOOM = 1000
export const DEFAULT_ZOOM = 100

export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM))

export const clampScroll = (
  scrollLeft: number,
  zoom: number,
  durationSec: number,
  containerWidthPx: number,
) => {
  if (durationSec <= 0) return 0
  const maxScroll = Math.max(0, durationSec * zoom - containerWidthPx)
  return Math.max(0, Math.min(scrollLeft, maxScroll))
}

/** The viewport as it was when a drag started. Drags are always computed from this, never incrementally */
export interface ViewportSnapshot {
  zoom: number
  scrollLeft: number
  containerWidth: number
  durationSec: number
}

export interface ViewportState {
  zoom: number
  scrollLeft: number
}

export const viewStartSec = (v: ViewportSnapshot) => v.scrollLeft / v.zoom
export const viewEndSec = (v: ViewportSnapshot) => (v.scrollLeft + v.containerWidth) / v.zoom

/** Move the view sideways by `deltaSec` seconds without changing zoom */
export function panView(initial: ViewportSnapshot, deltaSec: number): ViewportState {
  return {
    zoom: initial.zoom,
    scrollLeft: clampScroll(
      initial.scrollLeft + deltaSec * initial.zoom,
      initial.zoom,
      initial.durationSec,
      initial.containerWidth,
    ),
  }
}

/**
 * Drag one edge of the view to `pointerSec`. The opposite edge stays where it was.
 * Returns null when the pointer has crossed the fixed edge (no valid view).
 */
export function resizeView(
  initial: ViewportSnapshot,
  edge: 'left' | 'right',
  pointerSec: number,
): ViewportState | null {
  const { containerWidth, durationSec } = initial
  const startSec = viewStartSec(initial)
  const endSec = viewEndSec(initial)
  const pointer = Math.max(0, Math.min(pointerSec, durationSec))

  const viewSec = edge === 'right' ? pointer - startSec : endSec - pointer
  if (viewSec <= 0) return null

  const zoom = clampZoom(containerWidth / viewSec)
  // Derive the fixed edge from the clamped zoom so it doesn't drift once a zoom limit is hit
  const newStartSec = edge === 'right' ? startSec : endSec - containerWidth / zoom
  return {
    zoom,
    scrollLeft: clampScroll(newStartSec * zoom, zoom, durationSec, containerWidth),
  }
}

/** Where to draw the view window on a slider that is `sliderWidth` px wide and spans the whole song */
export function regionRect(
  view: Pick<ViewportSnapshot, 'zoom' | 'scrollLeft' | 'containerWidth' | 'durationSec'>,
  sliderWidth: number,
  minWidth: number,
) {
  const pxPerSec = sliderWidth / view.durationSec
  const rawWidth = (view.containerWidth / view.zoom) * pxPerSec
  const width = Math.min(Math.max(rawWidth, minWidth), sliderWidth)
  const rawLeft = (view.scrollLeft / view.zoom) * pxPerSec
  const left = Math.max(0, Math.min(rawLeft, sliderWidth - width))
  return { left, width }
}
