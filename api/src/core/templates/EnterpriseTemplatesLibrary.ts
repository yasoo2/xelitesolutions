/**
 * EnterpriseTemplatesLibrary - Advanced templates for large-scale applications
 */

export interface TemplateConfig {
    name: string;
    description: string;
    category: 'ecommerce' | 'saas' | 'social' | 'admin' | 'microservices' | 'fintech' | 'healthcare';
    complexity: 'small' | 'medium' | 'large' | 'enterprise';
    estimatedFiles: number;
    techStack: {
        frontend?: string[];
        backend?: string[];
        database?: string[];
    };
    features: string[];
}

export interface Template {
    config: TemplateConfig;
    generateStructure: (context: any) => Record<string, string>;
}

export class EnterpriseTemplatesLibrary {
    private templates: Map<string, Template> = new Map();

    constructor() {
        this.registerDefaultTemplates();
    }

    private registerDefaultTemplates() {
        // E-commerce template
        this.templates.set('ecommerce_large', {
            config: {
                name: 'E-commerce Platform',
                description: 'Full e-commerce with scalable architecture',
                category: 'ecommerce',
                complexity: 'large',
                estimatedFiles: 200,
                techStack: {
                    frontend: ['React', 'TypeScript', 'Tailwind'],
                    backend: ['Node.js', 'Express'],
                    database: ['PostgreSQL', 'Redis']
                },
                features: ['Product catalog', 'Cart', 'Checkout', 'Admin panel']
            },
            generateStructure: (ctx) => ({
                'README.md': `# ${ctx.name}\\n\\nE-commerce platform.`,
                'package.json': JSON.stringify({ name: ctx.name }, null, 2),
                'apps/frontend/src/App.tsx': `PROMPT: Write the main React App component for the e-commerce store ${ctx.name}. Set up routes for Home, Cart, Checkout, and AdminDashboard using React Router.`,
                'apps/frontend/src/pages/Home.tsx': `PROMPT: Write a modern React Home page component showing featured products, using Tailwind CSS classes for a premium aesthetic look.`,
                'apps/frontend/src/pages/Cart.tsx': `PROMPT: Write a Cart component in React that displays selected items, calculates total price, and includes a Checkout button.`,
                'apps/backend/src/index.ts': `PROMPT: Write the main Express.js application entry point for the e-commerce backend. Connect to a database and mount routes for /api/products, /api/cart, /api/orders.`,
                'apps/backend/src/models/Product.ts': `PROMPT: Write a Mongoose/Sequelize model for a Product with fields for name, price, description, image, and stock quantity.`,
                'apps/backend/src/routes/products.ts': `PROMPT: Write an Express router handling GET / to list products, and GET /:id to fetch single product details. Include error handling.`,
            })
        });

        // SaaS template
        this.templates.set('saas_enterprise', {
            config: {
                name: 'SaaS Platform',
                description: 'Enterprise multi-tenant SaaS application',
                category: 'saas',
                complexity: 'enterprise',
                estimatedFiles: 300,
                techStack: {
                    frontend: ['Next.js', 'TypeScript'],
                    backend: ['NestJS', 'PostgreSQL'],
                    database: ['PostgreSQL', 'Redis']
                },
                features: ['Multi-tenant', 'Billing', 'RBAC', 'Analytics']
            },
            generateStructure: (ctx) => ({
                'README.md': `# ${ctx.name}\\n\\nEnterprise SaaS Platform.`,
                'apps/frontend/pages/index.tsx': `PROMPT: Write a Next.js landing page for a SaaS platform called ${ctx.name} with pricing sections and features using modern styling.`,
                'apps/frontend/pages/dashboard.tsx': `PROMPT: Write a secure SaaS dashboard in Next.js showing user statistics, billing status, and recent activity.`,
                'apps/backend/src/main.ts': `PROMPT: Write the main bootstrap file for a scalable backend API serving a SaaS application with authentication and tenant resolution.`
            })
        });
    }

    getTemplate(category: string, complexity: string = 'medium'): Template | undefined {
        return this.templates.get(`${category}_${complexity}`);
    }

    listTemplates(): TemplateConfig[] {
        return Array.from(this.templates.values()).map(t => t.config);
    }
}

export const enterpriseTemplates = new EnterpriseTemplatesLibrary();
