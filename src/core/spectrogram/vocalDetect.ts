/**
 * Rough "is there a voice here" estimate for the amber bars.
 *
 * This is signal processing, not a neural network: it needs no model download and runs in the
 * browser. Each 40 ms frame is scored on three things a sung or spoken voice tends to have:
 *  - most of its energy between 200 Hz and 4 kHz (where vowels and consonants live),
 *  - a tonal, peaky spectrum in that range (harmonics rather than hiss or drums),
 *  - sitting in the middle of the stereo image (lead vocals are usually panned centre).
 * It works best on mixes where the vocal leads; a loud guitar or synth in the same range can
 * also score high.
 */

const FFT_SIZE = 2048
export const VOCAL_HOP_MS = 40
/** Frames processed before giving the page a chance to paint */
const FRAMES_PER_SLICE = 300

export interface VocalMap {
  /** 0 (no voice) to 1 (voice), one value per {@link hopMs} */
  scores: Float32Array
  hopMs: number
}

const cache = new WeakMap<AudioBuffer, Promise<VocalMap>>()

/** Scores are computed once per audio file and shared */
export function detectVocals(buffer: AudioBuffer): Promise<VocalMap> {
  let job = cache.get(buffer)
  if (!job) {
    job = analyze(buffer)
    cache.set(buffer, job)
  }
  return job
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function makeFft(n: number) {
  const levels = Math.log2(n)
  const reverse = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b)
    reverse[i] = r
  }
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sin[i] = Math.sin((2 * Math.PI * i) / n)
  }
  return (re: Float64Array, im: Float64Array) => {
    for (let i = 0; i < n; i++) {
      const j = reverse[i]!
      if (j > i) {
        const tr = re[i]!
        re[i] = re[j]!
        re[j] = tr
        const ti = im[i]!
        im[i] = im[j]!
        im[j] = ti
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1
      const step = n / size
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const a = start + k
          const b = a + half
          const xr = re[b]! * cos[t]! + im[b]! * sin[t]!
          const xi = im[b]! * cos[t]! - re[b]! * sin[t]!
          re[b] = re[a]! - xr
          im[b] = im[a]! - xi
          re[a] = re[a]! + xr
          im[a] = im[a]! + xi
        }
      }
    }
  }
}

const percentile = (sorted: Float32Array, p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0

async function analyze(buffer: AudioBuffer): Promise<VocalMap> {
  const sr = buffer.sampleRate
  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left
  const hop = Math.max(1, Math.round((VOCAL_HOP_MS / 1000) * sr))
  const frames = Math.max(1, Math.floor(buffer.length / hop))
  const fft = makeFft(FFT_SIZE)
  const window = new Float64Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE)

  const binHz = sr / FFT_SIZE
  const nyquistBin = FFT_SIZE / 2 - 1
  const allLo = Math.max(1, Math.ceil(40 / binHz))
  const allHi = Math.min(nyquistBin, Math.floor(12000 / binHz))
  const voiceLo = Math.max(allLo, Math.ceil(200 / binHz))
  const voiceHi = Math.min(allHi, Math.floor(4000 / binHz))

  const raw = new Float32Array(frames)
  const energy = new Float32Array(frames)
  const re = new Float64Array(FFT_SIZE)
  const im = new Float64Array(FFT_SIZE)
  const EPS = 1e-12

  for (let f = 0; f < frames; f++) {
    // Left in the real part, right in the imaginary part: one transform gives both channels
    const offset = f * hop
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = offset + i
      re[i] = (left[idx] ?? 0) * window[i]!
      im[i] = (right[idx] ?? 0) * window[i]!
    }
    fft(re, im)

    let total = 0
    let mid = 0
    let side = 0
    let logSum = 0
    let magSum = 0
    for (let k = allLo; k <= allHi; k++) {
      const n = FFT_SIZE - k
      const lr = (re[k]! + re[n]!) / 2
      const li = (im[k]! - im[n]!) / 2
      const rr = (im[k]! + im[n]!) / 2
      const ri = -(re[k]! - re[n]!) / 2
      total += (lr * lr + li * li + rr * rr + ri * ri) / 2
      if (k >= voiceLo && k <= voiceHi) {
        const mr = (lr + rr) / 2
        const mi = (li + ri) / 2
        const sr_ = (lr - rr) / 2
        const si = (li - ri) / 2
        const midPow = mr * mr + mi * mi
        mid += midPow
        side += sr_ * sr_ + si * si
        const mag = Math.sqrt(midPow)
        logSum += Math.log(mag + EPS)
        magSum += mag
      }
    }
    const count = Math.max(1, voiceHi - voiceLo + 1)
    energy[f] = total

    const bandRatio = (mid + side) / (total + EPS)
    const centre = mid / (mid + side + EPS)
    const flatness = Math.exp(logSum / count) / (magSum / count + EPS)
    const band = clamp01((bandRatio - 0.35) / 0.45)
    const tonal = clamp01((0.55 - flatness) / 0.4)
    const centred = clamp01((centre - 0.55) / 0.4)
    // Nothing in the vocal range (a bass note, a kick) can not be a voice, however tonal it is
    const present = clamp01(bandRatio / 0.2)
    raw[f] = present * (0.4 * band + 0.35 * tonal + 0.25 * centred)

    if (f % FRAMES_PER_SLICE === FRAMES_PER_SLICE - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  // Quiet frames are not voice, whatever their spectrum looks like
  const sortedEnergy = Float32Array.from(energy).sort()
  const loud = percentile(sortedEnergy, 0.95) + EPS
  for (let f = 0; f < frames; f++) {
    const db = 10 * Math.log10((energy[f]! + EPS) / loud)
    raw[f] = raw[f]! * clamp01((db + 40) / 20)
  }

  // About a syllable long, so single noisy frames do not flicker
  const radius = 3
  const smooth = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, f - radius); j <= Math.min(frames - 1, f + radius); j++) {
      sum += raw[j]!
      n++
    }
    smooth[f] = sum / n
  }

  // Judge each frame against the rest of the song, so quiet and loud mixes both get contrast
  const sorted = Float32Array.from(smooth).sort()
  const lo = percentile(sorted, 0.15)
  const hi = Math.max(percentile(sorted, 0.85), lo + 0.2)
  const scores = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const x = clamp01((smooth[f]! - lo) / (hi - lo))
    scores[f] = x * x * (3 - 2 * x)
  }
  return { scores, hopMs: VOCAL_HOP_MS }
}

/** Highest voice score between two times, or 0 when there is none */
export function vocalScoreBetween(map: VocalMap, fromSec: number, toSec: number): number {
  const first = Math.max(0, Math.floor((fromSec * 1000) / map.hopMs))
  const last = Math.min(map.scores.length - 1, Math.floor((toSec * 1000) / map.hopMs))
  let best = 0
  for (let i = first; i <= last; i++) if (map.scores[i]! > best) best = map.scores[i]!
  return best
}
