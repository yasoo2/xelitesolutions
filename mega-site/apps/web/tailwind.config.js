export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        secondary: "#a855f7",
        accent: "#22c55e",
        muted: "#64748b",
        background: "#0b0f19",
        foreground: "#e5e7eb",
        card: "#111827"
      },
      container: { center: true, padding: "1rem", screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" } },
      borderRadius: { lg: "0.75rem", xl: "1rem" }
    }
  },
  plugins: []
}
