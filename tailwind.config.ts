import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eefbf4',
          100: '#d6f5e3',
          500: '#1f9d5a',
          600: '#188049',
          700: '#146a3d',
          900: '#0d4327',
        },
      },
    },
  },
  plugins: [],
};

export default config;
