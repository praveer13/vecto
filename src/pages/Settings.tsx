import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  Music,
  Volume2,
  VolumeX,
  Vibrate,
  Sparkles,
  Eye,
  Grid3x3,
  Trash2,
  Minus,
  Plus,
  Hand,
  Magnet,
  Palette,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import BottomSheet from '@/components/game/BottomSheet'
import IconButton from '@/components/game/IconButton'
import NeonButton from '@/components/game/NeonButton'
import Toast from '@/components/game/Toast'
import { useGameStore, type SettingsState, type ColorblindMode } from '@/store/gameStore'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'
import { cn } from '@/lib/utils'
import { PALETTES, SWATCH_KEYS } from '@/game/boss/palette'

/**
 * Settings — settings.md. Route `/settings` (anchor `#data` for the danger zone).
 * Calm readable panel: audio / feel / display & access / about / data.
 * Every control writes the zustand settings slice on change (sliders debounced
 * 150ms), live previews everywhere — nothing buried more than one scroll.
 */

const outExpo = [0.16, 1, 0.3, 1] as [number, number, number, number]
const sheetSpring = { type: 'spring', stiffness: 320, damping: 28 } as const

/** fields the settings slice doesn't declare yet — written through updateSettings anyway */
type ExtraSettings = { ghostHints?: boolean; snapStrength?: 'gentle' | 'normal' | 'sticky' }
const extra = (s: SettingsState) => s as SettingsState & ExtraSettings

/* ---------------- persistence (sliders debounced 150ms, settings.md §1) ---------------- */

function useSettingsWriter() {
  const updateSettings = useGameStore((s) => s.updateSettings)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Partial<SettingsState>>({})
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        useGameStore.getState().updateSettings(pending.current)
      }
    },
    [],
  )
  return useCallback(
    (patch: Partial<SettingsState>, debounce = false) => {
      if (!debounce) {
        updateSettings(patch)
        return
      }
      pending.current = { ...pending.current, ...patch }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        useGameStore.getState().updateSettings(pending.current)
        pending.current = {}
        timer.current = null
      }, 150)
    },
    [updateSettings],
  )
}

/* ---------------- 2s music preview loop (settings.md §1 — changes are audible) ---------------- */

let musicCtx: AudioContext | null = null
function previewMusicLoop() {
  const { musicOn, musicVolume, masterVolume } = useGameStore.getState().settings
  const v = musicOn ? musicVolume * masterVolume : 0
  if (typeof window === 'undefined' || v <= 0) return
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  if (!musicCtx) musicCtx = new AC()
  const ac = musicCtx
  if (ac.state === 'suspended') void ac.resume()
  const t0 = ac.currentTime + 0.02
  const master = ac.createGain()
  master.gain.setValueAtTime(0, t0)
  master.gain.linearRampToValueAtTime(0.22 * v, t0 + 0.15) // fade-in
  master.gain.setValueAtTime(0.22 * v, t0 + 1.7)
  master.gain.linearRampToValueAtTime(0, t0 + 2)
  master.connect(ac.destination)
  const note = (freq: number, at: number, dur: number, type: OscillatorType, vol: number) => {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0, t0 + at)
    g.gain.linearRampToValueAtTime(vol, t0 + at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
    o.connect(g).connect(master)
    o.start(t0 + at)
    o.stop(t0 + at + dur + 0.05)
  }
  // bass pulse (always) + little pentatonic arp — the two adaptive layers in miniature
  for (let i = 0; i < 4; i++) note(110, i * 0.5, 0.12, 'triangle', 0.5)
  ;[261.63, 329.63, 392.0, 523.25, 392.0, 329.63].forEach((f, i) =>
    note(f, 0.12 + i * 0.3, 0.18, 'triangle', 0.25),
  )
}

/* ---------------- shared bits ---------------- */

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}
const sectionItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: outExpo } },
}

function Section({
  title,
  children,
  danger = false,
  pulse = false,
  id,
  refCb,
}: {
  title: string
  children: React.ReactNode
  danger?: boolean
  pulse?: boolean
  id?: string
  refCb?: (el: HTMLElement | null) => void
}) {
  return (
    <motion.section
      variants={sectionItem}
      id={id}
      ref={refCb}
      className={cn(
        'rounded-lg border bg-night-2',
        danger ? 'border-danger/40' : 'border-line',
        pulse && 'shadow-glow-danger',
      )}
    >
      <h2 className="px-4 pt-3 text-caption font-extrabold uppercase text-low">{title}</h2>
      <div className="mt-1 flex flex-col divide-y divide-line/60">{children}</div>
    </motion.section>
  )
}

function Row({
  icon: Icon,
  label,
  sub,
  right,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  sub?: string
  right?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="px-4 py-2">
      <div className="flex min-h-[56px] items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-mid" />
        <div className="min-w-0 flex-1">
          <div className="text-title font-extrabold text-hi">{label}</div>
          {sub && <div className="text-[12px] font-bold leading-snug text-low">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function NeonSwitch({
  checked,
  onChange,
  ariaLabel,
  danger = false,
  disabled = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  ariaLabel: string
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => {
        haptics.tick()
        onChange(v)
      }}
      aria-label={ariaLabel}
      className={cn(
        'h-6 w-11 border-line bg-night-3 data-[state=unchecked]:bg-night-3',
        danger ? 'data-[state=checked]:bg-danger' : 'data-[state=checked]:bg-mint',
        '[&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:bg-hi',
      )}
    />
  )
}

/** slider row: −/+ steppers, mono value tick, haptic tick per 10% (settings.md §1/§5) */
function NeonSlider({
  value,
  onChange,
  onCommit,
  ariaLabel,
  accent = 'mint',
}: {
  value: number // 0..100
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  ariaLabel: string
  accent?: 'mint' | 'cyan' | 'amber'
}) {
  const bucket = useRef(Math.round(value / 10))
  const range =
    accent === 'mint'
      ? '[&_[data-slot=slider-range]]:bg-mint [&_[data-slot=slider-thumb]]:border-mint'
      : accent === 'cyan'
        ? '[&_[data-slot=slider-range]]:bg-cyan [&_[data-slot=slider-thumb]]:border-cyan'
        : '[&_[data-slot=slider-range]]:bg-amber [&_[data-slot=slider-thumb]]:border-amber'
  const step = (d: number) => {
    const v = Math.min(100, Math.max(0, Math.round(value + d)))
    haptics.tick()
    sfx.tick()
    onChange(v)
    onCommit?.(v)
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${ariaLabel} down`}
        onClick={() => step(-5)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-night-1 text-mid active:scale-90"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex min-h-[44px] flex-1 items-center">
        <Slider
          value={[value]}
          min={0}
          max={100}
          step={1}
          aria-label={ariaLabel}
          onValueChange={([v]) => {
            const b = Math.round(v / 10)
            if (b !== bucket.current) {
              bucket.current = b
              haptics.tick()
            }
            onChange(v)
          }}
          onValueCommit={([v]) => onCommit?.(v)}
          className={cn(
            '[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-night-3',
            '[&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:bg-night-2 [&_[data-slot=slider-thumb]]:transition-transform [&_[data-slot=slider-thumb]]:active:scale-125',
            range,
          )}
        />
      </div>
      <button
        type="button"
        aria-label={`${ariaLabel} up`}
        onClick={() => step(5)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-night-1 text-mid active:scale-90"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span className="w-9 shrink-0 text-right font-mono text-mono-s font-bold text-mid">{value}</span>
    </div>
  )
}

/** collapsible slider well (mute-all collapses sliders, height 200ms out-expo) */
function SliderWell({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: outExpo }}
          className="overflow-hidden"
        >
          <div className="pb-3 pl-8 pr-1 pt-1">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** segmented control — radiogroup, active pill slides (layoutId, spring sheet 250ms) */
function Segmented<T extends string>({
  id,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  id: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1 rounded-pill border border-line bg-night-1 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => {
            haptics.tick()
            sfx.tick()
            onChange(o.id)
          }}
          className="relative min-h-[36px] flex-1 rounded-pill px-2 text-caption font-extrabold uppercase"
        >
          {value === o.id && (
            <motion.span
              layoutId={`seg-${id}`}
              transition={sheetSpring}
              className="absolute inset-0 rounded-pill border border-line bg-night-3 shadow-panel"
            />
          )}
          <span className={cn('relative', value === o.id ? 'text-hi' : 'text-low')}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------------- live preview thumbnails (settings.md §2) ---------------- */

/** 80×56 warp preview: grid warps; with reduce-motion it crossfades instead */
function WarpThumb({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = 80
    const H = 56
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const drawState = (mix: number, alpha: number) => {
      // grid sheared by M = [1 0.55; 0 1] ^ mix
      ctx.globalAlpha = alpha
      ctx.strokeStyle = 'rgba(56,189,248,0.5)'
      ctx.lineWidth = 1
      const cx = W / 2
      const cy = H / 2
      const u = 9
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath()
        for (let s = -4; s <= 4; s++) {
          const x = cx + (i + 0.55 * mix * s) * u
          const y = cy + s * u * 0.6
          if (s === -4) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.beginPath()
        for (let s = -6; s <= 6; s++) {
          const x = cx + (s + 0.55 * mix * i) * u
          const y = cy + i * u * 0.6
          if (s === -6) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    let last = performance.now()
    let t = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      ctx.clearRect(0, 0, W, H)
      if (reduce) {
        // crossfade between states, 200ms every 1.7s
        const phase = t % 1.7
        const dir = Math.floor(t / 1.7) % 2 === 0 ? 1 : 0
        const f = Math.min(1, phase / 0.2)
        const mix = dir === 1 ? f : 1 - f
        drawState(1 - mix, 1)
        drawState(mix, mix)
      } else {
        // full warp tween 1.2s in-out, hold, back
        const cyc = t % 3.4
        let mix = 0
        if (cyc < 1.2) mix = cyc / 1.2
        else if (cyc < 1.7) mix = 1
        else if (cyc < 2.9) mix = 1 - (cyc - 1.7) / 1.2
        const e = mix < 0.5 ? 4 * mix ** 3 : 1 - Math.pow(-2 * mix + 2, 3) / 2
        drawState(e, 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduce])
  return (
    <canvas
      ref={ref}
      style={{ width: 80, height: 56 }}
      className="shrink-0 rounded-sm border border-line bg-night-1"
      aria-hidden
    />
  )
}

/** 80×56 grid-intensity preview: minor/major alpha scales with the setting */
function GridThumb({ intensity }: { intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = 80
    const H = 56
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const k = intensity
    for (let i = 1; i < 8; i++) {
      const major = i % 4 === 0
      ctx.strokeStyle = `rgba(56,189,248,${(major ? 0.45 : 0.2) * k})`
      ctx.lineWidth = major ? 1.4 : 1
      ctx.beginPath()
      ctx.moveTo((W / 8) * i, 0)
      ctx.lineTo((W / 8) * i, H)
      ctx.stroke()
    }
    for (let j = 1; j < 6; j++) {
      const major = j % 3 === 0
      ctx.strokeStyle = `rgba(56,189,248,${(major ? 0.45 : 0.2) * k})`
      ctx.lineWidth = major ? 1.4 : 1
      ctx.beginPath()
      ctx.moveTo(0, (H / 6) * j)
      ctx.lineTo(W, (H / 6) * j)
      ctx.stroke()
    }
    ctx.strokeStyle = `rgba(255,176,32,${0.5 * k})`
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(0, H / 2)
    ctx.lineTo(W, H / 2)
    ctx.stroke()
  }, [intensity])
  return (
    <canvas
      ref={ref}
      style={{ width: 80, height: 56 }}
      className="shrink-0 rounded-sm border border-line bg-night-1"
      aria-hidden
    />
  )
}

/* ---------------- reverse confetti (settings.md §5 — particles implode 400ms) ---------------- */

function ImplodeBurst() {
  const dots = useRef(
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 320,
      y: (Math.random() - 0.5) * 480,
      color: ['#FFB020', '#22D3EE', '#3DFFA2', '#FF2E93', '#FFD166'][i % 5],
    })),
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" aria-hidden>
      {dots.current.map((d) => (
        <motion.span
          key={d.id}
          initial={{ x: d.x, y: d.y, opacity: 1, scale: 1 }}
          animate={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
          transition={{ duration: 0.4, ease: 'easeIn' }}
          className="absolute h-2 w-2 rounded-full"
          style={{ backgroundColor: d.color }}
        />
      ))}
    </div>
  )
}

/* ---------------- the page ---------------- */

export default function Settings() {
  const navigate = useNavigate()
  const settings = useGameStore((s) => s.settings)
  const write = useSettingsWriter()

  const muted = settings.masterVolume === 0
  const prevMaster = useRef(settings.masterVolume > 0 ? settings.masterVolume : 0.8)

  const [sheet, setSheet] = useState<'credits' | 'privacy' | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [holding, setHolding] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dataPulse, setDataPulse] = useState(false)
  const dataRef = useRef<HTMLElement | null>(null)

  /* deep-link #data: scroll + one glow pulse to orient (settings.md §5) */
  useEffect(() => {
    if (window.location.hash === '#data') {
      const t1 = setTimeout(() => {
        dataRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setDataPulse(true)
        setTimeout(() => setDataPulse(false), 650)
      }, 380)
      return () => clearTimeout(t1)
    }
  }, [])

  const setMuted = (m: boolean) => {
    if (m) {
      if (settings.masterVolume > 0) prevMaster.current = settings.masterVolume
      write({ masterVolume: 0 })
      sfx.error()
    } else {
      write({ masterVolume: prevMaster.current > 0 ? prevMaster.current : 0.8 })
      sfx.tick()
    }
  }

  const doWipe = () => {
    setHolding(false)
    setArmed(false)
    setResetOpen(false)
    setWiping(true)
    haptics.phaseBreak()
    useGameStore.getState().resetAll()
    setTimeout(() => {
      setToast('Fresh grid. Good luck, Spark.')
      setTimeout(() => navigate('/'), 500)
    }, 400)
  }

  const ghostHints = extra(settings).ghostHints ?? true
  const snapStrength = extra(settings).snapStrength ?? 'normal'

  return (
    <div className="flex flex-1 flex-col">
      {/* chrome: back chevron · SETTINGS · GearCounter hidden (settings.md) */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line/60 bg-night-1/90 px-4 backdrop-blur-[12px]"
        style={{ marginTop: 'env(safe-area-inset-top)' }}
      >
        <IconButton ariaLabel="Back" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="font-display text-h1 text-hi">SETTINGS</h1>
        <span className="w-11" aria-hidden />
      </header>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 px-4 pb-12 pt-4"
      >
        {/* ============ Section 1 — Audio ============ */}
        <Section title="Audio">
          <Row
            icon={Music}
            label="Music"
            sub="Adaptive zone tunes"
            right={
              <NeonSwitch
                checked={settings.musicOn}
                ariaLabel="Music on or off"
                onChange={(v) => {
                  write({ musicOn: v })
                  if (v) previewMusicLoop()
                  else sfx.tick()
                }}
              />
            }
          >
            <SliderWell open={settings.musicOn && !muted}>
              <div className={cn(muted && 'pointer-events-none opacity-40')}>
                <NeonSlider
                  value={Math.round(settings.musicVolume * 100)}
                  ariaLabel="Music volume"
                  accent="cyan"
                  onChange={(v) => write({ musicVolume: v / 100 }, true)}
                  onCommit={() => previewMusicLoop()}
                />
              </div>
            </SliderWell>
          </Row>

          <Row
            icon={Volume2}
            label="Sound FX"
            sub="Plucks, chimes, thunk"
            right={
              <NeonSwitch
                checked={settings.sfxOn}
                ariaLabel="Sound effects on or off"
                onChange={(v) => {
                  write({ sfxOn: v })
                  if (v) sfx.pluck(0.7) // audible immediately
                }}
              />
            }
          >
            <SliderWell open={settings.sfxOn && !muted}>
              <div className={cn(muted && 'pointer-events-none opacity-40')}>
                <NeonSlider
                  value={Math.round(settings.sfxVolume * 100)}
                  ariaLabel="Sound effects volume"
                  accent="mint"
                  onChange={(v) => write({ sfxVolume: v / 100 }, true)}
                  onCommit={(v) => sfx.pluck(v / 100)}
                />
              </div>
            </SliderWell>
          </Row>

          <Row
            icon={VolumeX}
            label="Mute all"
            sub="Silence everything, fast"
            right={<NeonSwitch checked={muted} danger ariaLabel="Mute all audio" onChange={setMuted} />}
          />
        </Section>

        {/* ============ Section 2 — Feel ============ */}
        <Section title="Feel">
          <Row
            icon={Vibrate}
            label="Haptics"
            sub="Little buzzes on snaps & wins."
            right={
              <NeonSwitch
                checked={settings.hapticsOn}
                ariaLabel="Haptics on or off"
                onChange={(v) => {
                  write({ hapticsOn: v })
                  if (v) setTimeout(() => haptics.star(), 60) // demo [15,40,15]
                  sfx.tick()
                }}
              />
            }
          />
          <Row
            icon={Sparkles}
            label="Reduce Motion"
            sub="Calms particles, pulses & warps."
            right={
              <NeonSwitch
                checked={settings.reduceMotion}
                ariaLabel="Reduce motion on or off"
                onChange={(v) => write({ reduceMotion: v })}
              />
            }
          >
            <div className="flex items-center gap-3 pb-2 pl-8 pt-1">
              <WarpThumb reduce={settings.reduceMotion} />
              <p className="text-[12px] font-bold leading-snug text-low">
                {settings.reduceMotion ? 'Warps crossfade.' : 'Warps play out.'} Shown, not described.
              </p>
            </div>
          </Row>
          <Row icon={Grid3x3} label="Grid Intensity" sub="How loud the grid glows.">
            <div className="flex items-center gap-3 pb-2 pl-8 pt-1">
              <GridThumb intensity={settings.gridIntensity} />
              <div className="flex-1">
                <NeonSlider
                  value={Math.round(settings.gridIntensity * 100)}
                  ariaLabel="Grid intensity"
                  accent="amber"
                  onChange={(v) => write({ gridIntensity: v / 100 }, true)}
                />
              </div>
            </div>
          </Row>
        </Section>

        {/* ============ Section 3 — Display & Access ============ */}
        <Section title="Display & Access">
          <Row icon={Palette} label="Colorblind Mode" sub="Safe palettes + shape coding.">
            <div className="flex flex-col gap-2 pb-2 pl-8 pt-1">
              <Segmented
                id="cb"
                ariaLabel="Colorblind mode"
                value={settings.colorblind}
                onChange={(v) => write({ colorblind: v as ColorblindMode })}
                options={[
                  { id: 'off', label: 'Default' },
                  { id: 'protan', label: 'Protan' },
                  { id: 'deutan', label: 'Deutan' },
                  { id: 'tritan', label: 'Tritan' },
                ]}
              />
              {/* swatch strip crossfades 300ms to the selected palette */}
              <div className="flex gap-1.5" aria-hidden>
                {SWATCH_KEYS.map((k) => (
                  <motion.div
                    key={k}
                    className="h-6 flex-1 rounded-sm border border-line/50"
                    animate={{ backgroundColor: PALETTES[settings.colorblind][k] }}
                    transition={{ duration: 0.3 }}
                  />
                ))}
              </div>
            </div>
          </Row>
          <Row
            icon={Eye}
            label="Math Labels"
            sub="Show the live equation chip in levels."
            right={
              <NeonSwitch
                checked={settings.mathLabels}
                ariaLabel="Math labels on or off"
                onChange={(v) => write({ mathLabels: v })}
              />
            }
          />
          <Row
            icon={Hand}
            label="Ghost Hints"
            sub="The little helper hand."
            right={
              <NeonSwitch
                checked={ghostHints}
                ariaLabel="Ghost hints on or off"
                onChange={(v) => write({ ghostHints: v } as Partial<SettingsState>)}
              />
            }
          />
          <Row icon={Magnet} label="Snap Strength" sub="How hard the grid grabs your drops.">
            <div className="pb-2 pl-8 pt-1">
              <Segmented
                id="snap"
                ariaLabel="Snap strength"
                value={snapStrength}
                onChange={(v) => write({ snapStrength: v } as Partial<SettingsState>)}
                options={[
                  { id: 'gentle', label: 'Gentle' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'sticky', label: 'Sticky' },
                ]}
              />
            </div>
          </Row>
        </Section>

        {/* ============ Section 4 — About ============ */}
        <motion.div variants={sectionItem} className="flex flex-col items-center gap-1.5 py-4 text-center">
          <img src="/logo.svg" alt="VECTO" className="w-24 opacity-60" />
          <p className="font-mono text-mono-s text-low">VECTO v1.0.0</p>
          <p className="text-caption font-extrabold uppercase text-low">Tiny arrows. Big adventures.</p>
          <p className="text-body font-semibold text-mid">Made for math lovers who’d rather play.</p>
          <div className="mt-2 flex gap-4">
            <button
              type="button"
              onClick={() => {
                haptics.tick()
                setSheet('credits')
              }}
              className="min-h-[44px] px-3 text-caption font-extrabold uppercase text-mid underline decoration-line underline-offset-4"
            >
              Credits
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.tick()
                setSheet('privacy')
              }}
              className="min-h-[44px] px-3 text-caption font-extrabold uppercase text-mid underline decoration-line underline-offset-4"
            >
              Privacy
            </button>
          </div>
        </motion.div>

        {/* ============ Section 5 — Data (danger zone) ============ */}
        <Section title="Data" danger pulse={dataPulse} id="data" refCb={(el) => (dataRef.current = el)}>
          <div className="px-4 py-4">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                haptics.error()
                sfx.error()
                setArmed(false)
                setResetOpen(true)
              }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-danger text-title font-extrabold text-danger transition-shadow active:shadow-glow-danger"
            >
              <Trash2 className="h-5 w-5" />
              Reset all progress
            </motion.button>
            <p className="mt-2 text-center text-[12px] font-bold text-low">
              Wipes levels, stars, gears, cards, badges & skins. Forever.
            </p>
          </div>
        </Section>
      </motion.div>

      {/* about sheets */}
      <BottomSheet open={sheet === 'credits'} onClose={() => setSheet(null)} ariaLabel="Credits">
        <h2 className="mb-3 font-display text-h1 text-hi">CREDITS</h2>
        <div className="flex flex-col gap-2 text-body font-semibold text-mid">
          <p>
            <span className="text-hi">Design & engineering</span> — the VECTO team
          </p>
          <p>
            <span className="text-hi">Math verification</span> — the Gridverse council
          </p>
          <p>
            <span className="text-hi">Fonts</span> — Bungee, Nunito, JetBrains Mono (Google Fonts)
          </p>
          <p>
            <span className="text-hi">Icons</span> — Lucide + the custom VECTO set
          </p>
          <p>
            <span className="text-hi">Art</span> — generated in-studio with love
          </p>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'privacy'} onClose={() => setSheet(null)} ariaLabel="Privacy">
        <h2 className="mb-3 font-display text-h1 text-hi">PRIVACY</h2>
        <p className="text-body font-semibold text-mid">
          Everything lives on your device. No accounts, no tracking, no ads. Your progress is stored
          only in this browser’s local storage, and RESET ALL PROGRESS wipes it completely whenever
          you want.
        </p>
      </BottomSheet>

      {/* reset confirm — two-step: SURE? then 1s long-press to wipe */}
      <AnimatePresence>
        {resetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="scrim fixed inset-0 z-40"
              onClick={() => {
                setResetOpen(false)
                setArmed(false)
                setHolding(false)
              }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm reset"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="fixed left-1/2 top-1/2 z-40 w-[86%] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-night-2 p-5 shadow-panel"
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <motion.img
                  src="/mascot-vex.png"
                  alt="Vex looking worried"
                  className="h-20 w-20"
                  animate={{ rotate: [-8, -4, -8] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <h2 className="font-display text-display-l text-hi">SURE?</h2>
                <p className="text-body font-semibold text-mid">
                  The Gridverse will forget you were here.
                </p>
                <div className="mt-2 flex w-full flex-col gap-2">
                  {/* the safe choice is the pretty one */}
                  <NeonButton
                    onClick={() => {
                      setResetOpen(false)
                      setArmed(false)
                      setHolding(false)
                    }}
                  >
                    Keep my stuff
                  </NeonButton>
                  {!armed ? (
                    <button
                      type="button"
                      onClick={() => {
                        haptics.error()
                        setArmed(true)
                      }}
                      className="flex h-14 items-center justify-center rounded-pill bg-danger text-title font-extrabold text-night-0"
                    >
                      Yes, wipe it
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Hold for one second to wipe all progress"
                      onPointerDown={() => setHolding(true)}
                      onPointerUp={() => setHolding(false)}
                      onPointerLeave={() => setHolding(false)}
                      className="relative flex h-14 items-center justify-center overflow-hidden rounded-pill border-[1.5px] border-danger text-title font-extrabold text-danger"
                    >
                      <motion.span
                        className="absolute inset-y-0 left-0 bg-danger/50"
                        initial={false}
                        animate={{ width: holding ? '100%' : '0%' }}
                        transition={{ duration: holding ? 1 : 0.15, ease: 'linear' }}
                        onAnimationComplete={() => holding && doWipe()}
                      />
                      <span className="relative">HOLD TO WIPE</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {wiping && <ImplodeBurst />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
