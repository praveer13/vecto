import TopBar from '@/components/game/TopBar'
import CodexSection from '@/pages/CodexSection'

/**
 * Codex — route /codex (BottomNav Codex tab). The 18 collectible concept
 * cards with flip-enabled Nerd Notes; full UI lives in CodexSection,
 * shared with the Profile page's #codex section.
 */
export default function Codex() {
  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="CODEX" />
      <main className="flex-1 px-4 py-4">
        <p className="mb-3 px-1 text-body font-semibold text-mid">
          Real math hides on the back of every card. Collect all 18.
        </p>
        <CodexSection />
      </main>
    </div>
  )
}
