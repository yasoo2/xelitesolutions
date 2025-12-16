type Role = 'OWNER' | 'ADMIN' | 'USER';
interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
}

const users: MockUser[] = [];

export const mockDb = {
  findUserByEmail(email: string) {
    return users.find(u => u.email === email) || null;
  },
  createUser(email: string, passwordHash: string, role: Role) {
    const id = String(users.length + 1);
    const u = { id, email, passwordHash, role };
    users.push(u);
    return u;
  }
};
