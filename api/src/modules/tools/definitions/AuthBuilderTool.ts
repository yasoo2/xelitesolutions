/**
 * AuthBuilderTool - Authentication System Generator
 * 
 * God Mode Feature: Generates complete authentication systems
 * including OAuth, JWT, session management, and role-based access.
 * 
 * @version 1.0.0
 */

import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

export class AuthBuilderTool extends BaseTool {
    name = 'auth_builder';
    description = 'Generate complete authentication systems with OAuth, JWT, sessions, and RBAC.';
    version = '1.0.0';
    tags = ['auth', 'oauth', 'jwt', 'security', 'god-mode'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            type: {
                type: 'string',
                enum: ['jwt', 'oauth', 'session', 'full'],
                description: 'Type of auth system to generate'
            },
            providers: {
                type: 'array',
                items: { type: 'string' },
                description: 'OAuth providers (google, github, apple, etc.)'
            },
            outputDir: { type: 'string', description: 'Where to generate auth files' },
            framework: {
                type: 'string',
                enum: ['express', 'nextjs', 'nestjs'],
                description: 'Target framework'
            },
            includeRBAC: { type: 'boolean', description: 'Include Role-Based Access Control' }
        },
        required: ['type', 'outputDir']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            files: { type: 'array', items: { type: 'string' } },
            instructions: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        const logs: string[] = [];
        const authType = input.type || 'jwt';
        const outputDir = input.outputDir || './src/auth';
        const framework = input.framework || 'express';
        const providers = input.providers || ['google', 'github'];
        const includeRBAC = input.includeRBAC !== false;

        const createdFiles: string[] = [];

        try {
            logs.push(`🔐 AuthBuilder: Generating ${authType} auth for ${framework}`);

            // Ensure output directory exists
            const authDir = path.isAbsolute(outputDir) ? outputDir : path.resolve(process.cwd(), outputDir);
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            // Generate JWT middleware
            if (authType === 'jwt' || authType === 'full') {
                const jwtMiddleware = this.generateJWTMiddleware(framework);
                const jwtPath = path.join(authDir, 'jwt.ts');
                fs.writeFileSync(jwtPath, jwtMiddleware);
                createdFiles.push(jwtPath);
                logs.push(`✅ Created JWT middleware: ${jwtPath}`);
            }

            // Generate OAuth handlers — with the user store they depend on. The
            // handler used to be written against two stubs that authenticated
            // every visitor as the same account; it is not shipped without a
            // real store behind it.
            if (authType === 'oauth' || authType === 'full') {
                const storePath = path.join(authDir, 'user-store.ts');
                fs.writeFileSync(storePath, this.generateUserStore());
                createdFiles.push(storePath);
                logs.push(`✅ Created user store: ${storePath}`);

                const oauthHandler = this.generateOAuthHandler(providers, framework);
                const oauthPath = path.join(authDir, 'oauth.ts');
                fs.writeFileSync(oauthPath, oauthHandler);
                createdFiles.push(oauthPath);
                logs.push(`✅ Created OAuth handler: ${oauthPath}`);
            }

            // Generate session management
            if (authType === 'session' || authType === 'full') {
                const sessionHandler = this.generateSessionHandler(framework);
                const sessionPath = path.join(authDir, 'session.ts');
                fs.writeFileSync(sessionPath, sessionHandler);
                createdFiles.push(sessionPath);
                logs.push(`✅ Created session handler: ${sessionPath}`);
            }

            // Generate RBAC
            if (includeRBAC) {
                const rbac = this.generateRBAC();
                const rbacPath = path.join(authDir, 'rbac.ts');
                fs.writeFileSync(rbacPath, rbac);
                createdFiles.push(rbacPath);
                logs.push(`✅ Created RBAC system: ${rbacPath}`);
            }

            // Generate auth config
            const configContent = this.generateAuthConfig(providers);
            const configPath = path.join(authDir, 'config.ts');
            fs.writeFileSync(configPath, configContent);
            createdFiles.push(configPath);

            // Generate index file
            const indexContent = this.generateIndex(authType, includeRBAC);
            const indexPath = path.join(authDir, 'index.ts');
            fs.writeFileSync(indexPath, indexContent);
            createdFiles.push(indexPath);

            return {
                ok: true,
                output: {
                    files: createdFiles,
                    instructions: `
Auth system generated! Next steps:
1. Install dependencies: npm install jsonwebtoken bcryptjs passport passport-google-oauth20 express-session
2. Set environment variables: JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
3. Import from '${outputDir}' in your main app
${authType === 'oauth' || authType === 'full' ? `4. user-store.ts persists users to data/users.json (override with AUTH_USER_STORE).
   It works as generated — it is not a stub — but it is single-process and
   file-backed. For production, replace findUserByProvider/findUserById/
   createUser/updateUser with your database; oauth.ts depends on nothing else.` : ''}
                    `.trim()
                },
                logs
            };
        } catch (e: any) {
            logs.push(`❌ Error: ${e.message}`);
            return { ok: false, error: e.message, logs };
        }
    }

    private generateJWTMiddleware(framework: string): string {
        return `/**
 * JWT Authentication Middleware
 * Auto-generated by AuthBuilderTool
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
    userId: string;
    email: string;
    role: string;
}

export function generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        return null;
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    (req as any).user = payload;
    next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        (req as any).user = verifyToken(token);
    }
    
    next();
}
`;
    }

    private generateOAuthHandler(providers: string[], framework: string): string {
        const providerConfigs = providers.map(p => `
// ${p.charAt(0).toUpperCase() + p.slice(1)} OAuth
passport.use(new ${p.charAt(0).toUpperCase() + p.slice(1)}Strategy({
    clientID: process.env.${p.toUpperCase()}_CLIENT_ID!,
    clientSecret: process.env.${p.toUpperCase()}_CLIENT_SECRET!,
    callbackURL: '/auth/${p}/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Find or create user
        let user = await findUserByProvider('${p}', profile.id);
        if (!user) {
            user = await createUser({
                provider: '${p}',
                providerId: profile.id,
                email: profile.emails?.[0]?.value,
                name: profile.displayName
            });
        }
        done(null, user);
    } catch (err) {
        done(err as Error);
    }
}));`).join('\n');

        return `/**
 * OAuth Authentication Handler
 * Auto-generated by AuthBuilderTool
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { generateToken } from './jwt';
import { findUserByProvider, createUser } from './user-store';

${providerConfigs}

export function setupOAuth(app: any) {
    app.use(passport.initialize());
    
${providers.map(p => `
    // ${p} routes
    app.get('/auth/${p}', passport.authenticate('${p}', { scope: ['profile', 'email'] }));
    app.get('/auth/${p}/callback', 
        passport.authenticate('${p}', { session: false }),
        (req: any, res: any) => {
            const token = generateToken({
                userId: req.user.id,
                email: req.user.email,
                role: req.user.role || 'user'
            });
            res.json({ token, user: req.user });
        }
    );`).join('\n')}
}

export default passport;
`;
    }

    private generateSessionHandler(framework: string): string {
        return `/**
 * Session Management Handler
 * Auto-generated by AuthBuilderTool
 */

import session from 'express-session';
import { Request, Response, NextFunction } from 'express';

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret';

export const sessionConfig = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
};

export function setupSession(app: any) {
    app.use(session(sessionConfig));
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
    if (!(req as any).session?.userId) {
        return res.status(401).json({ error: 'Session required' });
    }
    next();
}

export function destroySession(req: Request, res: Response) {
    (req as any).session?.destroy((err: any) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
}
`;
    }

    private generateRBAC(): string {
        return `/**
 * Role-Based Access Control (RBAC)
 * Auto-generated by AuthBuilderTool
 */

import { Request, Response, NextFunction } from 'express';

export type Role = 'admin' | 'user' | 'moderator' | 'guest';

export const PERMISSIONS = {
    admin: ['read', 'write', 'delete', 'manage_users', 'manage_roles'],
    moderator: ['read', 'write', 'delete'],
    user: ['read', 'write'],
    guest: ['read']
} as const;

export function hasRole(...roles: Role[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

export function hasPermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userPermissions = PERMISSIONS[user.role as Role] || [];
        
        if (!userPermissions.includes(permission as any)) {
            return res.status(403).json({ error: 'Permission denied' });
        }

        next();
    };
}

export function isAdmin(req: Request, res: Response, next: NextFunction) {
    return hasRole('admin')(req, res, next);
}

export function isModerator(req: Request, res: Response, next: NextFunction) {
    return hasRole('admin', 'moderator')(req, res, next);
}
`;
    }

    private generateAuthConfig(providers: string[]): string {
        return `/**
 * Auth Configuration
 * Auto-generated by AuthBuilderTool
 */

export const authConfig = {
    jwt: {
        secret: process.env.JWT_SECRET || 'change-this-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    session: {
        secret: process.env.SESSION_SECRET || 'change-this-session-secret'
    },
    oauth: {
${providers.map(p => `        ${p}: {
            clientId: process.env.${p.toUpperCase()}_CLIENT_ID,
            clientSecret: process.env.${p.toUpperCase()}_CLIENT_SECRET,
            callbackUrl: process.env.${p.toUpperCase()}_CALLBACK_URL || '/auth/${p}/callback'
        }`).join(',\n')}
    }
};

export default authConfig;
`;
    }

    /**
     * A user store that actually works.
     *
     * oauth.ts used to be generated with two stubs in it: findUserByProvider
     * returned null unconditionally and createUser returned the literal id
     * 'new-user-id'. That is not an unfinished feature, it is an authentication
     * bypass — every visitor who signed in became the SAME user, and the tool
     * reported "✅ Created OAuth handler" with no mention of it.
     *
     * So the tool now emits a real implementation: JSON-file persistence with
     * atomic writes, real unique ids, a real lookup by provider identity, and an
     * exported interface for swapping in the project's own database. It is
     * modest on purpose — it is honest about being file-backed — but it is
     * correct, and nothing in it pretends.
     */
    private generateUserStore(): string {
        return `/**
 * User Store — auto-generated by AuthBuilderTool.
 *
 * This is a WORKING implementation backed by a JSON file, not a placeholder.
 * It is suitable for development and small single-process deployments. For
 * anything larger, replace the four functions below with your database — the
 * signatures are all oauth.ts depends on.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AuthUser {
    id: string;
    provider: string;
    providerId: string;
    email?: string;
    name?: string;
    role: string;
    createdAt: string;
}

const DB_PATH = process.env.AUTH_USER_STORE || path.join(process.cwd(), 'data', 'users.json');

function readAll(): AuthUser[] {
    try {
        if (!fs.existsSync(DB_PATH)) return [];
        const raw = fs.readFileSync(DB_PATH, 'utf-8').trim();
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        // A corrupt store must not silently become an empty one — that would
        // let every existing user be recreated as somebody new.
        throw new Error(\`User store at \${DB_PATH} is unreadable: \${(err as Error).message}\`);
    }
}

function writeAll(users: AuthUser[]): void {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    // Write to a temp file and rename, so a crash mid-write cannot truncate the
    // store and lose every account.
    const tmp = \`\${DB_PATH}.\${process.pid}.tmp\`;
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf-8');
    fs.renameSync(tmp, DB_PATH);
}

/** The user for this provider identity, or null when there is none. */
export async function findUserByProvider(provider: string, providerId: string): Promise<AuthUser | null> {
    if (!provider || !providerId) return null;
    const users = readAll();
    return users.find(u => u.provider === provider && u.providerId === String(providerId)) || null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
    return readAll().find(u => u.id === id) || null;
}

/** Create a user, or return the existing one for the same provider identity. */
export async function createUser(data: Partial<AuthUser> & { provider: string; providerId: string }): Promise<AuthUser> {
    if (!data.provider || !data.providerId) {
        throw new Error('createUser requires provider and providerId');
    }
    const users = readAll();
    const existing = users.find(u => u.provider === data.provider && u.providerId === String(data.providerId));
    if (existing) return existing;

    const user: AuthUser = {
        id: crypto.randomUUID(),
        provider: data.provider,
        providerId: String(data.providerId),
        email: data.email,
        name: data.name,
        role: data.role || 'user',
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeAll(users);
    return user;
}

export async function updateUser(id: string, patch: Partial<AuthUser>): Promise<AuthUser | null> {
    const users = readAll();
    const i = users.findIndex(u => u.id === id);
    if (i < 0) return null;
    users[i] = { ...users[i], ...patch, id: users[i].id };
    writeAll(users);
    return users[i];
}
`;
    }

    private generateIndex(authType: string, includeRBAC: boolean): string {
        const exports = ['authConfig'];

        if (authType === 'jwt' || authType === 'full') {
            exports.push('generateToken', 'verifyToken', 'authMiddleware', 'optionalAuth');
        }
        if (authType === 'oauth' || authType === 'full') {
            exports.push('setupOAuth');
        }
        if (authType === 'session' || authType === 'full') {
            exports.push('setupSession', 'requireSession', 'destroySession');
        }
        if (includeRBAC) {
            exports.push('hasRole', 'hasPermission', 'isAdmin', 'isModerator', 'PERMISSIONS');
        }

        return `/**
 * Auth System - Auto-generated by AuthBuilderTool
 */

export * from './config';
${authType === 'jwt' || authType === 'full' ? "export * from './jwt';" : ''}
${authType === 'oauth' || authType === 'full' ? "export * from './oauth';" : ''}
${authType === 'session' || authType === 'full' ? "export * from './session';" : ''}
${includeRBAC ? "export * from './rbac';" : ''}
`;
    }
}
