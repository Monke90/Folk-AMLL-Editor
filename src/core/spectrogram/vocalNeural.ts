/**
 * Neural voice detection with the Silero VAD model (MIT, ~2 MB, shipped in /models).
 *
 * The model was trained on speech, so it is good at finding a voice that stands out and less
 * sure about singing buried in a loud mix. When it cannot be loaded (offline, blocked, no
 * WebAssembly) callers fall back to {@link detectVocals}, the signal-processing estimate.
 */
import { type VocalMap, detectVocals } from './vocalDetect'

export type VocalModel = 'estimate' | 'neural'

// The ONNX runtime is loaded from a CDN the first time it is needed instead of being an npm
// dependency, so it adds nothing to the bundle or the lockfile.
const ORT_VERSION = '1.22.0'
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
const ORT_MODULE = `${ORT_BASE}ort.min.mjs`

// Just the parts of the runtime used here
interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } }
  Tensor: new (
    type: 'float32' | 'int64',
    data: Float32Array | BigInt64Array,
    dims: number[],
  ) => Tensor
  InferenceSession: {
    create(url: string, options: { executionProviders: string[] }): Promise<Session>
  }
}
interface Tensor {
  data: Float32Array | BigInt64Array
}
interface Session {
  run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>
}
const MODEL_URL = `${import.meta.env.BASE_URL}models/silero_vad.onnx`

const SAMPLE_RATE = 16000
/** The model reads 512 samples at a time (32 ms), plus the last 64 samples of the previous chunk */
const CHUNK = 512
const CONTEXT = 64
const HOP_MS = (CHUNK / SAMPLE_RATE) * 1000
const FRAMES_PER_SLICE = 150

const cache = new WeakMap<AudioBuffer, Promise<VocalMap>>()
let sessionJob: Promise<{ ort: Ort; session: Session }> | null = null

function getSession() {
  sessionJob ??= (async () => {
    const ort = (await import(/* @vite-ignore */ ORT_MODULE)) as Ort
    ort.env.wasm.wasmPaths = ORT_BASE
    ort.env.wasm.numThreads = 1
    const session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
    })
    return { ort, session }
  })().catch((e) => {
    sessionJob = null
    throw e
  })
  return sessionJob
}

/** Mono, 16 kHz, which is what the model expects */
async function toMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

const percentile = (sorted: Float32Array, p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0

async function analyze(buffer: AudioBuffer): Promise<VocalMap> {
  const [{ ort, session }, samples] = await Promise.all([getSession(), toMono16k(buffer)])
  const frames = Math.max(1, Math.floor(samples.length / CHUNK))
  const probs = new Float32Array(frames)

  const sampleRate = new ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), [])
  let state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
  const input = new Float32Array(CONTEXT + CHUNK)

  for (let f = 0; f < frames; f++) {
    // Previous chunk's tail first, then the new chunk
    if (f > 0) input.set(input.subarray(CHUNK, CHUNK + CONTEXT), 0)
    else input.fill(0, 0, CONTEXT)
    input.set(samples.subarray(f * CHUNK, (f + 1) * CHUNK), CONTEXT)

    const result = await session.run({
      input: new ort.Tensor('float32', input.slice(), [1, CONTEXT + CHUNK]),
      state,
      sr: sampleRate,
    })
    probs[f] = (result.output!.data as Float32Array)[0]!
    state = result.stateN!

    if (f % FRAMES_PER_SLICE === FRAMES_PER_SLICE - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  // Smooth over about a syllable, then stretch against the rest of the song, because the model
  // is often less confident about singing over music than about plain speech.
  const radius = 2
  const smooth = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, f - radius); j <= Math.min(frames - 1, f + radius); j++) {
      sum += probs[j]!
      n++
    }
    smooth[f] = sum / n
  }
  const sorted = Float32Array.from(smooth).sort()
  const lo = Math.min(percentile(sorted, 0.2), 0.25)
  const hi = Math.max(percentile(sorted, 0.9), lo + 0.3)
  const scores = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const x = Math.min(1, Math.max(0, (smooth[f]! - lo) / (hi - lo)))
    scores[f] = x * x * (3 - 2 * x)
  }
  return { scores, hopMs: HOP_MS }
}

/** Voice scores by the chosen method; the neural one quietly falls back to the estimate on failure */
export function detectVocalsWith(buffer: AudioBuffer, model: VocalModel): Promise<VocalMap> {
  if (model !== 'neural') return detectVocals(buffer)
  let job = cache.get(buffer)
  if (!job) {
    job = analyze(buffer).catch((e) => {
      console.warn('Neural vocal detection unavailable, using the estimate instead', e)
      return detectVocals(buffer)
    })
    cache.set(buffer, job)
  }
  return job
}
