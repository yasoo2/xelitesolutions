import {
    buildSelectReadEval,
    buildSelectSetEval,
    matchSelectOption,
    type SelectOption,
} from '../modules/browser/actionVerification';

const OPTIONS: SelectOption[] = [
    { value: 'a', text: 'Alpha' },
    { value: 'b', text: 'Beta' },
    { value: 'c-3', text: 'Gamma Ray' },
];

/** The builders bake args as a trailing JSON literal: `(fn)({"x":..,"y":..[,"value":..]})`. */
function bakedArgs(src: string): any {
    const start = src.indexOf('({"x":');
    expect(start).toBeGreaterThan(0);
    return JSON.parse(src.slice(start + 1, src.length - 1));
}

describe('select + coordinate-click effect evidence', () => {
    describe('matchSelectOption', () => {
        it('matches by exact value', () => {
            expect(matchSelectOption(OPTIONS, 'b')).toBe(1);
        });

        it('matches by exact visible text when it differs from the value', () => {
            expect(matchSelectOption(OPTIONS, 'Beta')).toBe(1);
            expect(matchSelectOption(OPTIONS, 'Gamma Ray')).toBe(2);
        });

        it('is case-insensitive and trims both sides', () => {
            expect(matchSelectOption(OPTIONS, '  bEtA  ')).toBe(1);
            expect(matchSelectOption([{ value: '  x1 ', text: '  Padded  ' }], 'padded')).toBe(0);
        });

        it('falls back to substring on text, then on value', () => {
            expect(matchSelectOption(OPTIONS, 'gamma')).toBe(2);
            expect(matchSelectOption(OPTIONS, 'c-')).toBe(2);
        });

        it('prefers an exact match anywhere over an earlier substring match', () => {
            const opts: SelectOption[] = [
                { value: 'alphabet-soup', text: 'Alphabet Soup' },
                { value: 'alpha', text: 'Alpha' },
            ];
            expect(matchSelectOption(opts, 'alpha')).toBe(1);
        });

        it('returns -1 when nothing matches', () => {
            expect(matchSelectOption(OPTIONS, 'Zeta')).toBe(-1);
        });

        it('returns -1 for empty requests and empty option lists', () => {
            expect(matchSelectOption(OPTIONS, '')).toBe(-1);
            expect(matchSelectOption(OPTIONS, '   ')).toBe(-1);
            expect(matchSelectOption([], 'Beta')).toBe(-1);
        });

        it('treats nullish option fields as empty instead of throwing', () => {
            const odd = [{ value: null, text: undefined }] as unknown as SelectOption[];
            expect(matchSelectOption(odd, 'Beta')).toBe(-1);
            expect(matchSelectOption(null as unknown as SelectOption[], 'Beta')).toBe(-1);
        });
    });

    describe('buildSelectSetEval', () => {
        it('builds syntactically valid standalone JavaScript', () => {
            const src = buildSelectSetEval(11.5, 22, 'Beta');
            expect(() => new Function(`return (${src});`)).not.toThrow();
        });

        it('embeds the live matcher source so unit tests and the page share one truth', () => {
            const src = buildSelectSetEval(11.5, 22, 'Beta');
            expect(src).toContain(matchSelectOption.toString());
        });

        it('bakes coordinates and wanted text as an inert JSON literal', () => {
            const hostile = `a"b\\c</script>')({evil:1}//`;
            const src = buildSelectSetEval(11.5, 22, hostile);
            expect(bakedArgs(src)).toEqual({ x: 11.5, y: 22, value: hostile });
            expect(() => new Function(`return (${src});`)).not.toThrow();
        });
    });

    describe('buildSelectReadEval', () => {
        it('builds syntactically valid standalone JavaScript baking only coordinates', () => {
            const src = buildSelectReadEval(7, 9);
            expect(() => new Function(`return (${src});`)).not.toThrow();
            expect(bakedArgs(src)).toEqual({ x: 7, y: 9 });
        });
    });
});
