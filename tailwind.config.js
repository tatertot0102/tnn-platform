/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dce6ff',
          200: '#b9ccff',
          400: '#6690f5',
          600: '#3a5fd9',
          800: '#1e3a8a',
          900: '#0f1f52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Motion tokens: every transition and animation uses these.
      transitionDuration: {
        fast: '150ms',
        normal: '260ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'page-in':  { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in':   { from: { opacity: '0', transform: 'scale(0.97) translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in':  'fade-in 150ms ease-out both',
        'page-in':  'page-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in':   'pop-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-in': 'sheet-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
