/**
 * Shared toolkit for the machine chapters (3 warp, 4 tandem, 6 rewind):
 * the on-canvas basis widget (mini window where î′/ĵ′ arrows are dragged to
 * write matrix columns — gameplay.md §5 Ch3 "designer"), crate/pad matching,
 * and screen-space machine pod / crate / critter drawing.
 */
import type { Engine, Mat, Vec } from '@gridverse/kit/engine'
import { apply, clamp, det, drawCoordLabel, matFromCols, snapTo } from '@gridverse/kit/engine'

export const SNAP_HALF = 0.5
export const COL_RANGE = 3
export const PAD_TOL = 0.35

/** greedy crate→pad matching within tolerance */
export function cratesOnPads(crates: Vec[], m: Mat, pads: Vec[], tol = PAD_TOL): boolean {
  const used = new Set<number>()
  for (const c of crates) {
    const landed = apply(m, c)
    let found = -1
    for (let i = 0; i < pads.length; i++) {
      if (used.has(i)) continue
      if (Math.hypot(landed.x - pads[i].x, landed.y - pads[i].y) <= tol) {
        found = i
        break
      }
    }
    if (found < 0) return false
    used.add(found)
  }
  return true
}

/**
 * Basis widget — bottom-left mini grid on the canvas showing where î and ĵ
 * will land (the machine's columns). Tips are draggable (snap 0.5, ±3).
 */
export class BasisWidget {
  c1: Vec = { x: 1, y: 0 }
  c2: Vec = { x: 0, y: 1 }
  size = 132
  pad = 10
  title = 'WHERE î′ ĵ′ GO'

  setMatrix(m: Mat) {
    this.c1 = { x: m.a, y: m.b }
    this.c2 = { x: m.c, y: m.d }
  }

  matrix(): Mat {
    return matFromCols(this.c1, this.c2)
  }

  reset() {
    this.c1 = { x: 1, y: 0 }
    this.c2 = { x: 0, y: 1 }
  }

  rect(eng: Engine) {
    return { x: this.pad, y: eng.cssH - this.size - this.pad, w: this.size, h: this.size }
  }

  private scalePx(eng: Engine): number {
    return eng.cssW < 370 ? 14 : 16
  }

  /** screen coords of a widget-space vector tip */
  tipScreen(eng: Engine, v: Vec): Vec {
    const r = this.rect(eng)
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const k = this.scalePx(eng)
    return { x: cx + v.x * k, y: cy - v.y * k }
  }

  hit(eng: Engine, s: Vec): 0 | 1 | null {
    const t1 = this.tipScreen(eng, this.c1)
    const t2 = this.tipScreen(eng, this.c2)
    if (Math.hypot(t1.x - s.x, t1.y - s.y) < 26) return 0
    if (Math.hypot(t2.x - s.x, t2.y - s.y) < 26) return 1
    return null
  }

  dragTo(eng: Engine, s: Vec, which: 0 | 1): boolean {
    const r = this.rect(eng)
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const k = this.scalePx(eng)
    const raw = { x: (s.x - cx) / k, y: (cy - s.y) / k }
    const v = {
      x: clamp(snapTo(raw.x, SNAP_HALF), -COL_RANGE, COL_RANGE),
      y: clamp(snapTo(raw.y, SNAP_HALF), -COL_RANGE, COL_RANGE),
    }
    const cur = which === 0 ? this.c1 : this.c2
    if (cur.x === v.x && cur.y === v.y) return false
    if (which === 0) this.c1 = v
    else this.c2 = v
    return true
  }

  draw(eng: Engine, opts?: { accent?: string; title?: string }) {
    const ctx = eng.ctx
    const P = eng.palette
    const r = this.rect(eng)
    const k = this.scalePx(eng)
    ctx.save()
    // panel
    ctx.fillStyle = 'rgba(17,27,48,0.94)'
    ctx.strokeStyle = opts?.accent ?? P.line
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 12)
    ctx.fill()
    ctx.stroke()
    // mini grid
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    ctx.strokeStyle = 'rgba(56,189,248,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      ctx.moveTo(cx + i * k, r.y + 8)
      ctx.lineTo(cx + i * k, r.y + r.h - 8)
      ctx.moveTo(r.x + 8, cy + i * k)
      ctx.lineTo(r.x + r.w - 8, cy + i * k)
    }
    ctx.stroke()
    // axes
    ctx.strokeStyle = 'rgba(157,176,214,0.35)'
    ctx.beginPath()
    ctx.moveTo(r.x + 8, cy)
    ctx.lineTo(r.x + r.w - 8, cy)
    ctx.moveTo(cx, r.y + 8)
    ctx.lineTo(cx, r.y + r.h - 8)
    ctx.stroke()
    // title
    ctx.fillStyle = P.low
    ctx.font = '800 9px Nunito, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(opts?.title ?? this.title, cx, r.y + 13)
    // arrows î′ (amber) ĵ′ (cyan)
    const drawW = (v: Vec, color: string, label: string) => {
      const tip = this.tipScreen(eng, v)
      const dx = tip.x - cx
      const dy = tip.y - cy
      const L = Math.hypot(dx, dy)
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      if (L > 2) ctx.lineTo(tip.x - (dx / L) * 7, tip.y - (dy / L) * 7)
      ctx.stroke()
      if (L > 2) {
        const ux = dx / L
        const uy = dy / L
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(tip.x, tip.y)
        ctx.lineTo(tip.x - ux * 10 - uy * 5.5, tip.y - uy * 10 + ux * 5.5)
        ctx.lineTo(tip.x - ux * 10 + uy * 5.5, tip.y - uy * 10 - ux * 5.5)
        ctx.closePath()
        ctx.fill()
      }
      // knob
      ctx.fillStyle = color
      ctx.strokeStyle = P.bg1
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(tip.x, tip.y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = P.bg1
      ctx.font = '900 8px Nunito, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, tip.x, tip.y + 0.5)
    }
    drawW(this.c1, P.amber, 'î')
    drawW(this.c2, P.cyan, 'ĵ')
    // origin dot
    ctx.fillStyle = P.mid
    ctx.beginPath()
    ctx.arc(cx, cy, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** crate drawing (world entity) — violet machine-crate with glow */
export function drawCrate(eng: Engine, p: Vec, opts?: { glow?: boolean; grabbed?: boolean }) {
  const ctx = eng.ctx
  const P = eng.palette
  const sp = eng.worldToScreen(p)
  const s = 0.62 * eng.cam.scale
  if (opts?.glow !== false) eng.drawGlow(sp.x, sp.y, s * 0.9, P.violet, 0.35)
  ctx.save()
  ctx.translate(sp.x, sp.y)
  if (opts?.grabbed) ctx.scale(1.08, 1.08)
  ctx.fillStyle = P.bg3
  ctx.strokeStyle = P.violet
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(-s / 2, -s / 2, s, s, 6)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = P.violet
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-s / 2 + 5, -s / 2 + 5)
  ctx.lineTo(s / 2 - 5, s / 2 - 5)
  ctx.moveTo(s / 2 - 5, -s / 2 + 5)
  ctx.lineTo(-s / 2 + 5, s / 2 - 5)
  ctx.stroke()
  ctx.restore()
}

/** critter drawing (Ch6) — glowing blob with eyes */
export function drawCritter(eng: Engine, p: Vec, color: string, opts?: { grabbed?: boolean; saved?: boolean }) {
  const ctx = eng.ctx
  const sp = eng.worldToScreen(p)
  const r = 0.34 * eng.cam.scale
  const wob = eng.reduceMotion ? 0 : Math.sin(eng.timeMs / 300 + p.x * 3) * 0.06
  eng.drawGlow(sp.x, sp.y, r * 1.6, color, opts?.saved ? 0.7 : 0.45)
  ctx.save()
  ctx.translate(sp.x, sp.y)
  if (opts?.grabbed) ctx.scale(1.12, 1.12)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.ellipse(0, 0, r * (1 + wob), r * (1 - wob), 0, 0, Math.PI * 2)
  ctx.fill()
  // eyes
  ctx.fillStyle = eng.palette.bg1
  const er = r * 0.16
  ctx.beginPath()
  ctx.arc(-r * 0.3, -r * 0.15, er, 0, Math.PI * 2)
  ctx.arc(r * 0.3, -r * 0.15, er, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** screen-space machine pod with label + animated lever */
export function drawMachinePod(
  eng: Engine,
  x: number,
  y: number,
  label: string,
  color: string,
  leverT: number, // 0 rest → 1 pulled
  opts?: { selected?: boolean; small?: boolean },
) {
  const ctx = eng.ctx
  const w = opts?.small ? 56 : 68
  const h = opts?.small ? 46 : 56
  eng.drawGlow(x, y, w * 0.8, color, opts?.selected ? 0.6 : 0.3)
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = eng.palette.bg2
  ctx.strokeStyle = color
  ctx.lineWidth = opts?.selected ? 2.5 : 1.5
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, 12)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = '900 16px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 0, 2)
  // lever
  const ang = -0.5 + leverT * 1.1
  const lx = w / 2 - 4
  const ly = -h / 2 + 8
  ctx.save()
  ctx.translate(lx, ly)
  ctx.rotate(ang)
  ctx.strokeStyle = eng.palette.mid
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -16)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, -18, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

/** label under a world entity */
export function drawEntityLabel(eng: Engine, p: Vec, text: string, color?: string) {
  drawCoordLabel(eng, p, text, color ?? eng.palette.mid, -26)
}

export { det }
