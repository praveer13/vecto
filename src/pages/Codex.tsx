import { asset } from '@/lib/asset'
import { useNavigate } from 'react-router'
import { TopBar } from '@gridverse/kit/ui'
import CodexSection from '@/pages/CodexSection'
import { useGameStore, selectPlayerLevel } from '@/store/gameStore'

/**
 * Codex — route /codex (BottomNav Codex tab). The 18 collectible concept
 * cards with flip-enabled Nerd Notes; full UI lives in CodexSection,
 * shared with the Profile page's #codex section.
 */
export default function Codex() {
  const navigate = useNavigate()
  const gears = useGameStore((s) => s.gears)
  const xp = useGameStore((s) => s.xp)
  const playerLevel = selectPlayerLevel(xp)

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title="CODEX"
        gears={gears}
        avatarSrc={asset('mascot-vex.png')}
        level={playerLevel}
        onProfile={() => navigate('/profile')}
        onSettings={() => navigate('/settings')}
      />
      <main className="flex-1 px-4 py-4">
        <p className="mb-3 px-1 text-body font-semibold text-mid">
          Real math hides on the back of every card. Collect all 18.
        </p>
        <CodexSection />
      </main>
    </div>
  )
}
