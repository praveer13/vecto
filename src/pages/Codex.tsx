import StubScreen from '@/components/game/StubScreen'

/**
 * Codex — the 18 collectible concept cards with Nerd Notes.
 * Lives inside Profile & Codex (profile.md); routed for the BottomNav Codex tab.
 */
export default function Codex() {
  return (
    <StubScreen
      title="Codex"
      art="/card-back.png"
      blurb="Eighteen concept cards hide real math under flavor names. Collect them all."
    />
  )
}
