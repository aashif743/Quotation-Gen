/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Class-based dark mode so a `<html class="dark">` toggle (driven by our
  // ThemeContext) flips every `dark:` variant we sprinkle across the app.
  // Documents (.quotation-document / .invoice-document / .delivery-note-document)
  // deliberately don't carry dark variants so the on-screen preview and the
  // PDF export stay identical.
  darkMode: 'class',
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