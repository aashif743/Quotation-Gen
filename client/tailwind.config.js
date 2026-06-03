/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'arkay': {
          primary: '#dc2626',
          secondary: '#000000'
        },
        'electronics': {
          primary: '#16a34a',
          secondary: '#ffffff'
        }
      }
    },
  },
  plugins: [],
}