/**** @type {import('tailwindcss').Config} ****/
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f17',
        card: 'rgba(255,255,255,0.04)',
        glow: '#7c3aed',
        accent: '#22d3ee',
      },
      boxShadow: {
        glow: '0 0 30px rgba(124,58,237,0.35)',
        glowAccent: '0 0 30px rgba(34,211,238,0.25)'
      },
      backgroundImage: {
        'grid-dots': 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-dots': '20px 20px',
      }
    }
  },
  plugins: []
}
