import { type Ref, onUnmounted, ref, watch } from 'vue'

import type {
  SpectrogramWorker as SpectrogramWorkerType,
  TileGenerationParams,
  WorkerResponse,
} from '@core/spectrogram/workers/types'

import { usePrefStore } from '@states/stores'

import { LRUCache } from './lruCache'
import SpectrogramWorker from './workers/spectrogram.worker?worker'

const MAX_CACHED_TILES = 70
// "High performance mode": keep many more tiles in memory and render them on several threads.
const MAX_CACHED_TILES_HIGH_PERFORMANCE = 240
const maxWorkers = () => Math.min(4, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)))

export type TileEntry = {
  bitmap: ImageBitmap
  width: number
  height: number
  gain: number
  paletteId: string
}

class SpectrogramWorkerClient {
  private worker: SpectrogramWorkerType
  private reqIdCounter = 0
  private pendingRequests = new Map<
    number,
    {
      resolve: (bmp: ImageBitmap) => void
      reject: (err: Error) => void
    }
  >()

  constructor() {
    this.worker = new SpectrogramWorker()
    this.worker.onmessage = this.handleMessage.bind(this)
  }

  private handleMessage(event: MessageEvent<WorkerResponse>) {
    const msg = event.data
    if (msg.type === 'TILE_READY') {
      const request = this.pendingRequests.get(msg.reqId)
      if (request) {
        request.resolve(msg.imageBitmap)
        this.pendingRequests.delete(msg.reqId)
      } else {
        msg.imageBitmap.close()
      }
    } else if (msg.type === 'ERROR') {
      const request = this.pendingRequests.get(msg.reqId)
      if (request) {
        console.warn(`Worker Error req ${msg.reqId}:`, msg.message)
        request.reject(new Error(msg.message))
        this.pendingRequests.delete(msg.reqId)
      }
    }
  }

  public getTile(params: TileGenerationParams): Promise<ImageBitmap> {
    const reqId = this.reqIdCounter++
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject })
      this.worker.postMessage({
        type: 'GET_TILE',
        reqId,
        params,
      })
    })
  }

  public initAudio(audioData: Float32Array, sampleRate: number) {
    this.worker.postMessage({ type: 'INIT', audioData, sampleRate }, [audioData.buffer])
  }

  public setPalette(palette: Uint8Array) {
    this.worker.postMessage({ type: 'SET_PALETTE', palette })
  }

  public terminate() {
    this.worker.terminate()
    this.pendingRequests.clear()
  }
}

export function useSpectrogramWorker(
  audioBuffer: Ref<AudioBuffer | null>,
  paletteData: Ref<Uint8Array>,
) {
  const prefStore = usePrefStore()
  const workerCount = () => (prefStore.highPerformanceMode ? maxWorkers() : 1)
  const cacheSize = () =>
    prefStore.highPerformanceMode ? MAX_CACHED_TILES_HIGH_PERFORMANCE : MAX_CACHED_TILES

  const clients: SpectrogramWorkerClient[] = []
  let nextClient = 0
  const workersSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined'

  const tileCache = new LRUCache<string, TileEntry>(cacheSize(), (_key, entry) => {
    entry.bitmap.close()
  })

  const activeRequests = new Set<string>()

  const lastTileTimestamp = ref(0)

  // Each worker keeps its own copy of the audio, so more workers means more memory.
  function setupClients(buffer: AudioBuffer | null) {
    if (!workersSupported) return
    const wanted = workerCount()
    while (clients.length > wanted) clients.pop()!.terminate()
    const fresh: SpectrogramWorkerClient[] = []
    while (clients.length < wanted) {
      const c = new SpectrogramWorkerClient()
      clients.push(c)
      fresh.push(c)
    }
    for (const c of fresh) {
      if (paletteData.value) c.setPalette(paletteData.value)
      if (buffer) c.initAudio(buffer.getChannelData(0).slice(), buffer.sampleRate)
    }
    nextClient = 0
  }

  setupClients(null)

  watch(
    audioBuffer,
    (newBuffer) => {
      if (!newBuffer || !clients.length) return

      tileCache.clear()
      activeRequests.clear()

      for (const c of clients) {
        c.initAudio(newBuffer.getChannelData(0).slice(), newBuffer.sampleRate)
        if (paletteData.value) c.setPalette(paletteData.value)
      }

      lastTileTimestamp.value = Date.now()
    },
    { immediate: true },
  )

  watch(
    () => prefStore.highPerformanceMode,
    () => {
      tileCache.resize(cacheSize())
      activeRequests.clear()
      setupClients(audioBuffer.value)
      lastTileTimestamp.value = Date.now()
    },
  )

  watch(paletteData, (newPalette) => {
    if (newPalette) for (const c of clients) c.setPalette(newPalette)
  })

  onUnmounted(() => {
    for (const c of clients) c.terminate()
    clients.length = 0
    tileCache.clear()
  })

  const requestTileIfNeeded = async (params: TileGenerationParams) => {
    if (!clients.length) return
    const client = clients[nextClient++ % clients.length]!

    const cacheKey = `tile-${params.tileIndex}`
    const requestFingerprint = `${params.tileIndex}-w${params.tileWidthPx}-h${params.height}-g${params.gain}-p${params.paletteId}`

    const cacheEntry = tileCache.get(cacheKey)

    const isStale =
      !cacheEntry ||
      cacheEntry.width < params.tileWidthPx ||
      cacheEntry.height !== params.height ||
      cacheEntry.gain !== params.gain ||
      cacheEntry.paletteId !== params.paletteId

    if (isStale && !activeRequests.has(requestFingerprint)) {
      activeRequests.add(requestFingerprint)

      try {
        const bitmap = await client.getTile(params)

        tileCache.set(cacheKey, {
          bitmap,
          width: params.tileWidthPx,
          height: params.height,
          gain: params.gain,
          paletteId: params.paletteId,
        })

        lastTileTimestamp.value = Date.now()
      } catch (err) {
        console.error('生成频谱图瓦片失败', err)
      } finally {
        activeRequests.delete(requestFingerprint)
      }
    }
  }

  return {
    tileCache,
    requestTileIfNeeded,
    lastTileTimestamp,
  }
}
