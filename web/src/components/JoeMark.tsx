/**
 * JoeMark — the brand mark: the letter J drawn in a single flowing pen
 * stroke, finished with a gold dot where the pen lifts («التوقيع»).
 *
 * The brand name is always the Latin word "Joe", in every locale — the
 * mark itself is language-silent.
 *
 * `animate` plays the signature being written: the stroke draws itself,
 * then the dot lands with a small pop. Users with reduced-motion get the
 * finished mark instantly.
 */
import React from 'react';

interface JoeMarkProps {
    size?: number;
    /** Stroke color; defaults to currentColor so it follows the text color. */
    color?: string;
    /** The pen-lift dot. */
    dotColor?: string;
    /** Draw the signature on mount. */
    animate?: boolean;
    className?: string;
}

const JoeMark: React.FC<JoeMarkProps> = ({
    size = 32,
    color = 'currentColor',
    dotColor = '#e0a458',
    animate = false,
    className,
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={`joe-mark ${animate ? 'joe-mark-animate' : ''} ${className || ''}`}
        aria-label="Joe"
        role="img"
    >
        <path
            className="joe-mark-stroke"
            d="M 15 11 C 22 8.5, 32 8.5, 36 11.5 C 33 11, 30 12, 29.5 16 L 28 30 C 27.4 36.5, 23 40.5, 17 40 C 12.5 39.6, 9.5 36.5, 10 32.5"
            stroke={color}
            strokeWidth="5.6"
            strokeLinecap="round"
            pathLength={1}
        />
        <circle className="joe-mark-dot" cx="38.5" cy="17.5" r="3.4" fill={dotColor} />
    </svg>
);

export default JoeMark;
