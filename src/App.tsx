import { Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Map from '@/pages/Map'
import Codex from '@/pages/Codex'
import Gameplay from '@/pages/Gameplay'
import Boss from '@/pages/Boss'
import Results from '@/pages/Results'
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'

/**
 * Routing contract: children pattern (react-dev guide) —
 * Layout renders {children} and wraps <Routes>. Never mix with <Outlet/>.
 *
 * Routes (design.md §2 page list):
 *   /         Home / Title        /boss     Eigen Keep boss
 *   /map      The Gridverse map   /results  Results / Rewards
 *   /play     Gameplay            /profile  Profile
 *   /codex    Codex (BottomNav)   /settings Settings
 */
export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<Map />} />
        <Route path="/codex" element={<Codex />} />
        <Route path="/play" element={<Gameplay />} />
        <Route path="/boss" element={<Boss />} />
        <Route path="/results" element={<Results />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Layout>
  )
}
