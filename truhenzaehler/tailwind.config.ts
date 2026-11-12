import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        gold: { 400: "#e8b84a", 500: "#d49b22", 600: "#b07d12" },
      },
    },
  },
  plugins: [],
} satisfies Config;
