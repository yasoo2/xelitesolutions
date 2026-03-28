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

            // Generate OAuth handlers
            if (authType === 'oauth' || authType === 'full') {
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

// Replace with your actual user functions
async function findUserByProvider(provider: string, id: string) {
    // TODO: Implement database lookup
    return null;
}

async function createUser(userData: any) {
    // TODO: Implement user creation
    return { id: 'new-user-id', ...userData };
}

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
