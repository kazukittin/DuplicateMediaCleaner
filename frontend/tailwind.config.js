/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#0078D7',
        secondary: '#50ABF1',
        accent: '#C42B1C',
        success: '#107C10',
        warning: '#9D5D00',
        'bg-base': '#F0F0F0',
        'bg-card': '#FFFFFF',
        'bg-panel': '#E8E8E8',
        border: '#ADADAD',
        'text-primary': '#1A1A1A',
        'text-secondary': '#555555',
        'text-muted': '#888888',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
