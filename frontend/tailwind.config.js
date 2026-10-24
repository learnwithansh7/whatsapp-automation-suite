/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          teal: '#128C7E',
          green: '#25D366',
          dark: '#075E54',
          light: '#DCF8C6',
          bg: '#EFEAE2',
        },
      },
    },
  },
  plugins: [],
};
