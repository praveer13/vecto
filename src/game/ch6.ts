/**
 * Chapter 6 — Rewind Rift: The Collapse warped critters away from home
 * (world starts warped by M). Design the REWIND machine R in the basis
 * widget; the Area Juice gauge shows det(R) live. REWIND tweens the world
 * from M to R·M — critters ride it home when R ≈ M⁻¹. 6-7 is the det=0
 * set-piece: the grid lies flattened on a line, REWIND fizzles, and the
 * critters are dragged home along the line. (gameplay.md §5 Ch6)
 */
import type { Mat, Vec } from './math'
import { IDENTITY, apply, det, fmt, isIdentity, mul, projectOntoLine, snapTo, vec } from './math'
import type { Engine } from './engine'
import { drawCoordLabel, drawPad } from './engine'
import { Session } from './session'
import type { HintGesture, SessionEvents, UiState } from './session'
import type { Ch6Level } from './levels'
import { saveMidLevel } from './levels'
import { BasisWidget, PAD_TOL, drawCritter, drawMachinePod } from './machine'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

const GRAB_PX = 30

export class Ch6Session extends Session {
  declare level: Ch6Level
  widget = new BasisWidget()
  /** collapse mode: current slid positions (start at M·home) */
  slide: Vec[]
  dragCritter = -1
  dragCol: 0 | 1 | null = null
  leverT = 0
  leverAnim: { to: number; t0: number } | null = null
  rewinding = false
  saved = new Set<number>()
  vexPos: Vec = vec(0, 0)

  constructor(canvas: HTMLCanvasElement, level: Ch6Level, events: SessionEvents) {
    super(canvas, level, events)
    this.level = level
    this.slide = level.homes.map((h) => apply(level.m, h))
    const b = this.contentBounds()
    this.vexPos = vec((b.minX + b.maxX) / 2, b.minY - 0.6)
    this.widget.title = 'REWIND COLUMNS'
  }

  get collapse(): boolean {
    return !!this.level.collapse
  }

  R(): Mat {
    return this.widget.matrix()
  }

  critterPos(i: number): Vec {
    if (this.collapse) return this.slide[i]
    return apply(this.engine.warpMatrix(), this.level.homes[i])
  }

  lockOn(): boolean {
    if (this.collapse) return false
    return isIdentity(mul(this.R(), this.level.m), 0.12)
  }

  begin() {
    super.begin()
    if (this.collapse) {
      // the dramatic beat: grid flattens onto the line
      this.engine.warpCur = { ...IDENTITY }
      window.setTimeout(() => {
        if (!this.disposed) {
          sfx.warp()
          this.engine.startWarp(this.level.m, 900)
        }
      }, 350)
    } else {
      this.engine.warpCur = { ...this.level.m }
    }
  }

  /* ---------- pointer ---------- */

  onDown(w: Vec, s: Vec) {
    if (!this.collapse && !this.rewinding) {
      const hit = this.widget.hit(this.engine, s)
      if (hit !== null) {
        this.dragCol = hit
        haptics.tick()
        sfx.pluck(0.4)
        return
      }
    }
    if (this.collapse) {
      for (let i = 0; i < this.slide.length; i++) {
        if (this.saved.has(i)) continue
        const sp = this.engine.worldToScreen(this.slide[i])
        if (Math.hypot(sp.x - s.x, sp.y - s.y) < GRAB_PX) {
          this.dragCritter = i
          haptics.tick()
          sfx.pluck(0.5)
          return
        }
      }
    }
  }

  onMove(w: Vec, s: Vec) {
    if (this.dragCol !== null) {
      if (this.widget.dragTo(this.engine, s, this.dragCol)) {
        haptics.tick()
        this.emit()
      }
      return
    }
    if (this.dragCritter >= 0 && this.level.collapse) {
      const onLine = projectOntoLine(w, vec(0, 0), this.level.collapse.lineDir)
      const snapped = { x: snapTo(onLine.x, 0.5), y: snapTo(onLine.y, 0.5) }
      const cur = this.slide[this.dragCritter]
      if (cur.x !== snapped.x || cur.y !== snapped.y) {
        this.slide[this.dragCritter] = snapped
        haptics.tick()
        this.emit()
      }
    }
  }

  onUp() {
    if (this.dragCol !== null) {
      haptics.release()
      this.dragCol = null
      this.emit()
      return
    }
    if (this.dragCritter >= 0) {
      const i = this.dragCritter
      this.dragCritter = -1
      const home = this.level.homes[i]
      const p = this.slide[i]
      if (Math.hypot(p.x - home.x, p.y - home.y) <= PAD_TOL + 0.15) {
        this.slide[i] = { ...home }
        this.saved.add(i)
        this.commitMove()
        haptics.star()
        sfx.snap()
        this.engine.burst(home.x, home.y, 'collect')
        if (this.saved.size >= this.level.homes.length) {
          this.doWin(600)
        } else {
          this.events.onToast(`${this.level.homes.length - this.saved.size} still out there!`)
        }
      } else {
        haptics.release()
      }
      this.emit()
    }
  }

  /* ---------- REWIND ---------- */

  go() {
    if (this.state !== 'play' || this.engine.warping || this.rewinding) return
    this.commitMove()
    const R = this.R()
    // det = 0 fizzle (the player's R is singular — or the world itself is)
    if (this.collapse || Math.abs(det(R)) < 0.05) {
      this.state = 'animating'
      this.pullLever(() => {
        sfx.error()
        haptics.error()
        const mid = this.engine.screenToWorld({ x: this.engine.cssW / 2, y: 56 })
        this.engine.burst(mid.x, mid.y, 'puff')
        this.state = 'play'
        this.doMiss(this.collapse ? 'det = 0 — nothing left to rewind' : 'No juice! That machine fizzles')
      })
      return
    }
    this.state = 'animating'
    this.rewinding = true
    this.pullLever(() => {
      sfx.warp()
      haptics.release()
      const target = mul(R, this.level.m)
      this.engine.startWarp(target, 600, () => {
        const ok = this.level.homes.every((h) => {
          const landed = apply(target, h)
          return Math.hypot(landed.x - h.x, landed.y - h.y) <= PAD_TOL
        })
        if (ok) {
          this.rewinding = false
          this.doWin(700)
        } else {
          // the world snaps back to its warped state
          window.setTimeout(() => {
            if (this.disposed) return
            sfx.warp()
            this.engine.startWarp(this.level.m, 600, () => {
              this.rewinding = false
              this.state = 'play'
              this.doMiss('Almost! Watch the Area Juice')
              this.emit()
            })
          }, 400)
        }
      })
    })
  }

  private pullLever(fire: () => void) {
    this.leverAnim = { to: 1, t0: this.engine.timeMs }
    window.setTimeout(() => {
      if (this.disposed) return
      fire()
      this.leverAnim = { to: 0, t0: this.engine.timeMs }
    }, 150)
  }

  reset() {
    this.widget.reset()
    this.slide = this.level.homes.map((h) => apply(this.level.m, h))
    this.saved.clear()
    this.dragCritter = -1
    this.dragCol = null
    this.rewinding = false
    this.moves = 0
    this.missCount = 0
    this.state = 'play'
    this.engine.warpCur = { ...this.level.m }
    this.engine.warpAnim = null
    this.emit()
  }

  hintPath(): HintGesture | null {
    if (this.collapse) {
      const i = this.level.homes.findIndex((_, idx) => !this.saved.has(idx))
      if (i >= 0) {
        return { path: [this.slide[i], this.level.homes[i]], caption: 'Slide them home along the line!' }
      }
      return null
    }
    const M = this.level.m
    const d = det(M)
    if (Math.abs(d) > 1e-6) {
      const invC1 = { x: M.d / d, y: -M.b / d }
      const from = this.widget.tipScreen(this.engine, this.widget.c1)
      const to = this.widget.tipScreen(this.engine, invC1)
      return {
        path: [this.engine.screenToWorld(from), this.engine.screenToWorld(to)],
        caption: 'Columns that undo the warp!',
      }
    }
    return null
  }

  winBursts(): Vec[] {
    return this.level.homes
  }

  contentBounds() {
    const xs = [0]
    const ys = [0]
    for (const h of this.level.homes) {
      xs.push(h.x)
      ys.push(h.y)
      const w = apply(this.level.m, h)
      xs.push(w.x)
      ys.push(w.y)
    }
    return {
      minX: Math.min(...xs, -2),
      maxX: Math.max(...xs, 2),
      minY: Math.min(...ys, -2),
      maxY: Math.max(...ys, 2),
    }
  }

  uiExtras(): Partial<UiState> {
    return {
      colA: { ...this.widget.c1 },
      colB: { ...this.widget.c2 },
      det: det(this.R()),
      collected: this.saved.size,
    }
  }

  equation(): string {
    if (this.collapse) return 'det = 0 — the world is a line'
    const d = det(this.R())
    const flip = d < 0 ? ' · mirrored' : ''
    return `det = ${fmt(d)} · area ×${fmt(Math.abs(d))}${flip}`
  }

  serialize(): unknown {
    return { c1: this.widget.c1, c2: this.widget.c2, slide: this.slide, saved: [...this.saved], moves: this.moves }
  }

  restore(data: unknown) {
    const d = data as { c1?: Vec; c2?: Vec; slide?: Vec[]; saved?: number[]; moves?: number }
    if (d?.c1) this.widget.c1 = { ...d.c1 }
    if (d?.c2) this.widget.c2 = { ...d.c2 }
    if (Array.isArray(d?.slide) && d.slide.length === this.slide.length) {
      this.slide = d.slide.map((v) => ({ ...v }))
    }
    if (Array.isArray(d?.saved)) this.saved = new Set(d.saved)
    if (typeof d?.moves === 'number') this.moves = d.moves
  }

  persist() {
    if (this.state === 'play') saveMidLevel(this.level.id, this.serialize())
  }

  /* ---------- per-frame ---------- */

  update() {
    if (this.leverAnim) {
      const k = Math.min(1, (this.engine.timeMs - this.leverAnim.t0) / 150)
      this.leverT = this.leverAnim.to === 1 ? k : 1 - k
      if (k >= 1 && this.leverAnim.to === 0) this.leverAnim = null
    }
  }

  /* ---------- draw ---------- */

  drawWorld(ctx: CanvasRenderingContext2D, eng: Engine) {
    const P = eng.palette
    // the collapse line (6-7): the whole world lies here
    if (this.collapse) {
      const dir = this.level.collapse!.lineDir
      const L = 9
      const a = eng.worldToScreen({ x: -dir.x * L, y: -dir.y * L })
      const b = eng.worldToScreen({ x: dir.x * L, y: dir.y * L })
      ctx.save()
      ctx.strokeStyle = P.coral
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.restore()
      eng.drawGlow((a.x + b.x) / 2, (a.y + b.y) / 2, 60, P.coral, 0.25)
    }
    // home pads
    this.level.homes.forEach((h, i) => {
      drawPad(eng, h, {
        lockOn: this.collapse && this.saved.has(i),
        collected: this.saved.has(i),
        label: i === 0 ? 'HOME' : undefined,
      })
    })
    // critters
    for (let i = 0; i < this.level.homes.length; i++) {
      const p = this.critterPos(i)
      const color = [P.cyan, P.violet, P.mint][i % 3]
      drawCritter(eng, p, color, { grabbed: this.dragCritter === i, saved: this.saved.has(i) })
      if (this.dragCritter === i) drawCoordLabel(eng, p, 'slide me home', P.coral, 36)
    }
    // rewind machine pod
    drawMachinePod(eng, eng.cssW / 2, 56, 'R⁻¹', P.coral, this.leverT, { selected: this.rewinding })
    // basis widget (hidden in collapse mode — no machine can help)
    if (!this.collapse) this.widget.draw(eng, { accent: P.coral })
    eng.drawVex(eng.screenToWorld({ x: eng.cssW / 2 + 66, y: 52 }), 0.8)
  }
}
