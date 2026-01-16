/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                cyber: {
                    dark: '#0f172a',
                    light: '#1e293b',
                    accent: '#06b6d4', // Cyan
                    neon: '#8b5cf6',   // Violet
                }
            },
            fontFamily: {
                mono: ['"Fira Code"', 'monospace'],
                display: ['"Orbitron"', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
