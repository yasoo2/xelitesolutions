export {};

type StartupFixture = {
    name: string;
    env: Record<string, string>;
    timerCount: number;
};

const startupFixtures: StartupFixture[] = [
    { name: 'development', env: { NODE_ENV: 'development' }, timerCount: 0 },
    { name: 'test', env: { NODE_ENV: 'test' }, timerCount: 0 },
    { name: 'JSON persistence', env: { PERSISTENCE_MODE: 'JSON' }, timerCount: 0 },
    { name: 'MOCK_DB=1', env: { MOCK_DB: '1' }, timerCount: 0 },
    { name: 'MOCK_DB=true', env: { MOCK_DB: 'true' }, timerCount: 0 },
    { name: 'auth-bypass local mode', env: { ENABLE_AUTH_BYPASS: 'true' }, timerCount: 0 },
    { name: 'explicit auto-deploy disabled', env: { DISABLE_AUTO_DEPLOY: '1' }, timerCount: 0 },
    { name: 'production poller enabled', env: {}, timerCount: 1 },
];

const startupCases = startupFixtures.flatMap(fixture =>
    ['async-success', 'async-rejection'].map(transport => ({ ...fixture, transport })),
);

describe('DeployManager startup preserves Git ownership trust', () => {
    it.each(startupCases)('$name / $transport', async fixture => {
        const savedEnvironment = process.env;
        const savedFetch = global.fetch;
        const forbiddenEffects: string[] = [];
        const commands: string[] = [];
        const unhandled: unknown[] = [];
        const deny = (name: string) => (..._args: unknown[]) => {
            forbiddenEffects.push(name);
            throw new Error(`unexpected_startup_effect:${name}`);
        };
        const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
        const rejectProperties = (prefix: string) => new Proxy({}, {
            get: (_target, property) => deny(`${prefix}.${String(property)}`),
        });
        const fsPromises = rejectProperties('fs.promises');
        const fsBoundary = new Proxy({}, {
            get: (_target, property) => {
                if (property === 'promises') return fsPromises;
                return deny(`fs.${String(property)}`)();
            },
        });
        const mockFs = new Proxy({}, {
            get: (_target, property) => {
                if (property === '__esModule') return true;
                if (property === 'default') return fsBoundary;
                if (property === 'promises') return fsPromises;
                return deny(`fs.${String(property)}`)();
            },
        });
        const execute = jest.fn(async (request: any) => {
            const command = String(request?.payload?.command || '');
            commands.push(command);
            if (!/^git config --global (?:--replace-all|--add) safe\.directory /.test(command)) {
                return deny('unexpected gateway command')();
            }
            // The old constructor's writes proceed asynchronously through the
            // real runCommand body, but this terminal mock never runs a command.
            await Promise.resolve();
            return fixture.transport === 'async-success'
                ? { success: true, data: { ok: true, output: '' } }
                : { success: false, error: 'synthetic_gateway_rejection' };
        });
        const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

        jest.resetModules();
        jest.useFakeTimers();
        const cwd = jest.spyOn(process, 'cwd').mockReturnValue('C:/synthetic-joe-startup/api');
        process.env = {
            NODE_ENV: 'production', PERSISTENCE_MODE: 'MONGO', MOCK_DB: '0',
            ENABLE_AUTH_BYPASS: 'false', DISABLE_AUTO_DEPLOY: '0',
            DEPLOY_POLL_INTERVAL_MS: '12000', PROJECT_ROOT: 'C:/synthetic-joe-startup',
            PATH: 'C:/synthetic-bin', ...fixture.env,
        };
        global.fetch = deny('fetch') as typeof fetch;
        process.on('unhandledRejection', onUnhandled);
        try {
            jest.doMock('../kernel/ExecutionGateway', () => ({ ExecutionGateway: { execute } }));
            jest.doMock('mongoose', () => ({ __esModule: true, default: { connection: { readyState: 1 } } }));
            jest.doMock('os', () => ({ __esModule: true, default: rejectProperties('os') }));
            jest.doMock('../shared/models/deployment', () => ({ Deployment: rejectProperties('DB') }));
            jest.doMock('../shared/utils/logger', () => ({ logger: logs }));
            jest.doMock('../api/ws', () => ({ broadcast: deny('broadcast') }));
            jest.doMock('axios', () => ({ __esModule: true, default: rejectProperties('axios') }));
            jest.doMock('../modules/services/AlertService', () => ({ alertService: rejectProperties('alerts') }));
            jest.doMock('fs', () => mockFs);
            jest.doMock('node:fs', () => mockFs);
            jest.doMock('fs/promises', () => fsPromises);
            jest.doMock('node:fs/promises', () => fsPromises);
            jest.doMock('../kernel/ExecutionEngine', () => ({ executionEngine: rejectProperties('executionEngine') }));
            jest.doMock('../orchestration/AgentExecutionFirewall', () => ({
                executionFirewall: { runAsSystem: async (operation: () => unknown) => operation() },
            }));
            jest.doMock('../core/deploy/deployment-safety', () => ({
                assessAutoUpdateSafety: deny('deployment safety evaluation'),
                parseAheadCount: deny('deployment parse'),
            }));
            jest.doMock('child_process', () => rejectProperties('child_process'));
            jest.doMock('node:child_process', () => rejectProperties('child_process'));
            jest.doMock('http', () => rejectProperties('http'));
            jest.doMock('https', () => rejectProperties('https'));
            jest.doMock('net', () => rejectProperties('net'));
            jest.doMock('tls', () => rejectProperties('tls'));
            jest.doMock('dns', () => rejectProperties('dns'));

            const { DeployManager, deployManager } = require('../modules/services/DeployManager');
            // Drain the three old sequential asynchronous requests, including
            // their rejection handlers. Never advance a poller timer.
            for (let turn = 0; turn < 32; turn++) await Promise.resolve();
            const initialTimers = jest.getTimerCount();
            expect(DeployManager.getInstance()).toBe(deployManager);
            expect(DeployManager.getInstance()).toBe(deployManager);
            expect(jest.getTimerCount()).toBe(fixture.timerCount);
            expect(deployManager.getPollerStatus()).toMatchObject({
                pollerEnabled: true, pollerActive: false, pollCount: 0,
                lastPollTime: null, isDeploying: false, intervalMs: 12000,
            });
            deployManager.enableAutoDeployPoller();
            expect(jest.getTimerCount()).toBe(fixture.timerCount);
            deployManager.stopAutoDeployPoller();
            expect(jest.getTimerCount()).toBe(0);
            expect(deployManager.getPollerStatus().pollerEnabled).toBe(false);
            deployManager.enableAutoDeployPoller();
            deployManager.enableAutoDeployPoller();
            expect(jest.getTimerCount()).toBe(fixture.timerCount);
            expect(deployManager.getPollerStatus().pollerEnabled).toBe(true);
            deployManager.stopAutoDeployPoller();
            for (let turn = 0; turn < 32; turn++) await Promise.resolve();

            console.info('DEPLOY_STARTUP_WITNESS', JSON.stringify({
                fixture: fixture.name, transport: fixture.transport, commands,
                initialTimers, finalTimers: jest.getTimerCount(),
                warningCount: logs.warn.mock.calls.length,
                forbiddenEffects, unhandled: unhandled.length,
            }));
            expect(forbiddenEffects).toEqual([]);
            expect(unhandled).toEqual([]);
            expect(jest.getTimerCount()).toBe(0);
            expect(commands).toEqual([]);
            expect(execute).not.toHaveBeenCalled();
        } finally {
            process.removeListener('unhandledRejection', onUnhandled);
            process.env = savedEnvironment;
            global.fetch = savedFetch;
            cwd.mockRestore();
            jest.clearAllTimers();
            jest.useRealTimers();
            jest.restoreAllMocks();
            jest.resetModules();
        }
    });
});
