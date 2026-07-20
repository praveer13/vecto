import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { bindKitTheme, applyThemeToDom } from '@gridverse/kit'
import './index.css'
import App from './App.tsx'
import '@/store/gameStore'
import { VECTO_THEME } from '@/lib/theme'

bindKitTheme(VECTO_THEME)
applyThemeToDom(VECTO_THEME)

// No <React.StrictMode>: it double-runs canvas/rAF effects (react-dev guide).
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>,
)
