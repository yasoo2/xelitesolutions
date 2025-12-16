"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockDb = void 0;
const users = [];
exports.mockDb = {
    findUserByEmail(email) {
        return users.find(u => u.email === email) || null;
    },
    createUser(email, passwordHash, role) {
        const id = String(users.length + 1);
        const u = { id, email, passwordHash, role };
        users.push(u);
        return u;
    }
};
