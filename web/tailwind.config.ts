import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "app-background":    "#F6F8F7",
        "app-surface":       "#FFFFFF",
        "app-surface-subtle":"#F1F5F3",
        "app-surface-hover": "#F7FAF8",
        "app-border":        "#DDE5E1",
        "app-border-subtle": "#E9EEEB",
        "app-text":          "#17211C",
        "app-text-secondary":"#59665F",
        "app-text-muted":    "#7B8780",
        brand: {
          50:  "#F5FAF7",
          100: "#EAF6EF",
          200: "#D5EBDD",
          300: "#AED8BF",
          400: "#71B28B",
          500: "#3C8B61",
          600: "#2D7350",
          700: "#235B40",
          800: "#1B4833",
          900: "#153A2A",
          950: "#0B2419",
        },
        success: {
          50:  "#EFFAF3",
          100: "#DCF4E4",
          200: "#BFE5CD",
          700: "#216B45",
        },
        warning: {
          50:  "#FFF8F1",
          100: "#FEEAD1",
          200: "#F3D3AE",
          700: "#A64B12",
        },
        danger: {
          50:  "#FFF4F3",
          100: "#FEE4E2",
          200: "#F8C9C5",
          600: "#C7443E",
          700: "#A93631",
        },
        info: {
          50:  "#F2F7FA",
          600: "#3B6F91",
        },
      },
    },
  },
  plugins: [],
};

export default config;
