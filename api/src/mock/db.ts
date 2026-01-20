import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Role = 'OWNER' | 'ADMIN' | 'USER';
interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  name?: string;
  picture?: string;
}

const dbPath = process.env.MOCK_DB_PATH || path.join(os.tmpdir(), 'joe-mock-db.json');

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

let users: MockUser[] = [];

function loadFromDisk() {
  try {
    if (!fs.existsSync(dbPath)) return;
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = safeParseJson<{ users?: MockUser[] }>(raw);
    if (!parsed || !Array.isArray(parsed.users)) return;
    users = parsed.users
      .filter((u) => u && typeof u.id === 'string' && typeof u.email === 'string' && typeof u.passwordHash === 'string' && typeof u.role === 'string')
      .map((u) => ({ ...u, email: normalizeEmail(u.email) })) as MockUser[];
  } catch {
  }
}

function saveToDisk() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify({ users }, null, 2), 'utf8');
  } catch {
  }
}

loadFromDisk();

export const mockDb = {
  findUserByEmail(email: string) {
    const e = normalizeEmail(email);
    return users.find(u => u.email === e) || null;
  },
  createUser(email: string, passwordHash: string, role: Role) {
    const id = String(users.length + 1);
    const u = { id, email: normalizeEmail(email), passwordHash, role };
    users.push(u);
    saveToDisk();
    return u;
  },
  countUsers() {
    return users.length;
  }
};
