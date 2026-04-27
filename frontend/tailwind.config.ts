import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['DM Sans', 'system-ui', 'sans-serif'] },
      colors: {
        bg:          'var(--bg)',
        card:        'var(--card)',
        card2:       'var(--card2)',
        line:        'var(--border)',
        accent:      'var(--accent)',
        'accent-dim':'var(--accent-dim)',
        gold:        'var(--gold)',
        red:         'var(--red)',
        blue:        'var(--blue)',
        purple:      'var(--purple)',
        orange:      'var(--orange)',
        teal:        'var(--teal)',
        text:        'var(--text)',
        sub:         'var(--text-sub)',
        dim:         'var(--text-dim)',
      },
      boxShadow: {
        accent: '0 0 20px rgba(0,212,160,0.15)',
        card:   '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
export default config;
