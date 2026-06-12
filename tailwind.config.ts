import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F6F6F9",
        ink: "#23222E",
        soft: "#6F6E80",
        line: "#E8E7F0",
        iris: { DEFAULT: "#7C6FE4", soft: "#E7E3FB", deep: "#5B4FC7" },
        sage: { DEFAULT: "#7FA877", soft: "#E2EEDD" },
        peach: { DEFAULT: "#E2906B", soft: "#FBE7DA" },
        sky: { DEFAULT: "#5E8FC9", soft: "#DFEAF8" },
        rose: { DEFAULT: "#D2738F", soft: "#F9E2EA" },
        butter: { DEFAULT: "#C9A23F", soft: "#F9F0D8" }
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["Manrope", "system-ui", "-apple-system", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(35,34,46,0.04), 0 8px 24px -12px rgba(35,34,46,0.12)",
        lift: "0 2px 4px rgba(35,34,46,0.05), 0 16px 40px -16px rgba(124,111,228,0.25)"
      },
      borderRadius: { xl2: "1.25rem" }
    }
  },
  plugins: []
};
export default config;
