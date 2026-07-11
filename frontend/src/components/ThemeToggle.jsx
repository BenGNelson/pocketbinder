import { useTheme, toggleTheme } from '../lib/theme.js'

// A light/dark switch for the header. Shows the mode you'd switch TO.
export default function ThemeToggle() {
  const dark = useTheme() === 'dark'
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="pb-btn-ghost flex h-9 w-9 items-center justify-center rounded-full text-base active:scale-95"
    >
      {dark ? '☀' : '☾'}
    </button>
  )
}
