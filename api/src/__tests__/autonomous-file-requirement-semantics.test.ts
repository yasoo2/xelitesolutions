import fs from 'fs';
import path from 'path';
import { snapshotAutonomousFileInput, validateAutonomousFileOperation } from '../modules/services/AutonomousFilePolicy';

const base = 'D:/Joe/coordination/verification-audits/team-recovery-20261008/capability-development-v1/scoped-discovery-evidence-v1/requirement-secret-semantics-v1';
function physical(value: string, name = 'requirements.md') {
    const root = fs.mkdtempSync(path.join(base, 'policy-fixture-')), target = path.join(root, name);
    fs.writeFileSync(target, value); return () => validateAutonomousFileOperation('read_file', { path: target }, root, base);
}
test.each([
    'Password: minimum eight characters',
    '- Password: at least 12 characters.',
    'Password requirements: maximum 64 characters',
    '{"type":"object","properties":{"password":{"type":"string","minLength":8}}}',
    '{"type":"object","properties":{"password":{"type":"string","description":"Password: minimum eight characters"}}}',
    '{"fields":[{"label":"Password: minimum eight characters","name":"password"}]}',
])('ordinary requirement/schema/UI metadata crosses actual physical guard: %s', value => {
    expect(physical(value)).not.toThrow();
});
test.each([
    'password=syntheticvalue', 'Password: "minimum eight characters"', 'password=minimum eight characters',
    'password: hunter2', 'password: minimum eight characters; use hunter2',
    '```yaml\npassword: minimum eight characters\n```', '~~~yaml\npassword: minimum eight characters\n~~~',
    '~~~yaml\n```\npassword: minimum eight characters\n~~~', '    password: minimum eight characters',
    '{"password":"syntheticvalue","label":"Password: minimum eight characters"}',
    '{"properties":{"password":{"type":"string","default":"syntheticvalue"}}}',
    '{"properties":{"password":{"type":"string","const":"syntheticvalue"}}}',
    '{"properties":{"password":{"type":"string","enum":["syntheticvalue"]}}}',
    'secret=syntheticvalue', 'access_token=syntheticvalue', 'api_key=syntheticvalue',
    'sk-synthetickey12345', 'ghp_synthetickey12345', 'nvapi-synthetickey12345',
    '-----BEGIN PRIVATE KEY-----\nsynthetic', 'x\0y',
])('literal/ambiguous secret remains physically blocked: %s', value => { expect(physical(value)).toThrow(); });
test.each(['.env', '.env.local', 'secret.key', 'credentials.txt'])('sensitive filename remains blocked even for a harmless requirement: %s', name => {
    expect(physical('Password: minimum eight characters', name)).toThrow('sensitive_or_invalid_path');
});
test('input guards preserve non-data rejection and workspace bounds', () => {
    const getter = jest.fn(() => 'Password: minimum eight characters');
    expect(() => snapshotAutonomousFileInput('write_file', Object.defineProperty({ path: 'requirements.md' }, 'content', { enumerable: true, get: getter }))).toThrow('invalid_file_input');
    expect(getter).not.toHaveBeenCalled();
    const root = fs.mkdtempSync(path.join(base, 'foreign-fixture-'));
    expect(() => validateAutonomousFileOperation('read_file', { path: path.join(base, 'foreign.md') }, root, base)).toThrow('path_outside_workspace');
});
test.each(['settings.yaml', 'settings.yml', 'settings.json', 'settings.ts'])('the requirement grammar never exempts an ambiguous credential assignment in a configuration/code file: %s', name => {
    expect(physical('password: minimum eight characters', name)).toThrow('sensitive_or_binary_file');
});
test('malformed non-secret JSON-like source retains the existing ordinary text contract', () => {
    expect(physical('{ ordinary non-secret block }')).not.toThrow();
});
test('whole-file physical provenance retains a fence opened before page1000', () => {
    const source = '```yaml\n' + '\n'.repeat(1000) + 'password: minimum eight characters\n```';
    expect(physical(source)).toThrow('sensitive_or_binary_file');
});
test.each([
    '{"label":"sk-\\u0073ynthetickey12345"}',
    '{"title":"-----BEGIN \\u0050RIVATE KEY-----"}',
    '{"description":"ghp_\\u0073ynthetickey12345"}',
    '{"placeholder":"nvapi-\\u0073ynthetickey12345"}',
    '{"label":"x\\u0000y"}',
    '{"sk-\\u0073ynthetickey12345":"ordinary field"}',
    '{"label":"ordinary","password":"\\u0073yntheticvalue"}',
    '{"description":"Bearer \\u0073yntheticvalue12345"}',
    '{"title":"OPENAI_API_KEY=\\u0073yntheticvalue12345"}',
])('decoded JSON keys/metadata/values retain all intrinsic secret protections: %s', value => {
    expect(physical(value)).toThrow('sensitive_or_binary_file');
});
test('decoded ordinary schema requirement stays readable without rewriting source bytes', () => {
    expect(physical('{"description":"Password: minimum \\u0065ight characters","properties":{"password":{"type":"string","minLength":8}}}')).not.toThrow();
});
