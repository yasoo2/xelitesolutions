/**
 * ⛔ ONE READER OF «IS THIS PACKAGE SCRIPT A PLACEHOLDER?» (round 21 review, Q9).
 *
 * Three readers disagreed. The phase's automatic build check counted any
 * non-empty build script as a build, so `"build": "echo No build step
 * required"` printed its sentence, exited 0 and was logged «Auto-build check
 * passed» with a passed receipt. The delivery's quality contract refused only
 * an echo that said one of a few remembered words («not implemented», «no
 * tests», «todo»), so the same script passed it too. The record gate refused
 * any lone echo. A fixed word list cannot know what a script does; its
 * commands can.
 *
 * A script is a placeholder when it does no work: every command in it only
 * prints or exits — `echo …`, `printf …`, `true`, `false`, `:`, `exit N`,
 * however they are chained (&&, ||, ;, |). `npm init`'s own `echo "Error: no
 * test specified" && exit 1` is one; `echo building && vite build` is not.
 * A command substitution (`$(…)`, backticks) may do work, so a command with
 * one is never inert. An empty script is absent, not a placeholder.
 */

const INERT_COMMAND = /^(?:(?:echo|printf)(?:\s|$)|(?:true|false|:)$|exit(?:\s+-?\d+)?$)/u;

/** The commands of a shell line, split on unquoted &&, ||, ;, | and newlines. */
function commandsOf(script: string): string[] {
    const commands: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < script.length; i++) {
        const ch = script[i];
        if (quote) {
            if (ch === '\\' && quote === '"' && i + 1 < script.length) { current += ch + script[++i]; continue; }
            if (ch === quote) quote = null;
            current += ch;
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
        if (ch === '\\' && i + 1 < script.length) { current += ch + script[++i]; continue; }
        const pair = script.slice(i, i + 2);
        if (pair === '&&' || pair === '||') { commands.push(current); current = ''; i++; continue; }
        if (ch === ';' || ch === '|' || ch === '\n' || ch === '\r') { commands.push(current); current = ''; continue; }
        current += ch;
    }
    commands.push(current);
    return commands.map(command => command.trim()).filter(Boolean);
}

/**
 * Inert: it only prints or exits — and writes no file. A redirect into a file
 * is work; one onto another stream (`>&2`, `2>&1`) or into the null device is not.
 */
function isInert(command: string): boolean {
    const unquoted = command
        .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/gu, '""')
        .replace(/\d*>&\d+|\d*>\s*(?:\/dev\/null|nul)(?=\s|$)/giu, ' ');
    return INERT_COMMAND.test(command) && !/[<>]/u.test(unquoted);
}

export function isPlaceholderScript(script: unknown): boolean {
    const text = typeof script === 'string' ? script.trim() : '';
    if (!text || /\$\(|`/u.test(text)) return false;
    const commands = commandsOf(text);
    return commands.length > 0 && commands.every(isInert);
}

/** A script that is declared and does work: a non-empty string that is not a placeholder. */
export function isRealScript(script: unknown): boolean {
    return typeof script === 'string' && script.trim().length > 0 && !isPlaceholderScript(script);
}
