/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Body voice — replaces Tailwind's default sans stack app-wide.
        sans: ['Instrument Sans', 'Helvetica Neue', 'system-ui', 'sans-serif'],
        // Display voice — headings and hero numerals.
        display: ['Sora', 'Avenir Next', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
