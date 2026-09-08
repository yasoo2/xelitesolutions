import { applyPersistenceModeDefault, resolvePersistenceMode } from '../shared/persistence-mode';

describe('persistence mode selection', () => {
  test('uses durable local JSON storage when development has no Mongo configuration', () => {
    expect(resolvePersistenceMode({ NODE_ENV: 'development' })).toBe('JSON');
    expect(resolvePersistenceMode({})).toBe('JSON');
  });

  test('honors an explicit persistence mode regardless of environment', () => {
    expect(resolvePersistenceMode({ NODE_ENV: 'development', PERSISTENCE_MODE: 'mongo' })).toBe('MONGO');
    expect(resolvePersistenceMode({ NODE_ENV: 'production', PERSISTENCE_MODE: 'json' })).toBe('JSON');
  });

  test('selects Mongo when configured or when running in production', () => {
    expect(resolvePersistenceMode({ NODE_ENV: 'development', MONGO_URI: 'mongodb://localhost/joe' })).toBe('MONGO');
    expect(resolvePersistenceMode({ NODE_ENV: 'production' })).toBe('MONGO');
  });

  test('writes the normalized default for modules that read process.env directly', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
    expect(applyPersistenceModeDefault(env)).toBe('JSON');
    expect(env.PERSISTENCE_MODE).toBe('JSON');
  });
});
