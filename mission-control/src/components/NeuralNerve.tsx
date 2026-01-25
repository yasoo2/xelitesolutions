
import React, { useEffect, useRef } from 'react';

interface NeuralNerveProps {
    status: 'idle' | 'thinking' | 'executing' | 'error';
    intensity?: number; // 0 to 1
    className?: string;
}

export const NeuralNerve = React.memo<NeuralNerveProps>(({ status, intensity = 0.5, className = '' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let time = 0;

        // Configuration based on status
        const getConfig = () => {
            switch (status) {
                case 'thinking': return { color: '234, 179, 8', speed: 0.2, amplitude: 20 * intensity }; // Yellow/Gold
                case 'executing': return { color: '6, 182, 212', speed: 0.3, amplitude: 15 * intensity }; // Cyan
                case 'error': return { color: '239, 68, 68', speed: 0.05, amplitude: 5 }; // Red (jittery?)
                default: return { color: '147, 51, 234', speed: 0.02, amplitude: 5 }; // Purple (Idle breathing)
            }
        };

        const render = () => {
            const { color, speed, amplitude } = getConfig();
            const width = canvas.width = canvas.parentElement?.clientWidth || 300;
            const height = canvas.height = canvas.parentElement?.clientHeight || 100;
            const centerY = height / 2;

            ctx.clearRect(0, 0, width, height);
            time += speed;

            // Multiple overlapping waves for "Nerve" effect
            const waves = [
                { freq: 0.01, offset: 0, opacity: 0.5 },
                { freq: 0.02, offset: 2, opacity: 0.3 },
                { freq: 0.04, offset: 4, opacity: 0.2 }
            ];

            // Glow effect
            ctx.shadowBlur = 15;
            ctx.shadowColor = `rgba(${color}, 0.8)`;

            waves.forEach((w, i) => {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(${color}, ${w.opacity})`;
                ctx.lineWidth = 2;

                for (let x = 0; x < width; x++) {
                    // Sine wave equation with noise
                    const y = centerY +
                        Math.sin(x * w.freq + time + w.offset) * amplitude * (1 + Math.sin(time * 0.5));

                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

            // Central Core Pulse (Heartbeat)
            if (status !== 'idle') {
                const pulse = Math.abs(Math.sin(time * 2)) * 5;
                ctx.beginPath();
                ctx.arc(width / 2, centerY, 5 + pulse, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${color}, ${0.5 + pulse / 20})`;
                ctx.fill();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, [status, intensity]);

    return (
        <canvas
            ref={canvasRef}
            className={`w-full h-full ${className}`}
        />
    );
}); // End memo
