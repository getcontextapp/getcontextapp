import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans:  ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: {
          50:  '#FDFAF5',
          100: '#F9F3E8',
          200: '#F2E6D0',
          300: '#E8D5B4',
          400: '#D4B896',
          500: '#BC9B78',
        },
        sage: {
          50:  '#F4F6F2',
          100: '#E6EBE2',
          200: '#C8D5C0',
          300: '#A3BA97',
          400: '#7D9E6E',
          500: '#5A7A4A',
        },
        terracotta: {
          50:  '#FBF3EF',
          100: '#F5E3D8',
          200: '#EAC4AA',
          300: '#D99B74',
          400: '#C47448',
          500: '#A85A2E',
        },
        warm: {
          50:  '#F7F5F2',
          100: '#EDE9E3',
          200: '#D4CEC5',
          300: '#B0A898',
          400: '#887E6E',
          500: '#635A4C',
          700: '#3D3529',
          900: '#1E1A14',
        },
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      boxShadow: {
        card:  '0 2px 16px rgba(60,45,20,0.08), 0 1px 4px rgba(60,45,20,0.06)',
        float: '0 8px 32px rgba(60,45,20,0.14), 0 2px 8px rgba(60,45,20,0.08)',
      },
      fontSize: {
        'display': ['2rem', { lineHeight: '1.2', fontWeight: '600' }],
        'heading':  ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        'subhead':  ['1.125rem', { lineHeight: '1.4', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
}
export default config
