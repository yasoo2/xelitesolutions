/**
 * THE REQUIREMENT LEDGER IS SEEDED BY THE JUDGE'S OWN READER.
 *
 * The plan's R1…Rn and the final acceptance verdict must talk about the same
 * things, or the model is told to prove one list and judged on another. So the
 * ledger is not seeded by a reader of its own: it is read by
 * readRequestRequirements, the reader the acceptance judge uses — the model
 * names what the request asks the project to have or do, every item quoted
 * from the request and refused when it is not (named-requirements), and when
 * the model names nothing or cannot be reached, the request's own explicit
 * clauses are still read (requirementsFromRequestClauses).
 *
 * Each seed carries the reader's id as its key and the reader's quote, so the
 * verifier (verify.ts) judges exactly these requirements and maps every
 * verdict back to R1…Rn through Requirement.key.
 */
import type { RequirementSeed } from './plan';
import { readRequestRequirements } from '../quality/acceptance-gate';
import { isArabicReply } from '../../shared/reply-language';

export async function seedRequirementsFromRequest(
    request: string,
    language: string,
    ask: (prompt: string) => Promise<string>,
    term: (line: string) => void = () => undefined,
): Promise<RequirementSeed[]> {
    const isArabic = isArabicReply({ language, text: request });
    const read = await readRequestRequirements(String(request || ''), isArabic, ask, term);
    return read.named.map(r => ({ text: r.text, quote: r.quote, key: r.id }));
}
