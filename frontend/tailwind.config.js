/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#5B9FBD',
        secondary: '#8AC4D0',
        accent: '#FF6B6B',
        success: '#4ECDC4',
        'bg-dark': '#1F1F1F',
        'bg-card': '#2C2C2C',
        'bg-panel': '#3A3A3A',
        border: '#4A4A4A',
        'text-primary': '#E8E8E8',
        'text-secondary': '#A0A0A0',
        'text-muted': '#707070',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
