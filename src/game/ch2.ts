/**
 * Chapter 2 — Windfall Isles: scale two winds (linear combination) so the
 * raft lands on the target isle. Wind handles drag on-canvas; the dock has
 * arc sliders. Reachable-fan parallelogram = span (collapses to a line when
 * winds are parallel, 2-6). (gameplay.md §5 Ch2)
 */
import type { Engine, Vec } from '@gridverse/kit/engine'
import { Spring, add, clamp, dist, drawCoordLabel, drawPad, fmt, fmtScalar, fmtVec, scale, snapTo, vec } from '@gridverse/kit/engine'
import { Session, type HintGesture, type SessionEvents } from '@gridverse/kit/session'
import type { Ch2Level } from './levels'
import { saveMidLevel } from './levels'
import { haptics } from '@gridverse/kit/lib'
import { sfx } from '@gridverse/kit/lib'

const LOCK_DIST = 0.45
const MAX_SCALE = 3
const GRAB_PX = 30

interface Ch2Extras {
  windA: number
  windB: number
  hasV: boolean
  newWindActive: boolean
  collected: number
  colB?: Vec
}

export class Ch2Session extends Session<Ch2Level, Ch2Extras> {
  declare level: Ch2Level
  a = 0
  b = 0
  vVec: Vec
  basePos: Vec = vec(0, 0)
  collected = new Set<number>()
  nextIdx = 0 // cumulative mode
  dragWind: 0 | 1 | null = null
  springs = [new Spring(0, 0), new Spring(0, 0)]
  sailing: { from: Vec; to: Vec; t: number; dur: number; idx: number } | null = null
  vexPos: Vec = vec(0, 0)
  newWindTaken = false
  private lastFanSweep = 0

  constructor(canvas: HTMLCanvasElement, level: Ch2Level, events: SessionEvents<Ch2Extras>) {
    super(canvas, level, events)
    this.level = level
    this.vVec = level.v ? { ...level.v } : { ...level.u }
    this.syncSprings()
  }

  get hasV(): boolean {
    return this.level.v !== null || this.newWindTaken
  }

  dest(): Vec {
    return add(this.basePos, add(scale(this.level.u, this.a), scale(this.vVec, this.hasV ? this.b : 0)))
  }

  /** index of the isle the destination currently locks onto (−1 = none) */
  targetHit(): number {
    const d = this.dest()
    if (this.level.cumulative) {
      const t = this.level.targets[this.nextIdx]
      return t && dist(d, t) <= LOCK_DIST ? this.nextIdx : -1
    }
    for (let i = 0; i < this.level.targets.length; i++) {
      if (this.collected.has(i)) continue
      if (dist(d, this.level.targets[i]) <= LOCK_DIST) return i
    }
    return -1
  }

  lockOn(): boolean {
    return this.targetHit() >= 0
  }

  /* ---------- dock bridge ---------- */

  setScale(which: 0 | 1, val: number) {
    if (this.state !== 'play') return
    const v = clamp(snapTo(val, 0.5), -MAX_SCALE, MAX_SCALE)
    const prev = which === 0 ? this.a : this.b
    if (prev === v) return
    if (Math.sign(prev) !== Math.sign(v) && prev !== 0 && v !== 0) haptics.tick() // whip-crack flip
    if (which === 0) this.a = v
    else this.b = v
    this.syncSprings()
    this.lastInputMs = this.engine.timeMs
    this.emit()
  }

  stepScale(which: 0 | 1, dir: 1 | -1) {
    this.setScale(which, (which === 0 ? this.a : this.b) + dir * 0.5)
  }

  private syncSprings() {
    const t0 = add(this.basePos, scale(this.level.u, this.a || 0.35))
    this.springs[0].set(t0.x, t0.y)
    const t1 = add(this.basePos, scale(this.vVec, this.b || 0.35))
    this.springs[1].set(t1.x, t1.y)
  }

  /* ---------- pointer ---------- */

  private windTip(which: 0 | 1): Vec {
    const s = which === 0 ? this.a : this.b
    const w = which === 0 ? this.level.u : this.vVec
    return add(this.basePos, scale(w, s || 0.35))
  }

  onDown(_w: Vec, s: Vec) {
    const nw = this.level.newWind
    if (nw && !this.newWindTaken) {
      const sp = this.engine.worldToScreen(nw.at)
      if (Math.hypot(sp.x - s.x, sp.y - s.y) < GRAB_PX + 8) {
        this.newWindTaken = true
        this.vVec = { ...nw.v }
        this.b = 0
        this.syncSprings()
        haptics.release()
        sfx.win()
        this.engine.burst(nw.at.x, nw.at.y, 'collect', this.engine.palette.cyan)
        this.events.onToast('New Wind! The fan re-opens')
        this.emit()
        return
      }
    }
    const tips = [this.windTip(0), this.hasV ? this.windTip(1) : null]
    for (let i = 0; i < tips.length; i++) {
      const t = tips[i]
      if (!t) continue
      const sp = this.engine.worldToScreen(t)
      if (Math.hypot(sp.x - s.x, sp.y - s.y) < GRAB_PX) {
        this.dragWind = i as 0 | 1
        haptics.tick()
        sfx.pluck(Math.abs(i === 0 ? this.a : this.b) / MAX_SCALE)
        return
      }
    }
  }

  onMove(w: Vec) {
    if (this.dragWind === null) return
    const i = this.dragWind
    const wind = i === 0 ? this.level.u : this.vVec
    const rel = { x: w.x - this.basePos.x, y: w.y - this.basePos.y }
    const d2 = wind.x * wind.x + wind.y * wind.y
    const proj = d2 < 1e-9 ? 0 : (rel.x * wind.x + rel.y * wind.y) / d2
    this.setScale(i, proj)
  }

  onUp() {
    if (this.dragWind !== null) {
      haptics.release()
      const tip = this.windTip(this.dragWind)
      this.engine.burst(tip.x, tip.y, 'snap')
      this.dragWind = null
      this.emit()
    }
  }

  /* ---------- SAIL ---------- */

  go() {
    if (this.state !== 'play') return
    if (this.a === 0 && (!this.hasV || this.b === 0)) {
      this.events.onToast(this.level.coach)
      return
    }
    this.commitMove()
    const hit = this.targetHit()
    if (hit < 0) {
      this.doMiss('So close! Adjust the winds.')
      return
    }
    const to = { ...this.level.targets[hit] }
    this.state = 'animating'
    this.sailing = { from: { ...this.vexPos }, to, t: 0, dur: 550, idx: hit }
    sfx.squeak()
    haptics.release()
  }

  private finishSail() {
    const s = this.sailing!
    this.sailing = null
    this.collected.add(s.idx)
    this.nextIdx++
    this.basePos = { ...s.to }
    this.vexPos = { ...s.to }
    this.engine.burst(s.to.x, s.to.y, 'collect')
    sfx.snap()
    const done = this.level.cumulative
      ? this.nextIdx >= this.level.targets.length
      : this.level.collectAll
        ? this.collected.size >= this.level.targets.length
        : true
    this.a = 0
    this.b = 0
    this.syncSprings()
    this.state = 'play'
    if (done) {
      this.doWin(500)
    } else {
      const left = this.level.cumulative
        ? this.level.targets.length - this.nextIdx
        : this.level.targets.length - this.collected.size
      this.events.onToast(`${left} to go!`)
    }
    this.emit()
  }

  reset() {
    this.a = 0
    this.b = 0
    this.vVec = this.level.v ? { ...this.level.v } : { ...this.level.u }
    this.basePos = vec(0, 0)
    this.vexPos = vec(0, 0)
    this.collected.clear()
    this.nextIdx = 0
    this.newWindTaken = false
    this.moves = 0
    this.missCount = 0
    this.state = 'play'
    this.syncSprings()
    this.emit()
  }

  hintPath(): HintGesture | null {
    const t = this.level.cumulative
      ? this.level.targets[this.nextIdx]
      : this.level.targets.find((_, i) => !this.collected.has(i))
    if (!t) return null
    const u = this.level.u
    const d2 = u.x * u.x + u.y * u.y
    const rel = { x: t.x - this.basePos.x, y: t.y - this.basePos.y }
    const proj = d2 < 1e-9 ? 0 : (rel.x * u.x + rel.y * u.y) / d2
    const targetA = clamp(snapTo(proj, 0.5), -MAX_SCALE, MAX_SCALE)
    return {
      path: [this.windTip(0), add(this.basePos, scale(u, targetA || 1))],
      caption: 'Drag a wind handle!',
    }
  }

  winBursts(): Vec[] {
    return this.level.cumulative
      ? [this.level.targets[this.level.targets.length - 1]]
      : this.level.targets.filter((_, i) => this.collected.has(i))
  }

  contentBounds() {
    const xs = [0, this.level.u.x * MAX_SCALE, this.level.u.x * -MAX_SCALE]
    const ys = [0, this.level.u.y * MAX_SCALE, this.level.u.y * -MAX_SCALE]
    for (const t of this.level.targets) {
      xs.push(t.x)
      ys.push(t.y)
    }
    if (this.level.newWind) {
      xs.push(this.level.newWind.at.x)
      ys.push(this.level.newWind.at.y)
    }
    return {
      minX: Math.min(...xs, -2),
      maxX: Math.max(...xs, 2),
      minY: Math.min(...ys, -2),
      maxY: Math.max(...ys, 2),
    }
  }

  uiExtras(): Ch2Extras {
    return {
      windA: this.a,
      windB: this.b,
      hasV: this.hasV,
      newWindActive: !!this.level.newWind && !this.newWindTaken,
      collected: this.level.cumulative ? this.nextIdx : this.collected.size,
      colB: this.hasV ? { ...this.vVec } : undefined,
    }
  }

  equation(): string {
    const u = fmtVec(this.level.u)
    const d = this.dest()
    if (!this.hasV) return `${fmtScalar(this.a)}${u} → ${fmtVec(d)}`
    return `${fmtScalar(this.a)}${u} + ${fmtScalar(this.b)}${fmtVec(this.vVec)} → ${fmtVec(d)}`
  }

  serialize(): unknown {
    return {
      a: this.a, b: this.b, basePos: this.basePos, vexPos: this.vexPos,
      collected: [...this.collected], nextIdx: this.nextIdx,
      newWindTaken: this.newWindTaken, vVec: this.vVec, moves: this.moves,
    }
  }

  restore(data: unknown) {
    const dd = data as {
      a?: number; b?: number; basePos?: Vec; vexPos?: Vec; collected?: number[]
      nextIdx?: number; newWindTaken?: boolean; vVec?: Vec; moves?: number
    }
    if (typeof dd?.a === 'number') this.a = dd.a
    if (typeof dd?.b === 'number') this.b = dd.b
    if (dd?.basePos) this.basePos = { ...dd.basePos }
    if (dd?.vexPos) this.vexPos = { ...dd.vexPos }
    if (Array.isArray(dd?.collected)) this.collected = new Set(dd.collected)
    if (typeof dd?.nextIdx === 'number') this.nextIdx = dd.nextIdx
    if (dd?.newWindTaken) this.newWindTaken = true
    if (dd?.vVec && this.newWindTaken) this.vVec = { ...dd.vVec }
    if (typeof dd?.moves === 'number') this.moves = dd.moves
    this.syncSprings()
  }

  persist() {
    if (this.state === 'play') saveMidLevel(this.level.id, this.serialize())
  }

  /* ---------- per-frame ---------- */

  update(dtMs: number) {
    for (const sp of this.springs) sp.update(dtMs)
    if (this.sailing) {
      this.sailing.t += dtMs
      const k = clamp(this.sailing.t / this.sailing.dur, 0, 1)
      const e = 1 - Math.pow(1 - k, 3)
      this.vexPos = {
        x: this.sailing.from.x + (this.sailing.to.x - this.sailing.from.x) * e,
        y: this.sailing.from.y + (this.sailing.to.y - this.sailing.from.y) * e + Math.sin(k * Math.PI) * 0.5,
      }
      if (k >= 1) this.finishSail()
    }
  }

  /* ---------- draw ---------- */

  private drawRibbon(eng: Engine, _wind: Vec, s: number, color: string, spring: Spring, idx: 0 | 1) {
    const P = eng.palette
    const from = eng.worldToScreen(this.basePos)
    const tip = { x: spring.x, y: spring.y }
    const tipS = eng.worldToScreen(tip)
    const flutter = eng.reduceMotion ? 0 : Math.min(1, Math.abs(s)) * 4
    const dx = tipS.x - from.x
    const dy = tipS.y - from.y
    const L = Math.hypot(dx, dy)
    if (L < 4) return
    const nx = -dy / L
    const ny = dx / L
    const ctx = eng.ctx
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    const segs = 10
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const wob = Math.sin(eng.timeMs / 260 + t * 5) * flutter * t
      const x = from.x + dx * t + nx * wob
      const y = from.y + dy * t + ny * wob
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()
    eng.drawGlow(tipS.x, tipS.y, 18, color, 0.45)
    // handle knob
    ctx.save()
    ctx.fillStyle = color
    ctx.strokeStyle = P.bg1
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(tipS.x, tipS.y, this.dragWind === idx ? 13 : 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = P.bg1
    ctx.font = '800 10px Nunito, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${fmt(s)}×`, tipS.x, tipS.y)
    ctx.restore()
  }

  drawWorld(ctx: CanvasRenderingContext2D, eng: Engine) {
    const P = eng.palette
    // reachable fan (span) — faint parallelogram ±3u ±3v from base
    const showFan = this.level.collectAll || this.engine.timeMs - this.lastInputMs > 5000
    if (showFan && this.hasV) {
      const u3 = scale(this.level.u, MAX_SCALE)
      const v3 = scale(this.vVec, MAX_SCALE)
      const corners = [
        add(this.basePos, add(u3, v3)),
        add(this.basePos, add(u3, scale(v3, -1))),
        add(this.basePos, add(scale(u3, -1), scale(v3, -1))),
        add(this.basePos, add(scale(u3, -1), v3)),
      ].map((p) => eng.worldToScreen(p))
      const shimmer = this.engine.timeMs - this.lastFanSweep
      if (shimmer > 5000) this.lastFanSweep = this.engine.timeMs
      const alpha = 0.05 + (shimmer < 1200 ? 0.07 * Math.sin((shimmer / 1200) * Math.PI) : 0)
      ctx.save()
      ctx.fillStyle = P.cyan
      ctx.globalAlpha = alpha
      ctx.beginPath()
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)))
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = P.cyan
      ctx.globalAlpha = alpha * 2.4
      ctx.setLineDash([5, 7])
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }

    // isles (goal pads)
    this.level.targets.forEach((t, i) => {
      const isNext = this.level.cumulative ? i === this.nextIdx : !this.collected.has(i)
      const hit = this.targetHit() === i
      drawPad(eng, t, {
        lockOn: hit,
        collected: this.collected.has(i) || (this.level.cumulative && i < this.nextIdx),
        color: isNext ? P.gold : P.low,
        label: isNext && this.level.cumulative ? `ISLE ${i + 1}` : undefined,
      })
    })

    // new wind pickup
    const nw = this.level.newWind
    if (nw && !this.newWindTaken) {
      const sp = eng.worldToScreen(nw.at)
      const bob = eng.reduceMotion ? 0 : Math.sin(eng.timeMs / 400) * 4
      eng.drawGlow(sp.x, sp.y + bob, 26, P.cyan, 0.7)
      ctx.save()
      ctx.translate(sp.x, sp.y + bob)
      ctx.rotate(eng.timeMs / 900)
      ctx.strokeStyle = P.cyan
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      for (const dir of [1, -1]) {
        ctx.beginPath()
        ctx.moveTo(-10 * dir, 6)
        ctx.quadraticCurveTo(0, -6 * dir, 10 * dir, -6)
        ctx.stroke()
      }
      ctx.restore()
      drawCoordLabel(eng, nw.at, 'NEW WIND', P.cyan, 34)
    }

    // destination beam + landing ghost
    const d = this.dest()
    const hit = this.targetHit()
    const fromS = eng.worldToScreen(this.basePos)
    const toS = eng.worldToScreen(d)
    ctx.save()
    ctx.strokeStyle = P.mint
    ctx.lineWidth = 2.5
    ctx.setLineDash([7, 7])
    ctx.lineDashOffset = -((eng.timeMs / 60) % 14)
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(fromS.x, fromS.y)
    ctx.lineTo(toS.x, toS.y)
    ctx.stroke()
    ctx.restore()
    eng.drawGlow(toS.x, toS.y, hit >= 0 ? 24 : 14, P.mint, hit >= 0 ? 0.7 : 0.35)
    ctx.save()
    ctx.strokeStyle = P.mint
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(toS.x, toS.y, hit >= 0 ? 10 : 7, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    if (this.a !== 0 || this.b !== 0) drawCoordLabel(eng, d, fmtVec(d), P.mint, 30)

    // wind ribbons (amber u, cyan v)
    this.drawRibbon(eng, this.level.u, this.a, P.amber, this.springs[0], 0)
    if (this.hasV) this.drawRibbon(eng, this.vVec, this.b, P.cyan, this.springs[1], 1)

    drawPad(eng, this.basePos, { rU: 0.4, color: P.amber })
    eng.drawMascot(this.vexPos, 0.9)
  }
}
