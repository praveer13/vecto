/**
 * VECTO theme — series base palette + VECTO's canvas art assets.
 * Bound once in main.tsx via bindKitTheme; Engine instances pick it up by default.
 */
import { GRIDVERSE_BASE, type GridverseTheme } from '@gridverse/kit/engine'
import { asset } from './asset'

export const VECTO_THEME: GridverseTheme = {
  ...GRIDVERSE_BASE,
  assets: {
    nebula: asset('nebula-bg.png'),
    mascot: asset('mascot-vex.png'),
  },
}
