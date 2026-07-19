/**
 * VECTO 2D math helpers — vectors, 2×2 matrices (column-major semantics:
 * columns are the images of î and ĵ), formatting for the mono equation voice.
 */

export interface Vec {
  x: number
  y: number
}

/** 2×2 matrix stored by columns: c1 = image of î, c2 = image of ĵ */
export interface Mat {
  a: number // c1.x
  b: number // c1.y
  c: number // c2.x
  d: number // c2.y
}

export const vec = (x = 0, y = 0): Vec => ({ x, y })
export const add = (u: Vec, v: Vec): Vec => ({ x: u.x + v.x, y: u.y + v.y })
export const sub = (u: Vec, v: Vec): Vec => ({ x: u.x - v.x, y: u.y - v.y })
export const scale = (u: Vec, s: number): Vec => ({ x: u.x * s, y: u.y * s })
export const len = (u: Vec): number => Math.hypot(u.x, u.y)
export const dist = (u: Vec, v: Vec): number => Math.hypot(u.x - v.x, u.y - v.y)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const lerpVec = (u: Vec, v: Vec, t: number): Vec => ({
  x: lerp(u.x, v.x, t),
  y: lerp(u.y, v.y, t),
})

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1 }
export const mat = (a: number, b: number, c: number, d: number): Mat => ({ a, b, c, d })
export const matFromCols = (c1: Vec, c2: Vec): Mat => ({ a: c1.x, b: c1.y, c: c2.x, d: c2.y })

/** M · v */
export const apply = (m: Mat, v: Vec): Vec => ({
  x: m.a * v.x + m.c * v.y,
  y: m.b * v.x + m.d * v.y,
})

/** M · N (N first, then M) */
export const mul = (m: Mat, n: Mat): Mat => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
})

export const det = (m: Mat): number => m.a * m.d - m.b * m.c

export const lerpMat = (m: Mat, n: Mat, t: number): Mat => ({
  a: lerp(m.a, n.a, t),
  b: lerp(m.b, n.b, t),
  c: lerp(m.c, n.c, t),
  d: lerp(m.d, n.d, t),
})

/** true when M is (numerically) the identity */
export const isIdentity = (m: Mat, eps = 0.06): boolean =>
  Math.abs(m.a - 1) < eps && Math.abs(m.b) < eps && Math.abs(m.c) < eps && Math.abs(m.d - 1) < eps

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** snap v to nearest multiple of step */
export const snapTo = (v: number, step: number): number => Math.round(v / step) * step

/** round to nearest 0.25 to kill float dust */
export const tidy = (v: number): number => {
  const r = Math.round(v * 4) / 4
  return Object.is(r, -0) ? 0 : r
}

const MINUS = '−'

/** number for the mono equation voice: -0.5 -> "−0.5", 2 -> "2" */
export const fmt = (v: number): string => {
  const t = tidy(v)
  return t < 0 ? MINUS + String(Math.abs(t)) : String(t)
}

/** vector for equations: (2,−1) */
export const fmtVec = (v: Vec): string => `(${fmt(v.x)},${fmt(v.y)})`

/** scalar prefix like 1.5· or (−1)· for wind equations */
export const fmtScalar = (s: number): string => {
  const t = tidy(s)
  if (t < 0) return `(${fmt(t)})·`
  return `${fmt(t)}·`
}

/** does segment p1->p2 pass through rect r? (sampling — fine at grid scale) */
export function segIntersectsRect(
  p1: Vec,
  p2: Vec,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const steps = Math.max(8, Math.ceil(dist(p1, p2) * 4))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = lerp(p1.x, p2.x, t)
    const y = lerp(p1.y, p2.y, t)
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true
  }
  return false
}

/** nearest point to p on the line through `origin` along `dir` */
export function projectOntoLine(p: Vec, origin: Vec, dir: Vec): Vec {
  const d2 = dir.x * dir.x + dir.y * dir.y
  if (d2 < 1e-9) return { ...origin }
  const t = ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / d2
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t }
}

/** easing functions shared with the canvas engine */
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
