import React, { useEffect, useRef } from 'react';

interface MatrixRainProps {
    active: boolean;
    color?: string;
    speed?: number;
}

export default function MatrixRain({ active, color = '#0F0', speed = 1 }: MatrixRainProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas dimensions
        let width = canvas.offsetWidth;
        let height = canvas.offsetHeight;

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const fontSize = 12;
        const columns = Math.ceil(width / fontSize);
        const drops: number[] = [];

        // Initialize drops
        for (let i = 0; i < columns; i++) {
            drops[i] = Math.random() * -100; // Start randomly above screen
        }

        // Katakana + Latin + Numbers + Symbols
        const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
        const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const nums = '0123456789';
        const matrixChars = (katakana + latin + nums).split('');

        let animationId: number;

        const draw = () => {
            // Semi-transparent black to create trail effect
            // Opacity determines trail length (lower = longer trails)
            ctx.fillStyle = active ? 'rgba(10, 14, 23, 0.05)' : 'rgba(10, 14, 23, 0.1)';
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = color;
            ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;

            for (let i = 0; i < drops.length; i++) {
                // Random character
                const text = matrixChars[Math.floor(Math.random() * matrixChars.length)];

                // x = i * fontSize, y = drops[i] * fontSize
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                // Reset drop to top randomly
                if (drops[i] * fontSize > height && Math.random() > 0.975) {
                    drops[i] = 0;
                }

                // Move drop
                // Active: faster, chaotic
                // Idle: slower, steady
                const moveSpeed = active ? (speed * 0.8) + Math.random() * 0.4 : (speed * 0.2);
                drops[i] += moveSpeed;
            }

            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, [active, color, speed]);

    return (
        <canvas
            ref={canvasRef}
            className="matrix-canvas"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: active ? 0.25 : 0.08, // Subtle when idle, visible when active
                pointerEvents: 'none',
                zIndex: 0,
                transition: 'opacity 0.5s ease-in-out'
            }}
        />
    );
}
