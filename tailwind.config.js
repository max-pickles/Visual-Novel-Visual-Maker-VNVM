/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vn: {
          bg:      "#05080f",
          surface: "#0b0f1e",
          border:  "#1a2540",
          muted:   "#1e2d42",
          dim:     "#4a5568",
          teal:    "#00d4c8",
          indigo:  "#4b6cf7",
          pink:    "#f472b6",
          purple:  "#a78bfa",
          red:     "#ef4444",
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Cascadia Code"', '"Fira Code"', "monospace"],
      },
      animation: {
        "fade-in":    "fadeIn 0.25s ease",
        "slide-up":   "slideUp 0.3s ease",
        "slide-left": "slideLeft 0.3s ease",
        "pulse-glow": "pulseGlow 2s ease infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: "0" },                  to: { opacity: "1" } },
        slideUp:   { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideLeft: { from: { opacity: "0", transform: "translateX(-8px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        pulseGlow: { "0%, 100%": { boxShadow: "0 0 6px #00d4c840" }, "50%": { boxShadow: "0 0 18px #00d4c880" } },
      },
    },
  },
  plugins: [],
};
