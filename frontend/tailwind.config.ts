import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Couleur de marque (nom historique « prairie »), palette ambre du template Bloom.
        // 500 = ambre vif (boutons, texte sombre dessus) ; 600+ assombris pour garder un texte blanc lisible.
        prairie: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#b45309',
          700: '#92400e',
          800: '#78350f',
          900: '#451a03',
        },
        // Doré/Jaune - inspiré du soleil et du blé du logo
        terre: {
          50: '#fefcf3',
          100: '#fdf6dc',
          200: '#fbedb8',
          300: '#f7df85',
          400: '#f2c94c',
          500: '#d4a82a',
          600: '#b8891f',
          700: '#96691a',
          800: '#7a5316',
          900: '#5c3e11',
        },
        // Gris neutres du template Bloom (nom historique « warm »)
        warm: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
        // Palette du template Electro (Bootstrap) portée en Tailwind :
        // primary = orange, secondary = rouge, dark = gris texte/footer, light = fond des bandeaux.
        electro: {
          primary: '#F28B00',
          secondary: '#F92400',
          dark: '#484848',
          light: '#F5F5F5',
        },
        // Fond de page
        cream: {
          50: '#ffffff',
          100: '#fafafa',
          200: '#f5f5f5',
          300: '#e5e5e5',
        },
      },
      fontFamily: {
        display: ['var(--font-quicksand)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'warm': '0px 4px 8px -1px rgba(0, 0, 0, 0.1), 0px 1px 2px -2px rgba(0, 0, 0, 0.1)',
        'warm-lg': '0px 4px 8px -1px rgba(0, 0, 0, 0.1), 0px 8px 10px -2px rgba(0, 0, 0, 0.1)',
        'prairie': '0 4px 6px -1px rgba(245, 158, 11, 0.2), 0 2px 4px -1px rgba(245, 158, 11, 0.12)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-pattern': "url('/images/farm/hero-pattern.svg')",
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'bounce-gentle': 'bounceGentle 2s infinite',
        'star-pop': 'starPop 0.5s ease-out both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        starPop: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '50%': { transform: 'scale(1.35) rotate(-12deg)' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
