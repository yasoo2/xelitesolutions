/**
 * THE MODEL READS THE MESSAGE WHEN THE WORD LISTS DO NOT KNOW IT.
 *
 * The owner, 2026-11-07, at Joe's chat with his phone on the cable: «شغل
 * الكشاف في الهاتف» and then «اطفيئ الكشاف» both went to the chat's
 * answerer, which gave advice, because the routing knew the words only from
 * lists: «هاتفي» but not «الهاتف», «اطفي» but not «اطفيئ». He asked for the
 * language to be solved at the root, for any word. Lists cannot hold every
 * spelling, dialect and typo of every language; the model can read them.
 *
 * So the fast lists still decide what they know (no call, no cost), and a
 * message they leave undecided is read by the model the owner chose, the
 * same one the run will use, through the same budget guard (engineBrain):
 * is it an action on his phone or his computer, now? The chat's recent work
 * on a device goes with it, so «اطفيه» after the flashlight reads as the
 * phone. A failure, a refusal or a slow answer leaves the message to the
 * chat's answerer exactly as before: the model can only add a route.
 */
import { readModelJsonObject } from '../../shared/utils/json';

export type DeviceTarget = 'phone' | 'computer';

export interface UnderstandContext {
    modelConfig?: any;
    runId?: unknown;
    sessionId?: unknown;
    signal?: AbortSignal;
}

export interface RecentDeviceWork { target: DeviceTarget; request: string }

/** One question to the model; injectable so a test answers for it. */
export type Ask = (prompt: string) => Promise<string>;

const TIMEOUT_MS = 20_000;

/** The prompt: the message verbatim, what the chat was doing, and the one answer wanted. */
export function deviceIntentPrompt(message: string, recent?: RecentDeviceWork | null, chat = ''): string {
    return [
        'You read ONE message a user typed to Joe. Joe is an agent that can act on the user\'s own Android phone (tap, open apps, the flashlight, Wi-Fi, Bluetooth, volume, calls, messages, email, reading the screen…) and on his computer (open programs, click, type, read the screen, scan his home network…). Joe can also build software or answer questions.',
        'Decide whether the message asks Joe to DO something on the user\'s phone or computer now. The message may be in any language or dialect, misspelled, very short, or written without the device\'s name.',
        ...(recent ? [`In this chat Joe has just been working on the user's ${recent.target.toUpperCase()}; the last request was: «${recent.request.slice(0, 200)}». A short command now («turn it off», «open it», «اطفيه», «سكّره»…) most likely means the ${recent.target}.`] : []),
        //  The chat's own words: «افحص» after a question about the Wi-Fi is a scan (2026-11-08).
        ...(chat ? [chat] : []),
        'Asking which devices are on his Wi-Fi or network, or to check or scan it, IS device work: answer "computer" (Joe scans from the computer).',
        'Questions about how something works, requests to build or change software or a website, and conversation are "none".',
        'Answer with JSON only, one of: {"device":"phone"} {"device":"computer"} {"device":"none"}',
        '',
        'Message:',
        '"""',
        String(message || '').slice(0, 800),
        '"""',
    ].join('\n');
}

/** Reads the model's answer: a device, or null for none or anything unclear. */
export function readDeviceIntent(answer: string): DeviceTarget | null {
    const json: any = readModelJsonObject(String(answer || ''));
    const d = String(json?.device || '').trim().toLowerCase();
    return d === 'phone' || d === 'computer' ? d : null;
}

/** The model the owner chose, asked once, under the run's budget guard. */
async function chosenModelAsk(ctx: UnderstandContext, signal: AbortSignal): Promise<Ask | null> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { engineModelChoiceFor, engineBrain } = require('./model');
    const choice = engineModelChoiceFor(ctx.modelConfig);
    if (!choice || 'error' in choice) return null;
    const brain = await engineBrain(choice, { runId: String(ctx.runId || 'route'), sessionId: ctx.sessionId }, signal, Date.now() + TIMEOUT_MS);
    return brain && !('error' in brain) ? brain.ask : null;
}

/**
 * Whether the message is an action on a device, read by the model. Null when
 * it is not, when understanding is off (JOE_ROUTE_UNDERSTANDING=off), when the
 * run carries no model choice, or when the model fails or is slow.
 */
export async function deviceIntentByModel(
    message: string,
    ctx: UnderstandContext,
    recent?: RecentDeviceWork | null,
    ask?: Ask,
    env: NodeJS.ProcessEnv = process.env,
    chat = '',
): Promise<DeviceTarget | null> {
    const text = String(message || '').trim();
    if (!text || text.length > 800) return null;
    if (String(env.JOE_ROUTE_UNDERSTANDING || '').toLowerCase() === 'off') return null;
    if (!ask && !ctx.modelConfig) return null;
    if (ctx.signal?.aborted) return null;
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
    try {
        const asker = ask || await chosenModelAsk(ctx, signal);
        if (!asker) return null;
        const answer = await Promise.race([
            asker(deviceIntentPrompt(text, recent, chat)),
            new Promise<string>((_, reject) => signal.addEventListener('abort', () => reject(new Error('slow')), { once: true })),
        ]);
        return readDeviceIntent(answer);
    } catch {
        return null;
    }
}
