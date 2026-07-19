/**
 * Footer — brand footer shown only on wide (desktop) viewports, beneath the
 * device frame (rendered by Layout). Mobile game screens have no footer;
 * the BottomNav is the chrome.
 */
export default function Footer() {
  return (
    <footer className="relative z-10 mx-auto hidden w-full max-w-[480px] items-center justify-between px-4 pb-6 min-[520px]:flex">
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="VECTO" className="h-5 w-auto opacity-80" />
        <span className="text-caption uppercase text-low">Tiny arrows. Big adventures.</span>
      </div>
      <p className="text-caption uppercase text-low">Progress stored locally · no accounts</p>
    </footer>
  )
}
