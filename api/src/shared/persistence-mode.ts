export type PersistenceMode = 'JSON' | 'MONGO';

export function resolvePersistenceMode(env: NodeJS.ProcessEnv = process.env): PersistenceMode {
  const explicit = String(env.PERSISTENCE_MODE || '').trim().toUpperCase();
  if (explicit === 'JSON' || explicit === 'MONGO') return explicit;

  const environment = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const hasMongoUri = Boolean(String(env.MONGO_URI || '').trim());
  return environment !== 'production' && !hasMongoUri ? 'JSON' : 'MONGO';
}

export function applyPersistenceModeDefault(env: NodeJS.ProcessEnv = process.env): PersistenceMode {
  const mode = resolvePersistenceMode(env);
  env.PERSISTENCE_MODE = mode;
  return mode;
}
