/**
 * SwaggerDocsTool - API Documentation Generator
 * 
 * God Mode Feature: Generates complete OpenAPI/Swagger documentation
 * from code analysis or manual specification.
 * 
 * @version 1.0.0
 */

import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

export class SwaggerDocsTool extends BaseTool {
    name = 'swagger_docs';
    description = 'Generate OpenAPI/Swagger documentation for APIs with automatic endpoint detection.';
    version = '1.0.0';
    tags = ['api', 'documentation', 'swagger', 'openapi', 'god-mode'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string',
                enum: ['generate', 'add-endpoint', 'validate', 'serve'],
                description: 'Action to perform'
            },
            projectPath: { type: 'string', description: 'Path to scan for routes' },
            outputPath: { type: 'string', description: 'Where to save swagger.json' },
            title: { type: 'string', description: 'API title' },
            version: { type: 'string', description: 'API version' },
            baseUrl: { type: 'string', description: 'Base URL of the API' },
            endpoints: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        method: { type: 'string' },
                        summary: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } },
                        requestBody: { type: 'object' },
                        responses: { type: 'object' }
                    }
                },
                description: 'Manual endpoint definitions'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            specPath: { type: 'string' },
            endpointCount: { type: 'number' }
        }
    };

    permissions: ToolPermission[] = ['read', 'write'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        const logs: string[] = [];
        const action = input.action;

        try {
            switch (action) {
                case 'generate':
                    return await this.generateSwagger(input, logs);
                case 'add-endpoint':
                    return await this.addEndpoint(input, logs);
                case 'validate':
                    return await this.validateSpec(input, logs);
                case 'serve':
                    return await this.serveSwagger(input, logs);
                default:
                    return { ok: false, error: `Unknown action: ${action}`, logs };
            }
        } catch (e: any) {
            logs.push(`❌ Error: ${e.message}`);
            return { ok: false, error: e.message, logs };
        }
    }

    private async generateSwagger(input: any, logs: string[]) {
        const title = input.title || 'API Documentation';
        const version = input.version || '1.0.0';
        const baseUrl = input.baseUrl || 'http://localhost:3000';
        const projectPath = input.projectPath || './src';
        const outputPath = input.outputPath || './docs/swagger.json';

        logs.push(`📚 SwaggerDocs: Generating OpenAPI spec for "${title}"`);

        // Base OpenAPI spec
        const spec: any = {
            openapi: '3.0.3',
            info: {
                title,
                version,
                description: `API documentation for ${title}`,
                contact: { email: 'api@example.com' }
            },
            servers: [
                { url: baseUrl, description: 'Primary server' }
            ],
            tags: [],
            paths: {},
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    },
                    apiKey: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'X-API-Key'
                    }
                },
                schemas: {}
            }
        };

        // Scan for routes if projectPath exists
        if (fs.existsSync(projectPath)) {
            const routes = await this.scanRoutes(projectPath, logs);
            for (const route of routes) {
                if (!spec.paths[route.path]) {
                    spec.paths[route.path] = {};
                }
                spec.paths[route.path][route.method.toLowerCase()] = {
                    summary: route.summary || `${route.method} ${route.path}`,
                    tags: route.tags || ['default'],
                    responses: {
                        '200': { description: 'Success' },
                        '400': { description: 'Bad Request' },
                        '401': { description: 'Unauthorized' },
                        '500': { description: 'Internal Server Error' }
                    }
                };
            }
        }

        // Add manual endpoints if provided
        if (input.endpoints && Array.isArray(input.endpoints)) {
            for (const ep of input.endpoints) {
                if (!spec.paths[ep.path]) {
                    spec.paths[ep.path] = {};
                }
                spec.paths[ep.path][ep.method.toLowerCase()] = {
                    summary: ep.summary,
                    tags: ep.tags || ['default'],
                    requestBody: ep.requestBody,
                    responses: ep.responses || { '200': { description: 'Success' } }
                };
            }
        }

        // Collect unique tags
        const tagSet = new Set<string>();
        for (const pathObj of Object.values(spec.paths)) {
            for (const method of Object.values(pathObj as any)) {
                ((method as any).tags || []).forEach((t: string) => tagSet.add(t));
            }
        }
        spec.tags = Array.from(tagSet).map(name => ({ name }));

        // Save spec
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

        const endpointCount = Object.values(spec.paths).reduce(
            (acc: number, p: any) => acc + Object.keys(p).length, 0
        );

        logs.push(`✅ Generated OpenAPI spec: ${outputPath}`);
        logs.push(`📊 Total endpoints: ${endpointCount}`);

        // Also generate swagger-ui HTML
        const htmlPath = path.join(outputDir, 'swagger-ui.html');
        fs.writeFileSync(htmlPath, this.generateSwaggerHTML(title));
        logs.push(`🌐 Generated Swagger UI: ${htmlPath}`);

        return {
            ok: true,
            output: {
                success: true,
                specPath: outputPath,
                uiPath: htmlPath,
                endpointCount
            },
            logs
        };
    }

    private async scanRoutes(projectPath: string, logs: string[]): Promise<any[]> {
        const routes: any[] = [];
        const routePatterns = [
            /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
            /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`\)]+)['"`]?\s*\)/gi
        ];

        const scanDir = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    scanDir(fullPath);
                } else if (file.endsWith('.ts') || file.endsWith('.js')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        for (const pattern of routePatterns) {
                            let match;
                            while ((match = pattern.exec(content)) !== null) {
                                routes.push({
                                    method: match[1].toUpperCase(),
                                    path: match[2].startsWith('/') ? match[2] : `/${match[2]}`,
                                    file: file,
                                    tags: [path.basename(file, path.extname(file)).replace(/Route|Controller|Handler/gi, '')]
                                });
                            }
                        }
                    } catch (e) {
                        // Skip unreadable files
                    }
                }
            }
        };

        scanDir(projectPath);
        logs.push(`🔍 Scanned ${routes.length} routes from ${projectPath}`);
        return routes;
    }

    private async addEndpoint(input: any, logs: string[]) {
        const specPath = input.outputPath || './docs/swagger.json';

        if (!fs.existsSync(specPath)) {
            return { ok: false, error: 'Swagger spec not found. Run generate first.', logs };
        }

        const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
        const ep = input.endpoint || input;

        if (!spec.paths[ep.path]) {
            spec.paths[ep.path] = {};
        }

        spec.paths[ep.path][ep.method.toLowerCase()] = {
            summary: ep.summary,
            tags: ep.tags || ['default'],
            requestBody: ep.requestBody,
            responses: ep.responses || { '200': { description: 'Success' } }
        };

        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
        logs.push(`✅ Added endpoint: ${ep.method} ${ep.path}`);

        return {
            ok: true,
            output: { success: true, added: `${ep.method} ${ep.path}` },
            logs
        };
    }

    private async validateSpec(input: any, logs: string[]) {
        const specPath = input.outputPath || './docs/swagger.json';

        if (!fs.existsSync(specPath)) {
            return { ok: false, error: 'Swagger spec not found', logs };
        }

        try {
            const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
            const issues: string[] = [];

            // Basic validation
            if (!spec.openapi) issues.push('Missing openapi version');
            if (!spec.info?.title) issues.push('Missing info.title');
            if (!spec.info?.version) issues.push('Missing info.version');
            if (!spec.paths || Object.keys(spec.paths).length === 0) {
                issues.push('No paths defined');
            }

            // Check each endpoint
            for (const [path, methods] of Object.entries(spec.paths)) {
                for (const [method, config] of Object.entries(methods as Record<string, any>)) {
                    if (!(config as any).responses) {
                        issues.push(`${method.toUpperCase()} ${path}: Missing responses`);
                    }
                }
            }

            logs.push(`✅ Validated spec: ${issues.length} issues found`);

            return {
                ok: issues.length === 0,
                output: {
                    valid: issues.length === 0,
                    issues
                },
                logs
            };
        } catch (e: any) {
            return { ok: false, error: `Invalid JSON: ${e.message}`, logs };
        }
    }

    private async serveSwagger(input: any, logs: string[]) {
        logs.push(`🌐 To serve Swagger UI, add this to your Express app:`);
        logs.push(`
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
        `);

        return {
            ok: true,
            output: {
                instructions: 'npm install swagger-ui-express && add middleware to Express',
                url: '/api-docs'
            },
            logs
        };
    }

    private generateSwaggerHTML(title: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>${title} - API Docs</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        body { margin: 0; padding: 0; }
        .topbar { display: none; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({
            url: './swagger.json',
            dom_id: '#swagger-ui',
            presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
            layout: 'StandaloneLayout'
        });
    </script>
</body>
</html>`;
    }
}
