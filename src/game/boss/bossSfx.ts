import { useGameStore } from '@/store/gameStore'

/**
 * Boss-specific synthesized SFX + the adaptive boss drone (design.md §10,
 * boss.md §7). Kept separate from the shared lib/sfx.ts kit.
 * Web Audio only, no assets; safe to call anytime (no-op until a user
 * gesture unlocks the AudioContext, respects settings volumes).
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const sfxGain = (): number => {
  const { sfxOn, sfxVolume, masterVolume } = useGameStore.getState().settings
  return sfxOn ? sfxVolume * masterVolume : 0
}

const musicGain = (): number => {
  const { musicOn, musicVolume, masterVolume } = useGameStore.getState().settings
  return musicOn ? musicVolume * masterVolume : 0
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
  const v = sfxGain()
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

function noise(opts: { dur: number; vol?: number; freq?: number; q?: number; delay?: number }) {
  const ac = audio()
  const v = sfxGain()
  if (!ac || v <= 0) return
  const { dur, vol = 0.2, freq = 800, q = 1, delay = 0 } = opts
  const t0 = ac.currentTime + delay
  const len = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  const g = ac.createGain()
  g.gain.setValueAtTime(vol * v, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t0)
}

/* ---------------- boss drone (music layer: 55Hz saw + noise rumble) ---------------- */

interface Drone {
  osc: OscillatorNode
  rumble: AudioBufferSourceNode
  gain: GainNode
  filter: BiquadFilterNode
}

let drone: Drone | null = null

function startDrone() {
  const ac = audio()
  if (!ac || drone) return
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 55
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 220
  // slow menace LFO on the filter
  const lfo = ac.createOscillator()
  lfo.frequency.value = 0.14
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 90
  lfo.connect(lfoGain).connect(filter.frequency)
  lfo.start()

  const rumbleLen = ac.sampleRate * 2
  const buf = ac.createBuffer(1, rumbleLen, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < rumbleLen; i++) data[i] = (Math.random() * 2 - 1) * 0.5
  const rumble = ac.createBufferSource()
  rumble.buffer = buf
  rumble.loop = true
  const rumbleFilter = ac.createBiquadFilter()
  rumbleFilter.type = 'lowpass'
  rumbleFilter.frequency.value = 120

  const g = ac.createGain()
  g.gain.value = 0
  osc.connect(filter).connect(g)
  rumble.connect(rumbleFilter).connect(g)
  g.connect(ac.destination)
  osc.start()
  rumble.start()
  drone = { osc, rumble, gain: g, filter }
  // keep LFO referenced via osc stop closure
  drone.osc.onended = () => lfo.stop()
}

function setDroneLevel(target: number) {
  const ac = audio()
  if (!ac || !drone) return
  const v = musicGain()
  const t = ac.currentTime
  drone.gain.gain.cancelScheduledValues(t)
  drone.gain.gain.setTargetAtTime(target * v, t, 0.4)
}

function stopDrone() {
  if (!drone) return
  const ac = audio()
  if (ac) {
    drone.gain.gain.setTargetAtTime(0, ac.currentTime, 0.15)
    const d = drone
    setTimeout(() => {
      try {
        d.osc.stop()
        d.rumble.stop()
      } catch {
        /* no-op */
      }
    }, 600)
  }
  drone = null
}

/* ---------------- public API ---------------- */

export const bossSfx = {
  /** fire — blip-launch */
  launch: () => {
    tone({ freq: 320, endFreq: 720, dur: 0.1, type: 'square', vol: 0.14 })
    tone({ freq: 1400, dur: 0.05, type: 'sine', vol: 0.1 })
  },
  /** curved miss — descending slide */
  descend: () => tone({ freq: 520, endFreq: 140, dur: 0.28, type: 'sine', vol: 0.12 }),
  /** eigen hit — FM bell + thud */
  bell: () => {
    tone({ freq: 1567, dur: 0.3, type: 'sine', vol: 0.2 })
    tone({ freq: 2350, dur: 0.2, type: 'sine', vol: 0.08 })
    tone({ freq: 110, dur: 0.12, type: 'sine', vol: 0.22 })
  },
  /** mega crit riser under the bell */
  riser: () => tone({ freq: 300, endFreq: 1800, dur: 0.4, type: 'sawtooth', vol: 0.07 }),
  /** flip shot — record-scratch then whoosh */
  scratchWhoosh: () => {
    tone({ freq: 900, endFreq: 250, dur: 0.09, type: 'sawtooth', vol: 0.14 })
    tone({ freq: 700, endFreq: 240, dur: 0.08, type: 'sawtooth', vol: 0.12, delay: 0.07 })
    tone({ freq: 240, endFreq: 950, dur: 0.22, type: 'sine', vol: 0.12, delay: 0.18 })
  },
  /** player hit — dull thump */
  thump: () => {
    tone({ freq: 95, endFreq: 55, dur: 0.18, type: 'sine', vol: 0.3 })
    noise({ dur: 0.1, vol: 0.1, freq: 300, q: 0.8 })
  },
  /** phase break — low roar */
  roar: () => {
    tone({ freq: 70, endFreq: 38, dur: 0.7, type: 'sawtooth', vol: 0.26 })
    noise({ dur: 0.6, vol: 0.16, freq: 180, q: 0.6 })
  },
  /** armor crack (3a → 3b) */
  crack: () => {
    noise({ dur: 0.16, vol: 0.22, freq: 2400, q: 1.4 })
    noise({ dur: 0.3, vol: 0.14, freq: 900, q: 1, delay: 0.08 })
    tone({ freq: 180, endFreq: 60, dur: 0.35, type: 'triangle', vol: 0.18, delay: 0.05 })
  },
  /** 3a swirling wind bed (one-shot loop-ish, re-triggered sparsely) */
  swirl: () => noise({ dur: 1.4, vol: 0.08, freq: 500, q: 2.2 }),
  /** pod powers down on fail — sad squeak */
  powerDown: () => {
    tone({ freq: 660, endFreq: 220, dur: 0.5, type: 'sine', vol: 0.16 })
    tone({ freq: 330, endFreq: 110, dur: 0.6, type: 'triangle', vol: 0.12, delay: 0.1 })
  },
  /** orb launch — soft hostile blip */
  orb: () => tone({ freq: 210, endFreq: 160, dur: 0.09, type: 'square', vol: 0.07 }),

  drone: {
    start: startDrone,
    stop: stopDrone,
    /** normal menace level */
    base: () => setDroneLevel(0.16),
    /** 3a dramatic swell */
    swell: () => setDroneLevel(0.3),
    /** duck under victory / dialogs */
    duck: () => setDroneLevel(0.05),
  },
}
