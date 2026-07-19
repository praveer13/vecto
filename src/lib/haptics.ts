import { useGameStore } from '@/store/gameStore'

/**
 * Haptics per design.md §9 — navigator.vibrate with graceful no-op,
 * master toggle from settings, global 120ms throttle.
 */
let lastFire = 0

export function haptic(pattern: number | number[]) {
  const { hapticsOn } = useGameStore.getState().settings
  if (!hapticsOn) return
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  const now = performance.now()
  if (now - lastFire < 120) return
  lastFire = now
  try {
    navigator.vibrate(pattern)
  } catch {
    /* no-op */
  }
}

export const haptics = {
  /** snap to grid / pick up */
  tick: () => haptic(8),
  /** release valid placement */
  release: () => haptic(12),
  /** win star (call per star) */
  star: () => haptic([15, 40, 15]),
  /** eigen crit hit */
  crit: () => haptic([25, 30, 25]),
  /** error / blocked */
  error: () => haptic(30),
  /** boss phase break */
  phaseBreak: () => haptic([40, 60, 40, 60, 80]),
  /** long-press purr */
  purr: () => haptic([10, 20, 10]),
}
