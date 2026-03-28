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
                description: 'Full e-commerce with 200+ files',
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
                'README.md': `# ${ctx.name}\n\nE-commerce platform.`,
                'package.json': JSON.stringify({ name: ctx.name }, null, 2)
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
