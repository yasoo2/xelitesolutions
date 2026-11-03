jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: () => { throw new Error('Inference forbidden in structural test'); } }));
import { isKnowledgeQuestionStructural } from '../core/intelligence/intent-classifier';
describe('yes/no information versus explicit action', () => {
    test.each<[string, boolean]>([
        ['Is Python a programming language? Reply with one English word.', true],
        ['Are React and Vue JavaScript libraries? Reply briefly.', true],
        ['Does SQLite store data on disk? Answer in one sentence.', true],
        ['Is a variable mutable? Write one English word.', true],
        ['Do arrays preserve insertion order? Answer briefly.', true],
        ['Was Java designed before Rust? Reply briefly.', true],
        ['Can a browser run JavaScript? Reply briefly.', true],
        ['What is the difference between Python and Java?', true],
        ['هل Python لغة برمجة؟ أجب باختصار.', true],
        ['Is Python a language? I need an app.', false],
        ['Can you build me a website? Write one word.', false],
        ['Is Python a language? Write one English word to report.md.', false],
        ['Run Python code that prints 2.', false],
        ['Create a SQLite database with a users table.', false],
        ['Run Python code containing the string "Is Python a language?".', false],
        ['Build a React application.', false],
        ['Is Python a language? Create a SQLite database with a users table.', false],
        ['Is Python a language? Run this script.', false],
        ['Is Python a language? Write report.md.', false],
        ['Can you build me a website?', false],
        ['Could you create an app?', false],
        ['Is Python a language? Do not execute anything. Reply only.', true],
        ['Is Python a language? Explain what the word run means.', true],
        ['Is Python a programming language? Save the answer to report.md.', false],
        ['Is Python a language? احذف ملف report.md.', false],
        ['Is Python a language? Answer briefly, export report.md.', false],
        ['Is Python a language? Answer briefly: append to report.md.', false],
        ['Can you run Python? Reply briefly.', false],
        ['Do a security scan? Reply briefly.', false],
        ['Am I using a programming language? Reply briefly.', true],
        ["Isn't Python a programming language? Reply briefly.", true],
        ["Don't arrays preserve order? Reply briefly.", true],
    ])('%s -> knowledge=%s', (request, expected) => {
        expect(isKnowledgeQuestionStructural(request)).toBe(expected);
    });
});
