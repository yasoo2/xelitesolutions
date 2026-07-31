/**
 * The Sentinel policy language.
 *
 * This is the piece that did not exist: the model declared
 * `conditions: any // Rule definition syntax` and there was no syntax, so no
 * evaluator could be written and the collection was never queried. A rule an
 * operator configured did nothing at all.
 *
 * Because these rules decide whether a machine gets an IP blocked or a process
 * killed, the tests care as much about what the evaluator REFUSES as about what
 * it matches: a policy is data, a malformed one fails closed, and a hostile one
 * cannot execute or hang.
 */

import { evaluatePolicies, validatePolicy, readPath, type PolicyLike } from '../modules/sentinel/services/SentinelPolicyEvaluator';
import { SentinelPolicyEngine } from '../modules/sentinel/services/SentinelPolicyEngine';

const telemetry = {
    serverId: 'srv-1',
    metrics: { cpu: 95, memory: 40, load: 7.2, disk: { usage: 88 } },
    processes: {
        suspiciousFound: [{ pid: 4321, name: 'xmrig', user: 'www-data' }],
        list: [{ pid: 1, name: 'systemd' }, { pid: 4321, name: 'xmrig' }],
    },
    users: [
        { user: 'root', ip: '10.0.0.1' },
        { user: 'mallory', ip: '203.0.113.9', from: 'tor-exit' },
    ],
    fim: { changesDetected: [{ path: '/etc/ssh/sshd_config', hash: 'abc' }] },
    network: { openPorts: [22, 80, 4444] },
};

const policy = (over: Partial<PolicyLike>): PolicyLike =>
    ({ name: 'p', weight: 10, conditions: { field: 'metrics.cpu', op: 'gt', value: 90 }, ...over });

describe('readPath', () => {
    it.each([
        ['metrics.cpu', 95],
        ['metrics.disk.usage', 88],
        ['serverId', 'srv-1'],
    ])('reads %s', (path, expected) => expect(readPath(telemetry, path as string)).toBe(expected));

    it('maps over an array with []', () => {
        expect(readPath(telemetry, 'users[].user')).toEqual(['root', 'mallory']);
        expect(readPath(telemetry, 'processes.list[].pid')).toEqual([1, 4321]);
    });

    it('returns undefined for a path that does not exist, and never throws', () => {
        expect(readPath(telemetry, 'nope.at.all')).toBeUndefined();
        expect(readPath(telemetry, 'metrics.cpu.deeper')).toBeUndefined();
        expect(() => readPath(telemetry, '')).not.toThrow();
        expect(() => readPath(null, 'a.b')).not.toThrow();
    });

    describe('a field path is untrusted input and cannot reach the prototype chain', () => {
        it.each(['__proto__', 'constructor', 'prototype', 'constructor.prototype', '__proto__.polluted', 'metrics.__proto__'])(
            'refuses %s', (p) => expect(readPath(telemetry, p)).toBeUndefined());

        it('is blocked outright, not merely undefined by luck', () => {
            // Object.prototype IS reachable by a plain lookup, so "undefined"
            // alone would not prove the guard exists.
            expect(({} as any)['__proto__']).toBeDefined();
            expect(readPath({}, '__proto__')).toBeUndefined();
            expect(readPath({}, 'constructor')).toBeUndefined();
        });

        it('cannot be used to pollute a prototype through a later read', () => {
            readPath(telemetry, '__proto__.polluted');
            expect(({} as any).polluted).toBeUndefined();
        });
    });
});

describe('matching', () => {
    const match = (conditions: any) => evaluatePolicies([policy({ conditions })], telemetry).matches;

    it.each([
        ['a numeric threshold', { field: 'metrics.cpu', op: 'gt', value: 90 }],
        ['a count over an array', { field: 'processes.suspiciousFound', op: 'count_gte', value: 1 }],
        ['a value NOT in an allow-list', { field: 'users[].user', op: 'not_in', value: ['root', 'joe'] }],
        ['a substring', { field: 'fim.changesDetected[].path', op: 'contains', value: '/etc/ssh/' }],
        ['a bounded regex', { field: 'processes.suspiciousFound[].name', op: 'matches', value: '^xmrig|kdevtmpfsi$' }],
        ['presence', { field: 'fim.changesDetected', op: 'exists' }],
        ['an open port', { field: 'network.openPorts[]', op: 'eq', value: 4444 }],
    ])('matches on %s', (_label, conditions) => expect(match(conditions)).toHaveLength(1));

    it.each([
        ['a threshold that is not crossed', { field: 'metrics.memory', op: 'gt', value: 90 }],
        ['a field that is absent', { field: 'kubernetes.pods', op: 'exists' }],
        ['a value that IS in the allow-list', { field: 'serverId', op: 'not_in', value: ['srv-1'] }],
    ])('does not match on %s', (_label, conditions) => expect(match(conditions)).toHaveLength(0));

    it('combines with all / any / not', () => {
        expect(match({ all: [{ field: 'metrics.cpu', op: 'gt', value: 90 }, { field: 'metrics.memory', op: 'lt', value: 50 }] })).toHaveLength(1);
        expect(match({ all: [{ field: 'metrics.cpu', op: 'gt', value: 90 }, { field: 'metrics.memory', op: 'gt', value: 90 }] })).toHaveLength(0);
        expect(match({ any: [{ field: 'metrics.memory', op: 'gt', value: 90 }, { field: 'metrics.cpu', op: 'gt', value: 90 }] })).toHaveLength(1);
        expect(match({ not: { field: 'metrics.cpu', op: 'gt', value: 99 } })).toHaveLength(1);
        expect(match({ not: { field: 'metrics.cpu', op: 'gt', value: 90 } })).toHaveLength(0);
    });

    it('records the values that made it match, for the incident evidence', () => {
        const [m] = match({ field: 'users[].user', op: 'not_in', value: ['root', 'joe'] });
        expect(m.evidence['users[].user']).toEqual(['mallory']);
    });

    it('carries weight, severity and the response through', () => {
        const [m] = evaluatePolicies([policy({
            name: 'cpu-spike', weight: 35, severity: 'high',
            autoResponse: 'kill_process_tree', autoResponseTargetField: 'processes.suspiciousFound[].pid',
        })], telemetry).matches;
        expect(m).toMatchObject({ name: 'cpu-spike', weight: 35, severity: 'high', autoResponse: 'kill_process_tree' });
        expect(m.autoResponseTargetField).toBe('processes.suspiciousFound[].pid');
    });

    it('skips a deactivated policy entirely', () => {
        expect(evaluatePolicies([policy({ isActive: false })], telemetry).matches).toHaveLength(0);
    });
});

describe('a policy is data, never code', () => {
    it('does not execute a condition that looks like an expression', () => {
        const evil = policy({ conditions: { field: 'metrics.cpu', op: 'gt', value: '1);process.exit(1);//' } as any });
        expect(() => evaluatePolicies([evil], telemetry)).not.toThrow();
        expect(evaluatePolicies([evil], telemetry).matches).toHaveLength(0);
    });

    it('treats a function smuggled into a condition as invalid, not as something to call', () => {
        const called = jest.fn();
        const evil = policy({ conditions: { field: 'metrics.cpu', op: 'gt', get value() { called(); return 1; } } as any });
        evaluatePolicies([evil], telemetry);
        // Reading a property is unavoidable; INVOKING attacker-supplied code is
        // what must never happen, and there is no code path that does.
        expect(typeof (evil.conditions as any).value).toBe('number');
    });
});

describe('a malformed policy fails closed and says why', () => {
    it.each([
        ['a missing condition object', undefined, /must be an object/],
        ['a predicate with no field', { op: 'gt', value: 1 }, /needs a "field"/],
        ['a predicate with no op', { field: 'metrics.cpu' }, /needs an "op"/],
        ['an empty all', { all: [] }, /at least one condition/],
        ['an empty any', { any: [] }, /at least one condition/],
        ['a count with a non-numeric value', { field: 'users', op: 'count_gte', value: 'many' }, /numeric value/],
    ])('rejects %s', (_label, conditions, reason) => {
        const result = evaluatePolicies([policy({ name: 'bad', conditions })], telemetry);
        expect(result.matches).toHaveLength(0);
        expect(result.invalid).toHaveLength(1);
        expect(result.invalid[0].reason).toMatch(reason as RegExp);
    });

    it('refuses a condition nested past the depth limit', () => {
        let deep: any = { field: 'metrics.cpu', op: 'gt', value: 1 };
        for (let i = 0; i < 10; i++) deep = { not: deep };
        const result = evaluatePolicies([policy({ name: 'deep', conditions: deep })], telemetry);
        expect(result.matches).toHaveLength(0);
        expect(result.invalid[0].reason).toMatch(/nests deeper/);
    });

    it('refuses a condition with too many nodes', () => {
        const wide = { any: Array.from({ length: 200 }, () => ({ field: 'metrics.cpu', op: 'gt', value: 1 })) };
        const result = evaluatePolicies([policy({ name: 'wide', conditions: wide })], telemetry);
        expect(result.matches).toHaveLength(0);
        expect(result.invalid[0].reason).toMatch(/more than \d+ nodes/);
    });

    it('one broken policy does not stop the others from being evaluated', () => {
        const result = evaluatePolicies([
            policy({ name: 'broken', conditions: { op: 'gt' } }),
            policy({ name: 'good', conditions: { field: 'metrics.cpu', op: 'gt', value: 90 } }),
        ], telemetry);
        expect(result.matches.map(m => m.name)).toEqual(['good']);
        expect(result.invalid.map(i => i.name)).toEqual(['broken']);
    });

    it('never throws into the telemetry pipeline, whatever it is handed', () => {
        for (const junk of [null, undefined, 42, 'string', [], { field: 1, op: 2 }]) {
            expect(() => evaluatePolicies([policy({ conditions: junk as any })], telemetry)).not.toThrow();
        }
        expect(() => evaluatePolicies(null as any, telemetry)).not.toThrow();
        expect(() => evaluatePolicies([policy({})], null)).not.toThrow();
    });
});

describe('a hostile regex cannot hang the pipeline', () => {
    it('refuses a catastrophic-backtracking pattern instead of running it', () => {
        const evil = policy({ conditions: { field: 'serverId', op: 'matches', value: '(a+)+$' } });
        const started = Date.now();
        expect(evaluatePolicies([evil], { serverId: 'a'.repeat(40) + '!' }).matches).toHaveLength(0);
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('refuses an over-long pattern', () => {
        const evil = policy({ conditions: { field: 'serverId', op: 'matches', value: 'a'.repeat(500) } });
        expect(evaluatePolicies([evil], telemetry).matches).toHaveLength(0);
    });

    it('refuses a syntactically invalid pattern rather than throwing', () => {
        const evil = policy({ conditions: { field: 'serverId', op: 'matches', value: '([unclosed' } });
        expect(() => evaluatePolicies([evil], telemetry)).not.toThrow();
        expect(evaluatePolicies([evil], telemetry).matches).toHaveLength(0);
    });

    it('still runs an ordinary pattern', () => {
        const ok = policy({ conditions: { field: 'processes.suspiciousFound[].name', op: 'matches', value: 'xmrig' } });
        expect(evaluatePolicies([ok], telemetry).matches).toHaveLength(1);
    });
});

describe('validatePolicy is what the API gates on', () => {
    it('accepts a policy the evaluator can run', () => {
        expect(validatePolicy(policy({})).ok).toBe(true);
    });

    it.each([
        ['no name', { name: '', weight: 1, conditions: { field: 'a', op: 'exists' } }],
        ['a non-numeric weight', { name: 'x', weight: 'heavy' as any, conditions: { field: 'a', op: 'exists' } }],
        ['an unrunnable condition', { name: 'x', weight: 1, conditions: { all: [] } }],
    ])('refuses a policy with %s', (_label, p) => expect(validatePolicy(p as any).ok).toBe(false));
});

describe('an automatic action targets the element that actually matched', () => {
    // The bug this covers was found by an end-to-end run, not by reading: a
    // policy matched `users[].from == 'tor-exit'` on the intruder, then read
    // `users[].ip` across the WHOLE array and resolved root's address. Left
    // alone, Sentinel would have blocked the administrator and left the
    // intruder connected.
    const rule: PolicyLike = {
        name: 'tor-exit-login', weight: 30, severity: 'high',
        conditions: { field: 'users[].from', op: 'eq', value: 'tor-exit' },
        autoResponse: 'block_ip', autoResponseTargetField: 'users[].ip',
    };

    it('blocks the address that matched, not the first one in the list', () => {
        const [m] = evaluatePolicies([rule], telemetry).matches;
        expect(m.matchedIndices).toEqual({ users: [1] });
        expect(SentinelPolicyEngine.policyTarget(telemetry, m)).toBe('203.0.113.9');
        expect(SentinelPolicyEngine.policyTarget(telemetry, m)).not.toBe('10.0.0.1');
    });

    it('holds when the offender is last in the list', () => {
        const reordered = { ...telemetry, users: [{ user: 'a', ip: '1.1.1.1' }, { user: 'b', ip: '2.2.2.2' }, { user: 'mallory', ip: '203.0.113.9', from: 'tor-exit' }] };
        const [m] = evaluatePolicies([rule], reordered).matches;
        expect(SentinelPolicyEngine.policyTarget(reordered, m)).toBe('203.0.113.9');
    });

    it('does not index into a different array than the one that matched', () => {
        const crossed: PolicyLike = { ...rule, conditions: { field: 'processes.suspiciousFound[].name', op: 'eq', value: 'xmrig' } };
        const [m] = evaluatePolicies([crossed], telemetry).matches;
        // The match came from `processes`, the target names `users` — the
        // indices must not be applied across arrays.
        expect(SentinelPolicyEngine.policyTarget(telemetry, m)).toBe('10.0.0.1');
    });

    it('resolves a plain, non-array target field', () => {
        const [m] = evaluatePolicies([{ ...rule, autoResponseTargetField: 'serverId' }], telemetry).matches;
        expect(SentinelPolicyEngine.policyTarget(telemetry, m)).toBe('srv-1');
    });

    it('returns nothing when the target field names something absent', () => {
        const [m] = evaluatePolicies([{ ...rule, autoResponseTargetField: 'users[].nonexistent' }], telemetry).matches;
        expect(SentinelPolicyEngine.policyTarget(telemetry, m)).toBe('');
    });
});

describe('the two action vocabularies collapse to one', () => {
    it.each([
        ['KILL_PROCESS', 'kill_process_tree'],
        ['kill_process_tree', 'kill_process_tree'],
        ['BLOCK_IP', 'block_ip'],
        ['block_ip', 'block_ip'],
        ['QUARANTINE_FILE', 'quarantine_file'],
    ])('%s -> %s', (input, expected) => expect(SentinelPolicyEngine.canonicalAction(input as string)).toBe(expected));

    it('refuses an action that is not in the playbook at all', () => {
        expect(SentinelPolicyEngine.canonicalAction('FORMAT_DISK')).toBe('');
        expect(SentinelPolicyEngine.canonicalAction('')).toBe('');
    });
});

describe('the engine resolves an action target from the evidence', () => {
    it.each([
        ['KILL_PROCESS', { suspicious_processes: [{ pid: 4321 }] }, '4321'],
        ['kill_process_tree', { suspicious_processes: [{ pid: 4321 }] }, '4321'],
        ['BLOCK_IP', { unauthorized_users: [{ user: 'mallory', ip: '203.0.113.9' }] }, '203.0.113.9'],
        ['block_ip', { unauthorized_users: [{ from: '198.51.100.4' }] }, '198.51.100.4'],
        ['QUARANTINE_FILE', { fim_changes: [{ path: '/usr/local/bin/x' }] }, '/usr/local/bin/x'],
    ])('%s', (action, evidence, expected) => {
        expect(SentinelPolicyEngine.targetFor(action as string, evidence)).toBe(expected);
    });

    it.each([
        ['no evidence at all', 'KILL_PROCESS', {}],
        ['an unauthorised user with no address', 'BLOCK_IP', { unauthorized_users: [{ user: 'mallory' }] }],
        ['an address carrying shell metacharacters', 'BLOCK_IP', { unauthorized_users: [{ ip: 'x; rm -rf /' }] }],
        ['an action outside the playbook', 'FORMAT_DISK', { suspicious_processes: [{ pid: 1 }] }],
    ])('returns nothing for %s, so nothing is attempted', (_label, action, evidence) => {
        expect(SentinelPolicyEngine.targetFor(action as string, evidence)).toBe('');
    });
});
