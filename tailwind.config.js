/** @type {import('tailwindcss').Config} */
export default {
  content: ["./BOTINDEXSECURITY.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        fadeIn: "fadeIn 0.5s ease-in-out",
        fadeOut: "fadeOut 0.5s ease-in-out",
        "skeleton-fade": "skeletonFade 0.3s ease-out",
        "card-enter": "cardEnter 0.3s ease-out both",
        "gateway-brand": "gatewayBrand 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeOut: {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(-20px)" },
        },
        skeletonFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        cardEnter: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        gatewayBrand: {
          "0%": { opacity: "0", letterSpacing: "0.32em", transform: "translateY(5px) scale(0.98)" },
          "65%": { opacity: "1", letterSpacing: "0.12em", transform: "translateY(0) scale(1.015)" },
          "100%": { opacity: "1", letterSpacing: "0.16em", transform: "translateY(0) scale(1)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
