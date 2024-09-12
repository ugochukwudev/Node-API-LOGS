/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/views/**/*.html', // Adjust this path according to your HTML file locations
    './src/**/*.js',          // Include any JavaScript files if needed
    './src/**/*.ts',          // Include TypeScript files if needed
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

// @tailwind base;
// @tailwind components;
// @tailwind utilities;