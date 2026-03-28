import fs from 'fs';
import path from 'path';

/**
 * Pattern Database - قاعدة بيانات الباترنز المتقدمة
 * تحتوي على أفضل الممارسات لكل نوع من المشاريع
 */
const PATTERN_DATABASE = {
  social_network: {
    architecture: 'microservices',
    database: ['postgresql', 'redis', 'elasticsearch'],
    features: [
      'user_authentication', 'user_profiles', 'friend_system',
      'news_feed', 'messaging', 'notifications', 'groups',
      'events', 'media_sharing', 'real_time_updates'
    ],
    tech_stack: {
      frontend: ['react', 'typescript', 'tailwindcss', 'socket.io-client'],
      backend: ['nodejs', 'express', 'socket.io', 'bull'],
      database: ['postgresql', 'redis', 'minio'],
      infrastructure: ['docker', 'nginx', 'pm2']
    },
    patterns: [
      'CQRS', 'Event Sourcing', 'Repository Pattern',
      'Factory Pattern', 'Observer Pattern', 'Strategy Pattern'
    ],
    scalability: {
      horizontal: true,
      caching: ['redis', 'cdn'],
      load_balancing: true,
      database_sharding: true
    }
  },
  
  ecommerce: {
    architecture: 'modular_monolith',
    database: ['postgresql', 'redis'],
    features: [
      'product_catalog', 'shopping_cart', 'checkout',
      'payment_gateway', 'order_management', 'inventory',
      'user_accounts', 'reviews', 'search', 'analytics'
    ],
    tech_stack: {
      frontend: ['react', 'nextjs', 'typescript', 'tailwindcss'],
      backend: ['nodejs', 'express', 'stripe'],
      database: ['postgresql', 'redis'],
      infrastructure: ['docker', 'nginx']
    },
    patterns: [
      'Repository Pattern', 'Service Layer', 'DTO Pattern',
      'Event Driven', 'Circuit Breaker'
    ],
    scalability: {
      horizontal: true,
      caching: ['redis', 'cdn'],
      load_balancing: true
    }
  },

  saas: {
    architecture: 'multi_tenant',
    database: ['postgresql', 'redis'],
    features: [
      'tenant_isolation', 'subscription_management',
      'billing', 'team_collaboration', 'api_keys',
      'webhooks', 'analytics', 'admin_dashboard'
    ],
    tech_stack: {
      frontend: ['react', 'typescript', 'tailwindcss'],
      backend: ['nodejs', 'express', 'stripe'],
      database: ['postgresql', 'redis'],
      infrastructure: ['docker', 'nginx', 'kubernetes']
    },
    patterns: [
      'Multi-Tenancy', 'Repository Pattern', 'Event Driven',
      'Plugin Architecture', 'Feature Flags'
    ],
    scalability: {
      horizontal: true,
      caching: ['redis'],
      load_balancing: true
    }
  },

  ai_platform: {
    architecture: 'event_driven',
    database: ['postgresql', 'mongodb', 'redis'],
    features: [
      'model_management', 'inference_api', 'training_pipeline',
      'dataset_management', 'experiment_tracking',
      'model_versioning', 'monitoring', 'auto_scaling'
    ],
    tech_stack: {
      frontend: ['react', 'typescript', 'tailwindcss', 'd3'],
      backend: ['python', 'fastapi', 'celery'],
      ml: ['pytorch', 'transformers', 'mlflow'],
      database: ['postgresql', 'mongodb', 'redis'],
      infrastructure: ['docker', 'kubernetes', 'gpu_cluster']
    },
    patterns: [
      'Pipeline Pattern', 'Plugin Architecture', 'Event Sourcing',
      'CQRS', 'Circuit Breaker'
    ],
    scalability: {
      horizontal: true,
      auto_scaling: true,
      gpu_scaling: true
    }
  }
};

/**
 * Component Templates - قوالب المكونات الجاهزة
 */
const COMPONENT_TEMPLATES = {
  authentication: {
    files: [
      {
        path: 'src/auth/AuthProvider.tsx',
        content: `import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode<User>(token);
        setUser(decoded);
      } catch {
        localStorage.removeItem('token');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      setUser(jwtDecode(data.token));
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};`
      },
      {
        path: 'src/auth/ProtectedRoute.tsx',
        content: `import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};`
      }
    ]
  },

  database: {
    files: [
      {
        path: 'src/db/connection.ts',
        content: `import { Pool } from 'pg';
import Redis from 'ioredis';

// PostgreSQL Connection Pool
export const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis Connection
export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Connection Health Check
export async function checkDatabaseHealth() {
  try {
    const pgClient = await pgPool.connect();
    await pgClient.query('SELECT 1');
    pgClient.release();
    
    await redis.ping();
    
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return { healthy: false, error: error.message, timestamp: new Date().toISOString() };
  }
}`
      },
      {
        path: 'src/db/migrations/001_initial.sql',
        content: `-- Initial Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);`
      }
    ]
  },

  api: {
    files: [
      {
        path: 'src/api/middleware/errorHandler.ts',
        content: `import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  console.error('[Error]', {
    statusCode,
    message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};`
      },
      {
        path: 'src/api/middleware/rateLimiter.ts',
        content: `import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';

const redis = new Redis();

export const createRateLimiter = (options: {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.ip || 'unknown';
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later.'
      });
    }
  });
};`
      }
    ]
  }
};

/**
 * Smart Project Analyzer - محلل المشاريع الذكي
 */
class ProjectAnalyzer {
  analyzeRequirements(description: string): {
    type: string;
    complexity: 'low' | 'medium' | 'high' | 'enterprise';
    features: string[];
    techStack: any;
    estimatedHours: number;
  } {
    const lowerDesc = description.toLowerCase();
    
    // تحديد نوع المشروع
    let type = 'general';
    if (/(social|فيس|تواصل|شبكة)/i.test(lowerDesc)) type = 'social_network';
    else if (/(متجر|تجارة|shop|store|ecommerce)/i.test(lowerDesc)) type = 'ecommerce';
    else if (/(saas|اشتراك|subscription)/i.test(lowerDesc)) type = 'saas';
    else if (/(ai|ذكاء|machine learning|ml)/i.test(lowerDesc)) type = 'ai_platform';
    
    // تحديد التعقيد
    let complexity: 'low' | 'medium' | 'high' | 'enterprise' = 'medium';
    if (/(ضخم|enterprise|كبير|huge|massive)/i.test(lowerDesc)) complexity = 'enterprise';
    else if (/(متوسط|medium|متقدم)/i.test(lowerDesc)) complexity = 'high';
    else if (/(بسيط|simple|small|صغير)/i.test(lowerDesc)) complexity = 'low';
    
    // استخراج الميزات
    const features = this.extractFeatures(lowerDesc, type);
    
    // تحديد التقنيات
    const techStack = PATTERN_DATABASE[type as keyof typeof PATTERN_DATABASE]?.tech_stack || 
                      PATTERN_DATABASE.ecommerce.tech_stack;
    
    // تقدير الوقت
    const estimatedHours = this.estimateTime(complexity, features.length);
    
    return { type, complexity, features, techStack, estimatedHours };
  }
  
  private extractFeatures(description: string, type: string): string[] {
    const featureKeywords: Record<string, string[]> = {
      social_network: ['user', 'friend', 'post', 'message', 'notification', 'group', 'event'],
      ecommerce: ['product', 'cart', 'checkout', 'payment', 'order', 'inventory'],
      saas: ['tenant', 'subscription', 'billing', 'team', 'api'],
      ai_platform: ['model', 'training', 'inference', 'dataset', 'experiment']
    };
    
    const keywords = featureKeywords[type] || [];
    return keywords.filter(kw => description.includes(kw));
  }
  
  private estimateTime(complexity: string, featureCount: number): number {
    const baseHours = {
      low: 40,
      medium: 120,
      high: 300,
      enterprise: 800
    };
    
    return baseHours[complexity as keyof typeof baseHours] + (featureCount * 20);
  }
}

/**
 * ArchitectAgent V2 - وكيل المعماري المتطور
 */
export class ArchitectAgent {
  private analyzer: ProjectAnalyzer;
  private patternDb: typeof PATTERN_DATABASE;
  
  constructor() {
    this.analyzer = new ProjectAnalyzer();
    this.patternDb = PATTERN_DATABASE;
  }
  
  /**
   * تخطيط مشروع كامل مع جميع التفاصيل
   */
  async planProject(goal: string, context?: string): Promise<string> {
    const analysis = this.analyzer.analyzeRequirements(goal);
    const pattern = this.patternDb[analysis.type as keyof typeof PATTERN_DATABASE];
    
    const plan = this.generateDetailedPlan(goal, analysis, pattern);
    
    return plan;
  }
  
  /**
   * إنشاء خطة تفصيلية للمشروع
   */
  private generateDetailedPlan(
    goal: string, 
    analysis: ReturnType<ProjectAnalyzer['analyzeRequirements']>,
    pattern: any
  ): string {
    const sections = [
      this.generateOverview(goal, analysis),
      this.generateArchitecture(analysis, pattern),
      this.generateDatabaseSchema(analysis, pattern),
      this.generateAPIEndpoints(analysis),
      this.generateFrontendStructure(analysis),
      this.generateImplementationPhases(analysis),
      this.generateTechStackDetails(analysis),
      this.generateSecurityConsiderations(analysis),
      this.generateScalabilityPlan(analysis, pattern)
    ];
    
    return sections.join('\n\n---\n\n');
  }
  
  private generateOverview(goal: string, analysis: any): string {
    return `# Project Overview

**Goal:** ${goal}
**Type:** ${analysis.type}
**Complexity:** ${analysis.complexity}
**Estimated Hours:** ${analysis.estimatedHours}
**Key Features:** ${analysis.features.join(', ')}

## Project Vision
This is a ${analysis.complexity}-complexity ${analysis.type} project designed for scalability and maintainability.`;
  }
  
  private generateArchitecture(analysis: any, pattern: any): string {
    return `# Architecture Design

**Pattern:** ${pattern?.architecture || 'modular_monolith'}

## System Components
${pattern?.features?.map((f: string, i: number) => `${i + 1}. **${f}** - Core functionality`).join('\n') || '1. Core Module'}

## Data Flow
1. Client Request → API Gateway
2. Authentication & Authorization
3. Business Logic Processing
4. Database Operations
5. Response Caching
6. Client Response`;
  }
  
  private generateDatabaseSchema(analysis: any, pattern: any): string {
    const tables = this.inferTables(analysis.type, analysis.features);
    
    return `# Database Schema

**Primary Database:** ${pattern?.database?.[0] || 'postgresql'}
**Cache:** ${pattern?.database?.[1] || 'redis'}

## Core Tables
${tables.map((t, i) => `${i + 1}. **${t.name}** - ${t.description}`).join('\n')}

## Relationships
- One-to-Many relationships properly indexed
- Foreign key constraints for data integrity
- Soft delete pattern for audit trails`;
  }
  
  private inferTables(type: string, features: string[]): Array<{name: string, description: string}> {
    const tableMap: Record<string, Array<{name: string, description: string}>> = {
      social_network: [
        { name: 'users', description: 'User accounts and profiles' },
        { name: 'posts', description: 'User posts and content' },
        { name: 'friendships', description: 'User connections' },
        { name: 'messages', description: 'Private messages' },
        { name: 'notifications', description: 'User notifications' }
      ],
      ecommerce: [
        { name: 'products', description: 'Product catalog' },
        { name: 'categories', description: 'Product categories' },
        { name: 'orders', description: 'Customer orders' },
        { name: 'order_items', description: 'Order line items' },
        { name: 'users', description: 'Customer accounts' }
      ],
      saas: [
        { name: 'tenants', description: 'Organization tenants' },
        { name: 'users', description: 'User accounts' },
        { name: 'subscriptions', description: 'Subscription plans' },
        { name: 'invoices', description: 'Billing invoices' },
        { name: 'api_keys', description: 'API access keys' }
      ]
    };
    
    return tableMap[type] || tableMap.ecommerce;
  }
  
  private generateAPIEndpoints(analysis: any): string {
    return `# API Endpoints

## Authentication
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- POST /api/auth/logout - User logout
- GET /api/auth/me - Get current user

## Core Resources
${analysis.features.map((f: string) => `- CRUD /api/${f} - ${f} management`).join('\n')}

## Real-time
- WebSocket /ws/notifications - Live notifications
- WebSocket /ws/messages - Real-time messaging`;
  }
  
  private generateFrontendStructure(analysis: any): string {
    return `# Frontend Structure

## Pages
- / - Landing/Home
- /auth/login - Login
- /auth/register - Registration
- /dashboard - Main dashboard
${analysis.features.map((f: string) => `- /${f} - ${f} page`).join('\n')}

## Components
- Layout - Main layout wrapper
- Navigation - Top/side navigation
- DataTable - Reusable table component
- FormBuilder - Dynamic form generator
- ChartWidget - Data visualization`;
  }
  
  private generateImplementationPhases(analysis: any): string {
    const phases = [
      { name: 'Phase 1: Foundation', tasks: ['Project setup', 'Database schema', 'Authentication'], duration: 'Week 1' },
      { name: 'Phase 2: Core Features', tasks: analysis.features.slice(0, 3).map((f: string) => `${f} implementation`), duration: 'Weeks 2-3' },
      { name: 'Phase 3: Advanced Features', tasks: analysis.features.slice(3).map((f: string) => `${f} enhancement`), duration: 'Weeks 4-5' },
      { name: 'Phase 4: Polish & Deploy', tasks: ['UI/UX refinement', 'Testing', 'Deployment'], duration: 'Week 6' }
    ];
    
    return `# Implementation Phases

${phases.map((p, i) => `## ${p.name} (${p.duration})
${p.tasks.map((t: string) => `- ${t}`).join('\n')}`).join('\n\n')}`;
  }
  
  private generateTechStackDetails(analysis: any): string {
    const stack = analysis.techStack;
    
    return `# Technology Stack

## Frontend
${stack.frontend?.map((t: string) => `- ${t}`).join('\n') || '- React, TypeScript, TailwindCSS'}

## Backend
${stack.backend?.map((t: string) => `- ${t}`).join('\n') || '- Node.js, Express'}

## Database
${stack.database?.map((t: string) => `- ${t}`).join('\n') || '- PostgreSQL, Redis'}

## Infrastructure
${stack.infrastructure?.map((t: string) => `- ${t}`).join('\n') || '- Docker, Nginx'}`;
  }
  
  private generateSecurityConsiderations(analysis: any): string {
    return `# Security Considerations

## Authentication
- JWT tokens with refresh token rotation
- Password hashing with bcrypt (12 rounds)
- Rate limiting on auth endpoints

## Authorization
- Role-based access control (RBAC)
- Resource-level permissions
- API key management for external access

## Data Protection
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS protection (output encoding)
- CSRF tokens for state-changing operations

## Infrastructure
- HTTPS only
- Security headers (CSP, HSTS, X-Frame-Options)
- Environment variables for secrets`;
  }
  
  private generateScalabilityPlan(analysis: any, pattern: any): string {
    return `# Scalability Plan

## Horizontal Scaling
- Load balancer configuration
- Stateless application design
- Session storage in Redis

## Database Scaling
- Read replicas for read-heavy workloads
- Connection pooling
- Query optimization and indexing

## Caching Strategy
- Redis for session and cache
- CDN for static assets
- Application-level caching

## Monitoring
- Application metrics (Prometheus)
- Log aggregation (ELK stack)
- Error tracking (Sentry)
- Performance monitoring`;
  }
  
  /**
   * الحصول على قوالب المكونات
   */
  getComponentTemplates(componentType: keyof typeof COMPONENT_TEMPLATES) {
    return COMPONENT_TEMPLATES[componentType];
  }
  
  /**
   * تحليل مشروع موجود
   */
  analyzeExistingProject(projectPath: string) {
    const analysis = {
      structure: this.analyzeStructure(projectPath),
      dependencies: this.analyzeDependencies(projectPath),
      codeQuality: this.assessCodeQuality(projectPath),
      recommendations: [] as string[]
    };
    
    // توليد توصيات
    if (!analysis.structure.hasTests) {
      analysis.recommendations.push('Add comprehensive test suite');
    }
    if (!analysis.structure.hasCI) {
      analysis.recommendations.push('Set up CI/CD pipeline');
    }
    if (!analysis.structure.hasDocker) {
      analysis.recommendations.push('Containerize the application');
    }
    
    return analysis;
  }
  
  private analyzeStructure(projectPath: string) {
    return {
      hasTests: fs.existsSync(path.join(projectPath, 'src/__tests__')),
      hasCI: fs.existsSync(path.join(projectPath, '.github/workflows')),
      hasDocker: fs.existsSync(path.join(projectPath, 'Dockerfile')),
      hasDocs: fs.existsSync(path.join(projectPath, 'README.md'))
    };
  }
  
  private analyzeDependencies(projectPath: string) {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      
      return {
        dependencies: Object.keys(pkg.dependencies || {}),
        devDependencies: Object.keys(pkg.devDependencies || {}),
        total: Object.keys(pkg.dependencies || {}).length + 
               Object.keys(pkg.devDependencies || {}).length
      };
    } catch {
      return { dependencies: [], devDependencies: [], total: 0 };
    }
  }
  
  private assessCodeQuality(projectPath: string) {
    // تقدير بسيط لجودة الكود
    return {
      hasLinting: fs.existsSync(path.join(projectPath, '.eslintrc')),
      hasFormatting: fs.existsSync(path.join(projectPath, '.prettierrc')),
      hasTypeScript: fs.existsSync(path.join(projectPath, 'tsconfig.json'))
    };
  }
}

export const architectAgent = new ArchitectAgent();
