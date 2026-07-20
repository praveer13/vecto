/** @type {import('tailwindcss').Config} */
// VECTO design tokens — design.md §5–§8
//   bg-0..bg-3  -> night-0..night-3   (backgrounds)
//   text-hi/mid/low -> hi / mid / low (text colors)
//   accents: cyan mint violet magenta amber coral danger gold
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './node_modules/@gridverse/kit/dist/**/*.js'],
  theme: {
    extend: {
      colors: {
        // VECTO core palette (§5.1)
        night: {
          0: '#060A13', // app background, deepest space
          1: '#0B1220', // screen base
          2: '#111B30', // panels, dock, cards
          3: '#182642', // elevated panels, pressed states
        },
        line: '#223354',
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
        // shadcn bridge
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive) / <alpha-value>)", foreground: "hsl(var(--destructive-foreground) / <alpha-value>)" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      fontFamily: {
        display: ['Bungee', 'cursive'],
        sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['44px', { lineHeight: '0.95', letterSpacing: '0.01em' }],
        'display-l': ['32px', { lineHeight: '1.0', letterSpacing: '0.01em' }],
        h1: ['24px', { lineHeight: '1.05', letterSpacing: '0.01em' }],
        bignum: ['40px', { lineHeight: '1.0' }],
        h2: ['20px', { lineHeight: '1.2' }],
        title: ['16px', { lineHeight: '1.25' }],
        body: ['15px', { lineHeight: '1.45' }],
        caption: ['12px', { lineHeight: '1.3', letterSpacing: '0.08em' }],
        'mono-m': ['15px', { lineHeight: '1.3' }],
        'mono-s': ['12px', { lineHeight: '1.3' }],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        pill: '999px',
      },
      boxShadow: {
        'glow-amber': '0 0 16px rgba(255,176,32,.45), 0 0 48px rgba(255,176,32,.18)',
        'glow-cyan': '0 0 16px rgba(34,211,238,.45), 0 0 48px rgba(34,211,238,.18)',
        'glow-mint': '0 0 16px rgba(61,255,162,.45), 0 0 48px rgba(61,255,162,.18)',
        'glow-magenta': '0 0 16px rgba(255,46,147,.45), 0 0 48px rgba(255,46,147,.18)',
        'glow-violet': '0 0 16px rgba(139,92,246,.45), 0 0 48px rgba(139,92,246,.18)',
        'glow-danger': '0 0 16px rgba(255,77,109,.45), 0 0 48px rgba(255,77,109,.18)',
        'glow-gold': '0 0 16px rgba(255,209,102,.45), 0 0 48px rgba(255,209,102,.18)',
        'glow-coral': '0 0 16px rgba(255,107,74,.45), 0 0 48px rgba(255,107,74,.18)',
        panel: '0 8px 24px rgba(2,6,16,.55)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16,1,0.3,1)',
        'out-back': 'cubic-bezier(0.34,1.56,0.64,1)',
        'in-out': 'cubic-bezier(0.65,0,0.35,1)',
      },
      keyframes: {
        'pulse-glow': {
          '0%,100%': { filter: 'drop-shadow(0 0 10px rgba(255,176,32,.55))' },
          '50%': { filter: 'drop-shadow(0 0 22px rgba(255,176,32,.9))' },
        },
        bob: {
          '0%,100%': { transform: 'translateY(-6px) rotate(-3deg)' },
          '50%': { transform: 'translateY(6px) rotate(3deg)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-120%) skewX(-18deg)' },
          '100%': { transform: 'translateX(240%) skewX(-18deg)' },
        },
        flicker: {
          '0%,100%': { opacity: '1' },
          '38%': { opacity: '0.86' },
          '62%': { opacity: '0.97' },
          '81%': { opacity: '0.88' },
        },
        twinkle: {
          '0%,100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        breathe: {
          '0%,100%': { opacity: '0.8' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.4s cubic-bezier(0.65,0,0.35,1) infinite',
        bob: 'bob 2s cubic-bezier(0.65,0,0.35,1) infinite',
        shimmer: 'shimmer 800ms ease-out',
        flicker: 'flicker 400ms linear infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
        breathe: 'breathe 6s cubic-bezier(0.65,0,0.35,1) infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
