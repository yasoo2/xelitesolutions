
import React from 'react';

interface JoeLogoProps {
    size?: number;
    className?: string;
}

export const JoeLogo: React.FC<JoeLogoProps> = ({ size = 24, className = "" }) => {
    return (
        <div
            className={`flex items-center justify-center rounded-xl bg-slate-900 overflow-hidden shadow-2xl relative group ${className}`}
            style={{
                width: size,
                height: size,
                border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
        >
            {/* Soft background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10 opacity-50" />

            {/* Stylized 'J' SVG */}
            <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-[60%] h-[60%] relative z-10 transition-transform duration-300 group-hover:scale-110"
            >
                {/* Modern Geometric J */}
                <path
                    d="M60 20V65C60 76.0457 51.0457 85 40 85C28.9543 85 20 76.0457 20 65"
                    stroke="url(#joe-j-gradient)"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* Top accent circle */}
                <circle cx="60" cy="20" r="9" fill="url(#joe-j-gradient)" />

                <defs>
                    <linearGradient id="joe-j-gradient" x1="20" y1="20" x2="60" y2="85" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#A855F7" /> {/* Purple 500 */}
                        <stop offset="1" stopColor="#06B6D4" /> {/* Cyan 500 */}
                    </linearGradient>
                </defs>
            </svg>

            {/* Subtle gloss effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
        </div>
    );
};
