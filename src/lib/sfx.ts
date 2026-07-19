import { useGameStore } from '@/store/gameStore'

/**
 * Synthesized SFX per design.md §10 — Web Audio only, no audio files.
 * All functions are safe to call anytime: they no-op until the first
 * user gesture unlocks the AudioContext, and respect sfx settings.
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function gain(): number {
  const { sfxOn, sfxVolume, masterVolume } = useGameStore.getState().settings
  return sfxOn ? sfxVolume * masterVolume : 0
}

function tone(opts: {
  freq: number
  endFreq?: number
  dur: number
  type?: OscillatorType
  vol?: number
  delay?: number
}) {
  const ac = audio()
  const v = gain()
  if (!ac || v <= 0) return
  const { freq, endFreq, dur, type = 'sine', vol = 0.25, delay = 0 } = opts
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(vol * v, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

export const sfx = {
  /** soft UI tick on tap */
  tick: () => tone({ freq: 1200, dur: 0.04, type: 'square', vol: 0.06 }),
  /** snap to grid */
  snap: () => tone({ freq: 1800, dur: 0.04, type: 'square', vol: 0.1 }),
  /** drag pluck — pitch maps to vector length ratio (0..1 -> 220–440Hz) */
  pluck: (lenRatio = 0.5) =>
    tone({ freq: 220 + 220 * Math.min(1, Math.max(0, lenRatio)), dur: 0.08, type: 'sine', vol: 0.18 }),
  /** Vex squeak */
  squeak: () => {
    tone({ freq: 880, endFreq: 1320, dur: 0.09, type: 'sine', vol: 0.2 })
    tone({ freq: 1320, endFreq: 1760, dur: 0.08, type: 'sine', vol: 0.14, delay: 0.07 })
  },
  /** rising pentatonic win arpeggio C5-E5-G5-C6 + shimmer tail */
  win: () => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.22, delay: i * 0.12 }),
    )
    tone({ freq: 2093, dur: 0.5, type: 'sine', vol: 0.05, delay: 0.5 })
  },
  /** grid warp: downward pitch sweep into soft thunk */
  warp: () => {
    tone({ freq: 600, endFreq: 120, dur: 0.3, type: 'sawtooth', vol: 0.08 })
    tone({ freq: 90, dur: 0.12, type: 'sine', vol: 0.2, delay: 0.28 })
  },
  /** sheet whoosh */
  whoosh: () => tone({ freq: 300, endFreq: 900, dur: 0.16, type: 'sine', vol: 0.08 }),
  /** error / blocked */
  error: () => tone({ freq: 140, dur: 0.12, type: 'square', vol: 0.12 }),
  /** eigen crit — FM-ish bell */
  crit: () => {
    tone({ freq: 1567, dur: 0.3, type: 'sine', vol: 0.2 })
    tone({ freq: 2350, dur: 0.2, type: 'sine', vol: 0.08 })
  },
}
