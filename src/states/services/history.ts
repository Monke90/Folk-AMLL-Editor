import { cloneDeep } from 'lodash-es'
import { computed, reactive, ref, toRaw, watch } from 'vue'

import type { LyricLine, LyricSyllable, RuntimeSnapShot, Snapshot } from '@core/types'

import { useCoreStore, usePrefStore, useRuntimeStore, useStaticStore } from '@states/stores'

import { tryRaf } from '@utils/tryRaf'

const staticStore = useStaticStore()

const snapshotList = new Map<number, Snapshot>()
const state = reactive({
  head: -1,
  current: -1,
  tail: 0,
})
const redoable = computed(() => state.current < state.head)
const undoable = computed(() => state.current > state.tail || snapshotPending.value)
let stopRecording = false

const savedStatePointer = ref<number>(NaN)
// A change has been made but its snapshot is still waiting (see scheduleSnapshot)
const snapshotPending = ref(false)
const isDirty = computed(() => savedStatePointer.value !== state.current || snapshotPending.value)
const markSaved = () => {
  flushPendingSnapshot()
  savedStatePointer.value = state.current
}

// Copying the whole lyric list for every tiny change (e.g. every mouse move while dragging a
// syllable) made the editor laggy. Changes that come in quick succession are now saved as one
// undo step, taken once things calm down.
const SNAPSHOT_DELAY_MS = 250
const SNAPSHOT_MAX_WAIT_MS = 2000
let snapshotTimer: ReturnType<typeof setTimeout> | undefined
let snapshotFirstChangeAt = 0

function scheduleSnapshot() {
  const now = Date.now()
  if (!snapshotPending.value) snapshotFirstChangeAt = now
  snapshotPending.value = true
  clearTimeout(snapshotTimer)
  const wait = Math.max(
    0,
    Math.min(SNAPSHOT_DELAY_MS, snapshotFirstChangeAt + SNAPSHOT_MAX_WAIT_MS - now),
  )
  snapshotTimer = setTimeout(flushPendingSnapshot, wait)
}

function flushPendingSnapshot() {
  clearTimeout(snapshotTimer)
  snapshotTimer = undefined
  if (!snapshotPending.value) return
  snapshotPending.value = false
  if (shutdownHook && !stopRecording) take()
}

const preventClose = (e: BeforeUnloadEvent) => {
  e.preventDefault()
  e.returnValue = ''
  return ''
}
watch(isDirty, () => {
  if (isDirty.value) window.addEventListener('beforeunload', preventClose)
  else window.removeEventListener('beforeunload', preventClose)
})

let shutdownHook: (() => void) | null = null

function clear() {
  clearTimeout(snapshotTimer)
  snapshotPending.value = false
  state.head = state.current = -1
  state.tail = 0
  stopRecording = false
  markSaved()
  snapshotList.clear()
  take()
}

function init() {
  if (shutdownHook) {
    console.warn('editHistory is already initialized')
    return
  }
  const coreStore = useCoreStore()
  const runtimeStore = useRuntimeStore()
  const coreStoreWatcher = watch(
    [() => coreStore.lyricLines, () => coreStore.metadata],
    () => {
      if (stopRecording) return
      scheduleSnapshot()
    },
    { deep: true },
  )
  const runtimeStoreWatcher = watch(
    [
      () => runtimeStore.currentView,
      // Only membership matters. A deep watch would walk every selected line and syllable
      // (and re-run on any edit to them), which gets slow with many lines selected.
      () => [...runtimeStore.selectedLines],
      () => [...runtimeStore.selectedSyllables],
    ],
    () => {
      if (stopRecording || snapshotPending.value) return
      const currentSnapshot = snapshotList.get(state.current)
      if (!currentSnapshot) return
      currentSnapshot.lastRuntime = takeRuntime()
    },
  )
  shutdownHook = () => {
    coreStoreWatcher()
    runtimeStoreWatcher()
  }
  clear()
}

const forceCheckInited = () => {
  if (!shutdownHook) throw new Error('editHistory is not initialized')
}

function takeRuntime(): RuntimeSnapShot {
  forceCheckInited()
  const runtimeStore = useRuntimeStore()
  return {
    currentView: toRaw(runtimeStore.currentView),
    selectedLineIds: [...runtimeStore.selectedLines].map((l) => l.id),
    selectedWordIds: [...runtimeStore.selectedSyllables].map((s) => s.id),
    lastTouchedLineId: staticStore.lastTouchedLine?.id,
    lastTouchedWordId: staticStore.lastTouchedSyl?.id,
  }
}
function take() {
  forceCheckInited()
  const coreStore = useCoreStore()
  const snapshot: Snapshot = {
    timestamp: Date.now(),
    core: cloneDeep({
      metadata: toRaw(coreStore.metadata),
      lyricLines: toRaw(coreStore.lyricLines),
    }),
    firstRuntime: takeRuntime(),
  }
  snapshotList.set(++state.current, snapshot)
  if (state.current < state.head)
    for (let i = state.head; i > state.current; --i) snapshotList.delete(i)
  state.head = state.current
  while (snapshotList.size > (usePrefStore().maxUndoSteps || 100)) snapshotList.delete(state.tail++)
}

function wayback(snapshot: Readonly<Snapshot>, isRedo = false) {
  forceCheckInited()
  snapshot = cloneDeep(snapshot)
  // cloneDeep: avoid snapshot objects linking back into coreStore reactive objects.
  // If not cloned, restoring would cause snapshot to share references with the editor,
  // and any later edits would corrupt historical snapshots.

  const snapshotRuntime = isRedo
    ? snapshot.firstRuntime
    : (snapshot.lastRuntime ?? snapshot.firstRuntime)
  const snapshotCore = snapshot.core
  stopRecording = true
  const runtimeStore = useRuntimeStore()
  const coreStore = useCoreStore()
  coreStore.metadata = reactive(snapshotCore.metadata)
  coreStore.lyricLines.splice(0, coreStore.lyricLines.length, ...snapshotCore.lyricLines)
  runtimeStore.currentView = snapshotRuntime.currentView
  const selectedLines: LyricLine[] = []
  const selectedWords: LyricSyllable[] = []
  let lastTouchedLine: LyricLine | null = null
  let lastTouchedWord: LyricSyllable | null = null
  let firstLineIndex: number | undefined = undefined
  for (const [index, line] of coreStore.lyricLines.entries()) {
    // Use coreStore.lyricLines instead of snapshotCore.lyricLines:
    // the former is proxified, !== the latter
    if (snapshotRuntime.selectedLineIds.includes(line.id)) {
      selectedLines.push(line)
      firstLineIndex ??= index
    }
    if (snapshotRuntime.lastTouchedLineId === line.id) lastTouchedLine = line
    for (const syl of line.syllables) {
      if (snapshotRuntime.selectedWordIds.includes(syl.id)) selectedWords.push(syl)
      if (snapshotRuntime.lastTouchedWordId === syl.id) lastTouchedWord = syl
    }
  }
  if (selectedWords.length) runtimeStore.selectSyllable(...selectedWords)
  else runtimeStore.selectLine(...selectedLines)
  staticStore.lastTouchedLine = lastTouchedLine
  staticStore.lastTouchedSyl = lastTouchedWord
  if (firstLineIndex !== undefined)
    tryRaf(() => {
      const hook = staticStore.editorHook
      if (hook?.view === snapshotRuntime.currentView) {
        hook.scrollTo(firstLineIndex, { align: 'nearest' })
        return true
      }
    })
  setTimeout(() => (stopRecording = false), 0)
}

function undo() {
  forceCheckInited()
  flushPendingSnapshot()
  if (!undoable.value) return null
  const snapshot = snapshotList.get(--state.current)
  if (!snapshot) throw new Error('Snapshot not found during undo')
  wayback(snapshot)
}

function redo() {
  forceCheckInited()
  flushPendingSnapshot()
  if (!redoable.value) return null
  const snapshot = snapshotList.get(++state.current)
  if (!snapshot) throw new Error('Snapshot not found during redo')
  wayback(snapshot, true)
}

function shutdown() {
  forceCheckInited()
  flushPendingSnapshot()
  if (shutdownHook) {
    shutdownHook()
    shutdownHook = null
  }
}

export const editHistory = {
  init,
  take,
  undo,
  redo,
  clear,
  shutdown,
  redoable,
  undoable,
  isDirty,
  markSaved,
  state: state as Readonly<typeof state>,
}
