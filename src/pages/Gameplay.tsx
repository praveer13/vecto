import StubScreen from '@/components/game/StubScreen'

/**
 * Gameplay — gameplay.md. Full-screen canvas + chapter control dock.
 * Reads the level from the query string (?level=3-4, ?daily=1). Immersive: no BottomNav.
 */
export default function Gameplay() {
  return (
    <StubScreen
      title="Gameplay"
      art="/grid-horizon.png"
      blurb="The canvas engine, drag arrows, ghost-hand hints and HUD land here."
    />
  )
}
