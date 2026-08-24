/**
 *  SAYING WHICH PHASE HE IS IN — ONCE, IN THE READER'S LANGUAGE.
 *
 *  Measured live on his own prompt, reading the DOM every four seconds while a
 *  clinic table was built:
 *
 *      phase="Joe is thinking"   ×14 ticks
 *      phase="Joe is executing"  ×8 ticks
 *      FRAMES [… ["thinking_phase", 2] …]
 *
 *  Two phase frames in a whole run, and «Joe is planning» never once. Yet the
 *  card had shown «Joe is thinking» from the first second — because
 *  `useState('analyzing')` is the component's DEFAULT, not something anyone
 *  told it. The indicator was reporting a phase it had never been given.
 *
 *      THE CLASS: A DEFAULT IS NOT A MEASUREMENT.
 *
 *  A screen that shows a state nobody sent is indistinguishable from a screen
 *  showing a state that is true, and that is the whole of the difference
 *  between an instrument and a decoration.
 *
 *  Grepped before writing a line: in production only two call sites emitted a
 *  phase at all — `ToolService` says `executing` when a tool starts, and
 *  `reactLoop` says all three, but `reactLoop` is the BROWSER loop and never
 *  runs during a build. So on the path that builds his projects, analysis and
 *  planning were never announced.
 *
 *  Everything goes through here now so there is one answer to «which phase,
 *  and what do we call it», rather than a third and fourth spelling appearing
 *  the next time someone needs to say it — which is the defect this repository
 *  keeps paying for.
 */

import { pick, type SupportedLanguage } from '../../shared/utils/language';

export type ThinkingPhase = 'analyzing' | 'synthesizing' | 'executing' | 'idle';

/**
 *  The one-line detail that rides with a phase, in six languages.
 *
 *  It is deliberately about the WORK and not about the machinery: he is not a
 *  programmer, and «Activating Dynamic Agent Runtime» told him nothing except
 *  that something was happening. The phase name itself is resolved in the
 *  interface through i18n; this is the sentence beside it.
 */
const DETAIL: Record<Exclude<ThinkingPhase, 'idle'>, Parameters<typeof pick>[0]> = {
    analyzing: {
        ar: 'أقرأ طلبك وأفهم ما تريد بالضبط',
        en: 'Reading your request and working out exactly what you want',
        fr: 'Je lis votre demande et je détermine ce que vous voulez',
        de: 'Ich lese Ihre Anfrage und ermittle, was genau Sie möchten',
        ru: 'Читаю ваш запрос и определяю, что именно нужно',
        es: 'Leo tu solicitud y determino qué quieres exactamente',
    },
    synthesizing: {
        ar: 'أرتّب الخطوات قبل أن أبدأ',
        en: 'Putting the steps in order before starting',
        fr: 'Je mets les étapes en ordre avant de commencer',
        de: 'Ich ordne die Schritte, bevor ich beginne',
        ru: 'Выстраиваю шаги перед началом',
        es: 'Ordeno los pasos antes de empezar',
    },
    executing: {
        ar: 'أنفّذ الخطوات واحدةً واحدة',
        en: 'Carrying out the steps one by one',
        fr: 'J’exécute les étapes une par une',
        de: 'Ich führe die Schritte nacheinander aus',
        ru: 'Выполняю шаги один за другим',
        es: 'Ejecuto los pasos uno a uno',
    },
};

/**
 *  What to say beside a phase, in the reader's language.
 *
 *  `idle` and anything unrecognised get an empty string on purpose: a phase
 *  with nothing to report must say nothing, not invent a sentence. The caller
 *  can tell the difference between «no detail» and «a detail I made up».
 */
export function phaseDetail(phase: ThinkingPhase | string, language: SupportedLanguage | string | undefined): string {
    const table = (DETAIL as Record<string, Parameters<typeof pick>[0]>)[String(phase)];
    return table ? pick(table, language) : '';
}

/**
 *  Announce a phase on the session's live channel.
 *
 *  Silent when there is no session to announce to — a broadcast addressed to
 *  nobody used to be an exception in the middle of a build, and a run must not
 *  die because a caller had no chat attached.
 */
/** The phase each session was last told it is in. */
const lastPhaseBySession = new Map<string, ThinkingPhase>();
const MAX_TRACKED_SESSIONS = 200;

/** Forget a session's phase — a new run must be able to announce its first. */
export function forgetPhase(sessionId: string | undefined): void {
    const sid = String(sessionId || '').trim();
    if (sid) lastPhaseBySession.delete(sid);
}

export function announcePhase(
    sessionId: string | undefined,
    phase: ThinkingPhase,
    language?: SupportedLanguage | string,
): boolean {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    /**
     *  A PHASE IS A STATE, NOT AN EVENT.
     *
     *  Live round, his screen, one request:
     *
     *      Reading your request and working out exactly what you want
     *      Reading your request and working out exactly what you want
     *      Reading your request and working out exactly what you want
     *      Reading your request and working out exactly what you want
     *
     *  Two callers announce the same moment — AgentLoopService before it
     *  hands over, and the orchestrator as it begins — and each is right
     *  to. What is wrong is treating «I am analyzing» as news: announcing
     *  a state you are already in says nothing and prints a line.
     *
     *  So the same phase for the same session is announced ONCE, and the
     *  next different phase speaks again. Going idle forgets, because the
     *  next request must be able to say «analyzing» from the start.
     */
    if (phase === 'idle') { lastPhaseBySession.delete(sid); return false; }
    if (lastPhaseBySession.get(sid) === phase) return false;
    lastPhaseBySession.set(sid, phase);
    //  A session that ended long ago must not hold a slot forever.
    if (lastPhaseBySession.size > MAX_TRACKED_SESSIONS) {
        const oldest = lastPhaseBySession.keys().next().value;
        if (oldest !== undefined) lastPhaseBySession.delete(oldest);
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { broadcastThinkingPhase } = require('../../api/ws');
        broadcastThinkingPhase(sid, phase, phaseDetail(phase, language));
        return true;
    } catch {
        //  No socket layer in this process — a script, a test, a worker.
        return false;
    }
}
