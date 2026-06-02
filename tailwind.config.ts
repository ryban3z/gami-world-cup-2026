import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0a0e27",
        panel: "#11183a",
        glow: "#1c2a5e",
        gold: "#ffd24a",
        bodytext: "#9fb0d8",
        caption: "#6b7aa3",
        footer: "#070a1d",
      },
    },
  },
  plugins: [],
};
export default config;
