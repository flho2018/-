/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        deeppink: {
          50: '#FDF2F8',
          100: '#FCE7F3',
          200: '#FBCFE8',
          300: '#F9A8D4',
          400: '#F472B6',
          500: '#EC4899',
          600: '#DB2777',
          700: '#BE185D', // وردي غامق غني
          800: '#9D174D', // ماجنتا داكن
          900: '#831843', // وردي غامق عميق
          950: '#500724',
        },
        mauve: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#C084FC',
          500: '#A855F7',
          600: '#9333EA',
          700: '#7E22CE',
          800: '#6B21A8',
          900: '#581C87', // موف ملكي غامق
          950: '#3B0764',
        },
        crystal: {
          pink: '#F472B6',
          rose: '#FB7185',
          blush: '#FDF2F8',
          light: '#FCE7F3',
          glow: '#E879F9',
        },
        pos: {
          primary: '#BE185D',    // وردي غامق
          secondary: '#831843',  // ماجنتا ملكي
          accent: '#EC4899',     // وردي بلوري
          dark: '#380624',       // داكن غني
          light: '#FDF2F8',      // خلفية وردية فاتحة
          danger: '#E11D48',     // أحمر روز
          warning: '#F59E0B',    // عنبري
          success: '#10B981',    // زمردي
        }
      },
      fontFamily: {
        cairo: ['Cairo', 'Tajawal', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
