import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/gameStore'

/**
 * GridBackdrop — home/title animated canvas (home.md §1), also reusable as the
 * ambient layer on menu screens. Pure canvas + rAF; DOM passes touches through.
 *
 * Draws: live perspective grid horizon (receding cyan lines, warm amber
 * vanishing glow at 62% height), horizon rows pulsing in an outward-traveling
 * wave (6s loop), 24 drifting/twinkling star particles, a shooting star every
 * 7–11s, and 2–3 faint warp ripples per minute (grid locally bulges, 900ms).
 * Reduce motion: single static frame, no particles/ripples.
 */
interface Star {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  phase: number
}
interface Ripple {
  x: number
  t0: number
}
interface Shooter {
  t0: number
  x: number
  y: number
  dx: number
  dy: number
}

const GRID_ROWS = 14
const GRID_COLS = 8
const STAR_COUNT = 24
const RIPPLE_MS = 900
const SHOOT_MS = 700

export default function GridBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)
  const gridIntensity = useGameStore((s) => s.settings.gridIntensity)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    let w = 0
    let h = 0
    let dpr = 1

    const stars: Star[] = []
    const ripples: Ripple[] = []
    let shooter: Shooter | null = null
    let nextShoot = performance.now() + 7000 + Math.random() * 4000
    let nextRipple = performance.now() + 12000 + Math.random() * 12000

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2.5, window.devicePixelRatio || 1)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.4,
        vx: -(4 + Math.random() * 4) / 1000, // px/ms leftward
        vy: -(4 + Math.random() * 4) / 1300, // slower upward
        phase: Math.random() * Math.PI * 2,
      })
    }

    const drawGrid = (now: number, animated: boolean) => {
      const hy = h * 0.62
      const vpx = w / 2
      const k = gridIntensity

      // warm amber vanishing glow
      const glow = ctx.createRadialGradient(vpx, hy, 0, vpx, hy, h * 0.28)
      glow.addColorStop(0, `rgba(255,176,32,${0.34 * k})`)
      glow.addColorStop(0.35, `rgba(255,176,32,${0.12 * k})`)
      glow.addColorStop(1, 'rgba(255,176,32,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // active warp ripple offset for a given x (bulge, in px)
      const rippleAt = (x: number): number => {
        if (!animated) return 0
        let d = 0
        for (const r of ripples) {
          const p = (now - r.t0) / RIPPLE_MS
          if (p < 0 || p > 1) continue
          const g = Math.exp(-Math.pow((x - r.x) / (w * 0.09), 2))
          d += Math.sin(p * Math.PI) * g * w * 0.02
        }
        return d
      }

      // converging verticals
      for (let i = -GRID_COLS; i <= GRID_COLS; i++) {
        const xb = vpx + (i * w) / GRID_COLS / 1.6
        const major = i % 5 === 0
        ctx.strokeStyle = `rgba(56,189,248,${(major ? 0.15 : 0.07) * k})`
        ctx.lineWidth = major ? 1.6 : 1
        ctx.beginPath()
        const steps = 16
        for (let s = 0; s <= steps; s++) {
          const t = s / steps
          const y = hy + (h - hy) * t
          const x = vpx + (xb - vpx) * t + rippleAt(vpx + (xb - vpx) * t)
          if (s === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // horizon rows with outward-traveling brightness wave (6s loop)
      for (let j = 1; j <= GRID_ROWS; j++) {
        const t = Math.pow(j / GRID_ROWS, 2.1)
        const y = hy + (h - hy) * t
        let a: number
        if (animated) {
          a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin((now / 6000) * Math.PI * 2 - j * 0.5))
        } else {
          a = 0.14
        }
        const major = j % 5 === 0
        ctx.strokeStyle = `rgba(56,189,248,${Math.min(0.3, a * (major ? 1.5 : 1)) * k})`
        ctx.lineWidth = major ? 1.6 : 1
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      // horizon line
      ctx.strokeStyle = `rgba(255,176,32,${0.35 * k})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, hy)
      ctx.lineTo(w, hy)
      ctx.stroke()
    }

    const drawStars = (now: number, dt: number) => {
      for (const s of stars) {
        s.x += (s.vx * dt) / w
        s.y += (s.vy * dt) / h
        if (s.x < -0.02) s.x = 1.02
        if (s.y < -0.02) s.y = 1.02
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((now / 3000) * Math.PI * 2 + s.phase))
        ctx.fillStyle = `rgba(234,242,255,${tw * 0.85})`
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * h * 0.6, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const drawShooter = (now: number) => {
      if (!shooter) return
      const p = (now - shooter.t0) / SHOOT_MS
      if (p >= 1) {
        shooter = null
        return
      }
      const eased = 1 - Math.pow(1 - p, 3) // out-expo-ish
      const head = eased * 600
      const tail = Math.max(0, head - 120 * (1 - p * 0.6))
      const hx = shooter.x + shooter.dx * head
      const hy2 = shooter.y + shooter.dy * head
      const tx = shooter.x + shooter.dx * tail
      const ty = shooter.y + shooter.dy * tail
      const grad = ctx.createLinearGradient(tx, ty, hx, hy2)
      const fade = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1 // fade tail last 300ms
      grad.addColorStop(0, 'rgba(255,209,102,0)')
      grad.addColorStop(1, `rgba(255,240,200,${0.9 * fade})`)
      ctx.strokeStyle = grad
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(hx, hy2)
      ctx.stroke()
    }

    let last = performance.now()
    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min(64, now - last)
      last = now
      ctx.clearRect(0, 0, w, h)

      // schedule ambient events
      if (now >= nextShoot) {
        const ang = Math.PI * (0.18 + Math.random() * 0.12)
        shooter = {
          t0: now,
          x: Math.random() * w * 0.7,
          y: Math.random() * h * 0.25,
          dx: Math.cos(ang),
          dy: Math.sin(ang),
        }
        nextShoot = now + 7000 + Math.random() * 4000
      }
      if (now >= nextRipple) {
        ripples.push({ x: w * (0.25 + Math.random() * 0.5), t0: now })
        if (ripples.length > 3) ripples.shift()
        nextRipple = now + 20000 + Math.random() * 20000 // ~2-3 per minute
      }

      drawGrid(now, true)
      drawStars(now, dt)
      drawShooter(now)
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      cancelAnimationFrame(raf)
      last = performance.now()
      if (reduceMotion) {
        ctx.clearRect(0, 0, w, h)
        drawGrid(last, false) // static fallback: grid + glow only
      } else {
        raf = requestAnimationFrame(frame)
      }
    }

    const onVis = () => {
      running = document.visibilityState === 'visible'
      if (running) start()
    }
    document.addEventListener('visibilitychange', onVis)
    start()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reduceMotion, gridIntensity])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
