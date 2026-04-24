import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        soil:      "#3B2F2F",
        moss:      "#4A6741",
        sage:      "#8FAF85",
        straw:     "#F2E8C9",
        bark:      "#7A5C44",
        sky:       "#B0CBE4",
        harvest:   "#D4822A",
        parchment: "#FAF4E6",
        ink:       "#2C2118",
        "moss-light":    "#5C7F52",
        "moss-dark":     "#3A5233",
        "straw-dark":    "#E8D9A8",
        "sage-light":    "#C4D9BF",
        "harvest-light": "#EFA96A",
        "soil-deep":     "#4A2E14",
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans:  ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono:  ["var(--font-dm-mono)", "'Courier New'", "monospace"],
      },
      boxShadow: {
        card:        "0 2px 8px rgba(59,47,47,0.08)",
        "card-hover": "0 4px 16px rgba(59,47,47,0.14)",
        float:       "0 -2px 16px rgba(59,47,47,0.10)",
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
