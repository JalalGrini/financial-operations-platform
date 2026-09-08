'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useExperience } from '@/lib/experience'
import { sourceText } from '@/lib/i18n/source-catalog'

interface ThemeSwitchProps {
  className?: string
}

export function ThemeSwitch({ className = '' }: ThemeSwitchProps) {
  const { theme: storedTheme, setTheme: setExperienceTheme } = useExperience()
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')

  React.useEffect(() => {
    const fromExperience =
      storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : null
    const savedTheme =
      fromExperience ||
      localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(savedTheme as 'light' | 'dark')
    document.documentElement.classList.toggle('dark', savedTheme === 'dark')
  }, [storedTheme])

  const toggleTheme = React.useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    setExperienceTheme(newTheme)
  }, [theme, setExperienceTheme])

  return (
    <button
      onClick={toggleTheme}
      className={`relative flex h-10 w-10 items-center justify-center 
                  rounded-full hover:opacity-80 transition-opacity 
                  overflow-hidden ${className}`}
      aria-label={sourceText("Toggle theme")}
    >
      <Sun
        className={`absolute h-6 w-6 transition-all duration-300 
                    ease-[cubic-bezier(0.34,1.56,0.64,1)] text-amber-400
                    ${theme === 'light'
                      ? 'scale-100 translate-y-0 opacity-100'
                      : 'scale-50 translate-y-6 opacity-0'
                    }`}
      />
      <Moon
        className={`absolute h-6 w-6 transition-all duration-300 
                    ease-[cubic-bezier(0.34,1.56,0.64,1)] text-slate-200
                    ${theme === 'dark'
                      ? 'scale-100 translate-y-0 opacity-100'
                      : 'scale-50 translate-y-6 opacity-0'
                    }`}
      />
    </button>
  )
}
