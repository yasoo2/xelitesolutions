import mongoose, { Schema, Document } from 'mongoose';
import { JsonStore } from '../lib/jsondb';

export interface IUser extends Document {
  email: string;
  name?: string;
  picture?: string;
  passwordHash: string;
  role: 'OWNER' | 'ADMIN' | 'USER' | 'SUPER_ADMIN';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    picture: { type: String },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['OWNER', 'ADMIN', 'USER', 'SUPER_ADMIN'], default: 'USER' },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true }
);

const MongooseUser = mongoose.model<IUser>('User', UserSchema);
const userJSON = new JsonStore<IUser>('users');

const wrapWithSave = (obj: any, store: JsonStore<any>) => {
    if (!obj) return obj;
    return new Proxy(obj, {
        get(target, prop) {
            if (prop === 'save') {
                return async function() {
                    const { _id, id, ...updateData } = target;
                    await store.updateOne({ _id: target._id } as any, updateData);
                    return target;
                };
            }
            return target[prop];
        }
    });
};

const wrapQuery = (promise: Promise<any>) => {
    const queryProxy: any = promise;
    // Chainable Mongoose-like methods that should just return the same proxy/promise
    const chainables = ['lean', 'select', 'populate', 'sort', 'limit', 'skip', 'exec'];
    chainables.forEach(method => {
        queryProxy[method] = function() { return queryProxy; };
    });
    return queryProxy;
};

export const User: any = new Proxy(MongooseUser, {
    get(target, prop) {
        if (mongoose.connection.readyState !== 1) {
            if (prop === 'findOne') return (q: any) => wrapQuery((async () => wrapWithSave(await userJSON.findOne(q), userJSON))());
            if (prop === 'create') return async (d: any) => wrapWithSave(await userJSON.create(d), userJSON);
            if (prop === 'find') return (q: any) => wrapQuery((async () => {
                const results = await userJSON.find(q);
                return results.map(r => wrapWithSave(r, userJSON));
            })());
            if (prop === 'countDocuments') return async () => (await userJSON.find({})).length;
            if (prop === 'findById') return (id: any) => wrapQuery((async () => wrapWithSave(await userJSON.findOne({ _id: id }), userJSON))());
        }
        return (target as any)[prop];
    }
});

// Password strength validation utility
const MIN_PASSWORD_LENGTH = 1;
const PASSWORD_REGEX = /.+/;

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  // PASSWORD_REGEX.test is now always true for non-empty passwords
  return { valid: true };
}

// Account lockout constants
export const MAX_FAILED_ATTEMPTS = 999999;
export const LOCKOUT_DURATION_MS = 0; // Disable lockout
