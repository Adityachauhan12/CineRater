/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void:     '#080808',
        surface:  '#111111',
        elevated: '#1a1a1a',
        border:   '#222222',

        gold: {
          DEFAULT: '#C9A84C',
          light:   '#E8C97A',
          dim:     '#8A6F2E',
          muted:   'rgba(201,168,76,0.12)',
        },

        // violet — used sparingly: focus rings, subtle glows only
        violet: {
          DEFAULT: '#6d28d9',
          glow:    'rgba(109,40,217,0.15)',
          faint:   'rgba(109,40,217,0.06)',
        },

        ink: {
          primary:   '#F0EDE8',
          secondary: '#A0998F',
          muted:     '#5A5550',
        },
      },

      fontFamily: {
        display: ['Cormorant Garant', 'Georgia', 'serif'],
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
      },

      boxShadow: {
        'gold-sm': '0 0 12px rgba(201,168,76,0.18)',
        'gold':    '0 0 28px rgba(201,168,76,0.22)',
        'glass':   '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        'card':    '0 4px 24px rgba(0,0,0,0.8)',
        'deep':    '0 20px 60px rgba(0,0,0,0.9)',
      },

      animation: {
        'fade-up': 'fadeUp 0.5s ease forwards',
        'fade-in': 'fadeIn 0.4s ease forwards',
        'shimmer': 'shimmer 1.8s infinite',
      },

      keyframes: {
        fadeUp: {
          '0%':   { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: 0 },
          '100%': { opacity: 1 },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.no-scrollbar': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        '.glass': {
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
        },
        '.glass-dark': {
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
        },
        '.text-gradient-gold': {
          background: 'linear-gradient(135deg, #E8C97A 0%, #C9A84C 60%, #8A6F2E 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        },
      })
    },
  ],
}
