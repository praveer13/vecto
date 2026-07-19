/**
 * Minimal 2×2 linear algebra for the Eigen Keep ballistics model (boss.md §2/§4).
 * Shots are vectors: every 100ms the arena matrix M re-aims the velocity
 * (v ← normalize(M·v)), so only eigen-direction shots fly straight.
 */

export interface Vec {
  x: number
  y: number
}

/** Row-major 2×2 matrix: [a b; c d] */
export interface Mat2 {
  a: number
  b: number
  c: number
  d: number
}

export const vec = (x = 0, y = 0): Vec => ({ x, y })
export const add = (u: Vec, v: Vec): Vec => ({ x: u.x + v.x, y: u.y + v.y })
export const sub = (u: Vec, v: Vec): Vec => ({ x: u.x - v.x, y: u.y - v.y })
export const scale = (v: Vec, s: number): Vec => ({ x: v.x * s, y: v.y * s })
export const dot = (u: Vec, v: Vec): number => u.x * v.x + u.y * v.y
export const cross = (u: Vec, v: Vec): number => u.x * v.y - u.y * v.x
export const len = (v: Vec): number => Math.hypot(v.x, v.y)
export const dist = (u: Vec, v: Vec): number => Math.hypot(u.x - v.x, u.y - v.y)

export const norm = (v: Vec): Vec => {
  const l = len(v)
  return l < 1e-9 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l }
}

export const fromAng = (t: number, r = 1): Vec => ({ x: Math.cos(t) * r, y: Math.sin(t) * r })
export const angOf = (v: Vec): number => Math.atan2(v.y, v.x)

/** M·v */
export const mulV = (m: Mat2, v: Vec): Vec => ({
  x: m.a * v.x + m.b * v.y,
  y: m.c * v.x + m.d * v.y,
})

export const lerpMat = (m0: Mat2, m1: Mat2, t: number): Mat2 => ({
  a: m0.a + (m1.a - m0.a) * t,
  b: m0.b + (m1.b - m0.b) * t,
  c: m0.c + (m1.c - m0.c) * t,
  d: m0.d + (m1.d - m0.d) * t,
})

/** wrap angle to (-π, π] */
export const wrapAng = (t: number): number => {
  let a = t % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a <= -Math.PI) a += Math.PI * 2
  return a
}

export interface EigenInfo {
  /** unit eigen-direction (sign arbitrary — the line is what matters) */
  dir: Vec
  lambda: number
}

/**
 * Real eigen-directions of a 2×2 matrix, closed form.
 * Returns [] when eigenvalues are complex (e.g. pure rotation — "no straight shot").
 * Dedupes parallel directions (repeated eigenvalues).
 */
export function eigenDirections(m: Mat2): EigenInfo[] {
  const tr = m.a + m.d
  const det = m.a * m.d - m.b * m.c
  const disc = tr * tr - 4 * det
  if (disc < -1e-9) return []
  const sq = Math.sqrt(Math.max(0, disc))
  const out: EigenInfo[] = []
  for (const lambda of [(tr + sq) / 2, (tr - sq) / 2]) {
    // (M − λI)v = 0  →  v ∝ (b, λ−a)  or  (λ−d, c); diagonal fallbacks
    let v: Vec
    if (Math.abs(m.b) > 1e-9) v = { x: m.b, y: lambda - m.a }
    else if (Math.abs(m.c) > 1e-9) v = { x: lambda - m.d, y: m.c }
    else v = Math.abs(lambda - m.a) < 1e-9 ? { x: 1, y: 0 } : { x: 0, y: 1 }
    const n = norm(v)
    if (!out.some((e) => Math.abs(cross(e.dir, n)) < 1e-6)) out.push({ dir: n, lambda })
  }
  return out
}

/** ease helpers (design.md §8) */
export const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))
