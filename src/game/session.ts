/**
 * VECTO session base — one level, one session. Owns the Engine, game state,
 * pointer dispatch, moves/hints bookkeeping, ghost-hand hint, idle nudges,
 * win/miss sequences (gameplay.md §2/§6). Chapter mechanics subclass this.
 */
import type { Vec } from './math'
import { clamp } from './math'
import { Engine } from './engine'
import type { LevelDef } from './levels'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

export type SessionState = 'intro' | 'play' | 'animating' | 'won'

/** everything the DOM dock/HUD needs, pushed on change */
export interface UiState {
  equation: string
  moves: number
  hints: number
  lockOn: boolean
  state: SessionState
  // ch1
  tray?: Vec[]
  chainLen?: number
  // ch2
  windA?: number
  windB?: number
  hasV?: boolean
  newWindActive?: boolean
  collected?: number
  // ch3/4/6 designer columns + machine state
  colA?: Vec
  colB?: Vec
  det?: number
  order?: number[]
  merged?: boolean
  editMachine?: number
  warped?: boolean
  canMerge?: boolean
}

export interface SessionEvents {
  onUi: (ui: UiState) => void
  onToast: (msg: string) => void
  onWin: (moves: number, hintsUsed: number) => void
}

export interface HintGesture {
  /** waypoints in world coords the ghost hand travels */
  path: Vec[]
  caption?: string
}

const IDLE_HINT_MS = 30000
const HINT_LOOP_MS = 1600
const HINT_LOOPS = 2

export abstract class Session {
  engine: Engine
  level: LevelDef
  events: SessionEvents
  state: SessionState = 'intro'
  moves = 0
  hintsUsed = 0
  missCount = 0
  lastInputMs = 0
  hint: { path: Vec[]; t0: number } | null = null
  missFlashT0 = -1000
  protected disposed = false

  constructor(canvas: HTMLCanvasElement, level: LevelDef, events: SessionEvents) {
    this.level = level
    this.events = events
    this.engine = new Engine(canvas, {
      onDown: (w, s) => this.handleDown(w, s),
      onMove: (w, s) => this.handleMove(w, s),
      onUp: (w, s) => this.handleUp(w, s),
      update: (dt) => this.tick(dt),
      draw: (ctx, eng) => this.draw(ctx, eng),
    })
  }

  /* ---- subclass contract ---- */
  abstract onDown(w: Vec, s: Vec): void
  abstract onMove(w: Vec, s: Vec): void
  abstract onUp(w: Vec, s: Vec): void
  abstract update(dtMs: number): void
  abstract drawWorld(ctx: CanvasRenderingContext2D, eng: Engine): void
  abstract equation(): string
  abstract go(): void
  abstract reset(): void
  abstract hintPath(): HintGesture | null
  /** world points that burst gold on win */
  abstract winBursts(): Vec[]
  /** bounding box of interactive content for camera auto-fit */
  abstract contentBounds(): { minX: number; minY: number; maxX: number; maxY: number }
  abstract uiExtras(): Partial<UiState>
  abstract serialize(): unknown
  abstract restore(data: unknown): void

  /* ---- base flow ---- */

  begin() {
    this.state = 'play'
    this.lastInputMs = this.engine.timeMs
    const b = this.contentBounds()
    this.engine.fitWorld(b.minX, b.minY, b.maxX, b.maxY, 1.5, true)
    this.emit()
  }

  frameContent() {
    const b = this.contentBounds()
    this.engine.fitWorld(b.minX, b.minY, b.maxX, b.maxY, 1.5, true)
  }

  setPaused(p: boolean) {
    if (this.state === 'won') return
    this.state = p ? 'intro' : 'play'
    if (!p) this.lastInputMs = this.engine.timeMs
  }

  private handleDown(w: Vec, s: Vec) {
    if (this.state !== 'play') return
    this.dismissHint()
    this.lastInputMs = this.engine.timeMs
    this.onDown(w, s)
  }

  private handleMove(w: Vec, s: Vec) {
    if (this.state !== 'play') return
    this.lastInputMs = this.engine.timeMs
    this.onMove(w, s)
  }

  private handleUp(w: Vec, s: Vec) {
    if (this.state !== 'play') return
    this.lastInputMs = this.engine.timeMs
    this.onUp(w, s)
  }

  private tick(dtMs: number) {
    this.update(dtMs)
    if (
      this.state === 'play' &&
      !this.hint &&
      this.engine.timeMs - this.lastInputMs > IDLE_HINT_MS &&
      this.hintPath()
    ) {
      this.showHint()
      this.lastInputMs = this.engine.timeMs
    }
  }

  /* ---- hints ---- */

  showHint() {
    const h = this.hintPath()
    if (!h || h.path.length < 2) return
    this.hint = { path: h.path, t0: this.engine.timeMs }
    this.hintsUsed++
    if (h.caption) this.events.onToast(h.caption)
    this.emit()
  }

  dismissHint() {
    this.hint = null
  }

  drawHint(ctx: CanvasRenderingContext2D, eng: Engine) {
    if (!this.hint) return
    const elapsed = eng.timeMs - this.hint.t0
    const total = HINT_LOOP_MS * HINT_LOOPS
    if (elapsed > total + 300) {
      this.hint = null
      return
    }
    const fade = elapsed > total ? 1 - (elapsed - total) / 300 : 1
    const loopT = (elapsed % HINT_LOOP_MS) / HINT_LOOP_MS
    const t = clamp(loopT < 0.8 ? loopT / 0.8 : 1, 0, 1)
    const path = this.hint.path
    let L = 0
    for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    let d = t * L
    let pt = path[0]
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
      if (d <= seg) {
        const k = seg < 1e-6 ? 0 : d / seg
        pt = { x: path[i - 1].x + (path[i].x - path[i - 1].x) * k, y: path[i - 1].y + (path[i].y - path[i - 1].y) * k }
        break
      }
      d -= seg
      pt = path[i]
    }
    ctx.save()
    ctx.globalAlpha = 0.4 * fade
    ctx.strokeStyle = eng.palette.amber
    ctx.lineWidth = 2
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    path.forEach((p, i) => {
      const sp = eng.worldToScreen(p)
      if (i === 0) ctx.moveTo(sp.x, sp.y)
      else ctx.lineTo(sp.x, sp.y)
    })
    ctx.stroke()
    ctx.setLineDash([])
    const sp = eng.worldToScreen(pt)
    eng.drawGlow(sp.x, sp.y, 26, eng.palette.amber, 0.5 * fade)
    ctx.fillStyle = eng.palette.amber
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(sp.x + 8, sp.y - 4)
    ctx.lineTo(sp.x + 24, sp.y - 16)
    ctx.lineTo(sp.x + 15, sp.y + 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /* ---- outcome ---- */

  commitMove() {
    this.moves++
    this.emit()
  }

  protected doWin(delayMs = 900) {
    if (this.state === 'won') return
    this.state = 'won'
    this.hint = null
    const eng = this.engine
    sfx.win()
    haptics.star()
    for (const p of this.winBursts()) eng.burst(p.x, p.y, 'collect')
    const first = this.winBursts()[0]
    if (first) eng.burst(first.x, first.y, 'win')
    // camera push-in 1.06×
    eng.tweenCam(eng.cam.cx, eng.cam.cy, eng.cam.scale * 1.06, 400)
    window.setTimeout(() => {
      if (!this.disposed) this.events.onWin(this.moves, this.hintsUsed)
    }, delayMs)
  }

  protected doMiss(toast?: string) {
    this.missCount++
    this.missFlashT0 = this.engine.timeMs
    sfx.error()
    haptics.error()
    this.engine.shake(2)
    if (toast) this.events.onToast(toast)
    if (this.missCount > 0 && this.missCount % 3 === 0) {
      window.setTimeout(() => {
        if (!this.disposed && this.state === 'play') this.showHint()
      }, 600)
    }
    this.emit()
  }

  get missFlash(): number {
    const age = this.engine.timeMs - this.missFlashT0
    return age < 300 ? 1 - age / 300 : 0
  }

  /* ---- emit + persistence ---- */

  emit() {
    if (this.disposed) return
    this.events.onUi({
      equation: this.equation(),
      moves: this.moves,
      hints: this.hintsUsed,
      lockOn: this.lockOn(),
      state: this.state,
      ...this.uiExtras(),
    })
    this.persist()
  }

  /** chapter predicate: is the primary button armed? */
  lockOn(): boolean {
    return true
  }

  persist() {
    /* subclass overrides via serialize */
  }

  /* ---- draw ---- */

  draw(ctx: CanvasRenderingContext2D, eng: Engine) {
    this.drawWorld(ctx, eng)
    this.drawHint(ctx, eng)
    if (this.missFlash > 0) {
      ctx.save()
      ctx.globalAlpha = this.missFlash * 0.1
      ctx.fillStyle = eng.palette.coral
      ctx.fillRect(0, 0, eng.cssW, eng.cssH)
      ctx.restore()
    }
  }

  dispose() {
    this.disposed = true
    this.engine.dispose()
  }
}
