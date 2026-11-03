jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: () => { throw new Error('no provider'); } }));
import { isBuildRequest } from '../core/intelligence/intent-classifier';

describe('unaccented leading Arabic construction imperative', () => {
    test.each([
        ['اعمل لي أداة تحسب إيقاع القصيدة العربية', true],
        ['اعمل لي موقعا عن الحدائق', true],
        ['اِعْمَل لي صفحة عن الفضاء', true],
        ['أعمل لي أداة لتحويل الوحدات', true],
        ['لماذا اعمل موقعا؟', false],
        ['هل اعمل تطبيقا؟', false],
        ['لا اعمل موقعا', false],
        ['اشرح العبارة "اعمل لي صفحة" ولا تنشئ ملفات', false],
    ])('%s', (goal, expected) => expect(isBuildRequest(goal as string).isBuild).toBe(expected));
});
