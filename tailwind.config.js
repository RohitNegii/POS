/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDFBF7',
          100: '#FAF6EE',
          200: '#F4ECE0',
          300: '#EAE0D0',
          400: '#DCBFA4',
          500: '#C79E78',
          600: '#B08359',
          700: '#8C623C',
          800: '#684525',
          900: '#472C15',
          950: '#2C1B0A',
        },
        pearl: '#FFFDF9',
        parchment: '#F6F1E7',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
