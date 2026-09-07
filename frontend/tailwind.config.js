/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Semantic status tokens — available as Tailwind utilities */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          surface: "hsl(var(--success-surface))",
          border: "hsl(var(--success-border))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          surface: "hsl(var(--warning-surface))",
          border: "hsl(var(--warning-border))",
        },
        danger: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          surface: "hsl(var(--danger-surface))",
          border: "hsl(var(--danger-border))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          surface: "hsl(var(--info-surface))",
          border: "hsl(var(--info-border))",
        },
        /* 3RB brand tokens */
        brand: {
          DEFAULT: "hsl(var(--primary))",
          primary: "hsl(var(--brand-primary))",
          accent: "hsl(var(--brand-accent))",
          gold: "hsl(var(--brand-gold))",
          warm: "hsl(var(--brand-warm))",
          surface: "hsl(var(--brand-surface))",
          /* Ramps sampled from the logo by scripts/sample-logo-colors.js.
           * `blue` is the logo's azure (#0096D2), which is deliberately NOT
           * --primary: --primary is the app's indigo and repointing it would
           * restyle every screen. */
          blue: {
            DEFAULT: "hsl(var(--brand-blue))",
            50: "hsl(var(--brand-blue-50))",
            100: "hsl(var(--brand-blue-100))",
            200: "hsl(var(--brand-blue-200))",
            300: "hsl(var(--brand-blue-300))",
            400: "hsl(var(--brand-blue-400))",
            500: "hsl(var(--brand-blue-500))",
            600: "hsl(var(--brand-blue-600))",
            700: "hsl(var(--brand-blue-700))",
            800: "hsl(var(--brand-blue-800))",
            900: "hsl(var(--brand-blue-900))",
          },
          orange: {
            DEFAULT: "hsl(var(--brand-orange))",
            50: "hsl(var(--brand-orange-50))",
            100: "hsl(var(--brand-orange-100))",
            200: "hsl(var(--brand-orange-200))",
            300: "hsl(var(--brand-orange-300))",
            400: "hsl(var(--brand-orange-400))",
            500: "hsl(var(--brand-orange-500))",
            600: "hsl(var(--brand-orange-600))",
            700: "hsl(var(--brand-orange-700))",
            800: "hsl(var(--brand-orange-800))",
            900: "hsl(var(--brand-orange-900))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "efop-sm": "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        "efop-md": "0 4px 16px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)",
        "efop-lg": "0 12px 34px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.04)",
        "efop-xl": "0 24px 60px rgba(15,23,42,0.14), 0 8px 16px rgba(15,23,42,0.06)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
