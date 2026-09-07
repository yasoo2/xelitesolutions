import fs from 'fs';
import path from 'path';
import { localDevelopmentBrowserUser } from '../api/ws';
import { config } from '../shared/config';

const source = fs.readFileSync(path.resolve(__dirname, '../api/ws.ts'), 'utf8');

describe('local guest browser panel', () => {
  it('permits the local guest workspace only through a loopback development socket', () => {
    const previousEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
        expect(localDevelopmentBrowserUser({ socket: { remoteAddress } } as any)).toBe(config.localUserId);
      }
      for (const remoteAddress of ['192.168.1.2', '203.0.113.2', undefined]) {
        expect(localDevelopmentBrowserUser({ socket: { remoteAddress } } as any)).toBe('');
      }
      process.env.NODE_ENV = 'production';
      expect(localDevelopmentBrowserUser({ socket: { remoteAddress: '127.0.0.1' } } as any)).toBe('');
    } finally {
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }
  });

  it('keeps token validation mandatory outside that narrowly-scoped local path', () => {
    expect(source).toContain('Browser upgrade rejected: Invalid token');
    expect(source).toContain('jwt.verify(token, config.jwtSecret)');
  });
});
