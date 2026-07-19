import type { ColorblindMode } from '@/store/gameStore'

/**
 * Canvas/UI color palettes per design.md §5.4.
 * Colorblind presets rebase the gameplay semantics onto Okabe-Ito:
 *   amber→#E69F00 · cyan→#56B4E9 · mint→#009E73 · magenta→#CC79A7 · gold→#F0E442
 * (violet→#0072B2, coral/danger→#D55E00 vermillion from the same safe set).
 * Meaning is always doubled by shape in the arena (chevron shots, double-line
 * eigen lanes, spiky orbs), so color is never the only channel.
 */
export interface Palette {
  cyan: string
  mint: string
  violet: string
  magenta: string
  amber: string
  coral: string
  danger: string
  gold: string
  hi: string
  mid: string
  low: string
  line: string
}

const DEFAULT: Palette = {
  cyan: '#22D3EE',
  mint: '#3DFFA2',
  violet: '#8B5CF6',
  magenta: '#FF2E93',
  amber: '#FFB020',
  coral: '#FF6B4A',
  danger: '#FF4D6D',
  gold: '#FFD166',
  hi: '#EAF2FF',
  mid: '#9DB0D6',
  low: '#64769C',
  line: '#223354',
}

const OKABE_ITO: Palette = {
  ...DEFAULT,
  cyan: '#56B4E9',
  mint: '#009E73',
  violet: '#0072B2',
  magenta: '#CC79A7',
  amber: '#E69F00',
  coral: '#D55E00',
  danger: '#D55E00',
  gold: '#F0E442',
}

export const PALETTES: Record<ColorblindMode, Palette> = {
  off: DEFAULT,
  protan: OKABE_ITO,
  deutan: OKABE_ITO,
  tritan: OKABE_ITO,
}

export const getPalette = (mode: ColorblindMode): Palette => PALETTES[mode] ?? DEFAULT

/** The 6 semantic swatches shown in Settings (settings.md §3) */
export const SWATCH_KEYS = ['amber', 'cyan', 'mint', 'magenta', 'gold', 'violet'] as const
