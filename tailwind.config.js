/** Every colour is a CSS variable (src/index.css: light and dark), so the switch in Settings changes them all. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'), card: v('card'), ink: v('ink'), muted: v('muted'), line: v('line'), grid: v('grid'),
        bar: v('bar'), strong: v('strong'), temp: v('temp'), accent: v('accent'), ai: v('ai'), good: v('good'), warn: v('warn'), bad: v('bad'),
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], display: ['"Space Grotesk"', 'Inter', 'sans-serif'] },
    },
  },
};
