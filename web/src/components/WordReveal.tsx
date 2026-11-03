/**
 * WordReveal — a reply that arrives while the user watches unfolds word by
 * word (lib/wordReveal.ts sets the pace). The text is handed to `children`,
 * so the reply keeps its own Markdown rendering at every step. History, and
 * anyone who asked the system for less motion, see the whole text at once.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { revealPrefix, revealTokens, wordsAt } from '../lib/wordReveal';

function prefersReducedMotion(): boolean {
    try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

interface WordRevealProps {
    text: string;
    animate: boolean;
    /** Called as the text grows, so the conversation can follow it down. */
    onGrow?: () => void;
    onDone?: () => void;
    children: (shown: string) => React.ReactNode;
}

export default function WordReveal({ text, animate, onGrow, onDone, children }: WordRevealProps) {
    const tokens = useMemo(() => revealTokens(text), [text]);
    const still = !animate || prefersReducedMotion();
    const [count, setCount] = useState(() => (still ? tokens.length : 1));

    useEffect(() => {
        if (still) { setCount(tokens.length); return; }
        const started = Date.now();
        setCount(1);
        const id = setInterval(() => {
            const n = wordsAt(Date.now() - started, tokens.length);
            setCount(n);
            onGrow?.();
            if (n >= tokens.length) { clearInterval(id); onDone?.(); }
        }, 40);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [still, tokens]);

    return <>{children(count >= tokens.length ? text : revealPrefix(tokens, count))}</>;
}
