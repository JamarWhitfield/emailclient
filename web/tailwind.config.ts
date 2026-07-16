import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#0a5a2a",
          gold: "#b8860b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
