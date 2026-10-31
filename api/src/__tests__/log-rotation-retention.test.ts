import fs from 'fs';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { logRotationPolicy } from '../shared/utils/log-rotation-policy';

describe('retained verification logs', () => {
    it.each(['development', 'production', 'testing', 'TEST', undefined])(
        'preserves ordinary application archive and retention for %s', mode => {
            expect(logRotationPolicy(mode)).toEqual({ zippedArchive: true, maxFiles: '14d' });
        },
    );

    it('preserves written raw files through actual size and time rotation without deletion', async () => {
        const ownedRoot = process.env.JOE_FILE_TEST_ROOT;
        if (!ownedRoot || !path.isAbsolute(ownedRoot)) throw Error('Explicit retained fixture root required');
        const directory = fs.mkdtempSync(path.join(ownedRoot, 'log-rotation-'));
        const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
            throw Error('TEST_DELETE_NOT_AUTHORIZED');
        });
        const transport = new DailyRotateFile({
            filename: path.join(directory, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD-HH-mm-ss',
            maxSize: '1k',
            ...logRotationPolicy('test'),
        });
        const closeTransport = transport.close;
        if (typeof closeTransport !== 'function') throw Error('Real rotation transport must expose close');
        const failures: Error[] = [];
        transport.on('error', error => failures.push(error));
        const sink = winston.createLogger({ format: winston.format.json(), transports: [transport] });
        try {
            for (let index = 0; index < 5; index++) sink.info(`before-${index}:${'x'.repeat(700)}`);
            await new Promise<void>(resolve => setTimeout(resolve, 1_100));
            sink.info('after-time-boundary');
            await new Promise<void>(resolve => sink.end(resolve));
            closeTransport.call(transport);
            await new Promise<void>(resolve => setTimeout(resolve, 40));
            const files = fs.readdirSync(directory);
            const raw = files.filter(file => /\.log(?:\.\d+)?$/u.test(file));
            expect(raw.length).toBeGreaterThan(1);
            expect(new Set(raw.map(file => file.replace(/\.log.*$/u, ''))).size).toBeGreaterThan(1);
            expect(files.some(file => file.endsWith('.gz'))).toBe(false);
            expect(files.some(file => file.includes('audit'))).toBe(false);
            const all = raw.map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
            for (let index = 0; index < 5; index++) expect(all).toContain(`before-${index}:`);
            expect(all).toContain('after-time-boundary');
            expect(failures).toEqual([]);
            expect(unlink).not.toHaveBeenCalled();
        } finally {
            closeTransport.call(transport);
            unlink.mockRestore();
        }
        // All written files remain in the explicitly retained fixture root.
    });
});
