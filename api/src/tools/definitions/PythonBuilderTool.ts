import { ToolDefinition } from '../types';

/**
 * PythonBuilderTool - Python project builder
 * Create and manage Python projects (Django, Flask, FastAPI)
 */
export class PythonBuilderTool implements ToolDefinition {
    name = 'python_builder';
    version = '1.0.0';
    description = 'Build Python projects with Django, Flask, or FastAPI';
    tags = ['python', 'django', 'flask', 'fastapi'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            framework: {
                type: 'string' as const,
                enum: ['django', 'flask', 'fastapi', 'basic'],
                description: 'Python framework'
            },
            projectName: {
                type: 'string' as const,
                description: 'Project name'
            },
            projectPath: {
                type: 'string' as const,
                description: 'Project directory path'
            },
            features: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Features to include (auth, db, api, etc.)'
            }
        },
        required: ['framework', 'projectName', 'projectPath']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            files: { type: 'array' as const }
        }
    };

    permissions = ['write' as const];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 10;
    auditFields = ['framework', 'projectName'];
    mockSupported = false;

    async execute(input: { framework: string; projectName: string; projectPath: string; features?: string[] }) {
        const { framework, projectName, projectPath, features = [] } = input;
        const logs: string[] = [];

        try {
            logs.push(`Creating ${framework} project: ${projectName}`);

            const structure = this.generateStructure(framework, projectName, features);

            logs.push(`Generated ${structure.length} files`);

            return {
                ok: true,
                output: {
                    success: true,
                    framework,
                    projectName,
                    files: structure,
                    nextSteps: [
                        'cd ' + projectPath,
                        'python -m venv venv',
                        'source venv/bin/activate',
                        'pip install -r requirements.txt',
                        framework === 'django' ? 'python manage.py runserver' : 'python app.py'
                    ]
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }

    private generateStructure(framework: string, projectName: string, features: string[]): any[] {
        const files: any[] = [];

        // Common files
        files.push({
            path: 'requirements.txt',
            content: this.getRequirements(framework, features)
        });

        files.push({
            path: '.gitignore',
            content: '__pycache__/\n*.py[cod]\nvenv/\n.env\n*.sqlite3'
        });

        files.push({
            path: 'README.md',
            content: `# ${projectName}\n\n${framework.toUpperCase()} project`
        });

        // Framework-specific files
        switch (framework) {
            case 'django':
                files.push(...this.getDjangoFiles(projectName, features));
                break;

            case 'flask':
                files.push(...this.getFlaskFiles(projectName, features));
                break;

            case 'fastapi':
                files.push(...this.getFastAPIFiles(projectName, features));
                break;

            case 'basic':
                files.push({
                    path: 'main.py',
                    content: 'def main():\n    print("Hello, Python!")\n\nif __name__ == "__main__":\n    main()'
                });
                break;
        }

        return files;
    }

    private getRequirements(framework: string, features: string[]): string {
        const deps: string[] = [];

        switch (framework) {
            case 'django':
                deps.push('Django>=4.2');
                if (features.includes('db')) deps.push('psycopg2-binary');
                if (features.includes('api')) deps.push('djangorestframework');
                break;

            case 'flask':
                deps.push('Flask>=2.3');
                if (features.includes('db')) deps.push('Flask-SQLAlchemy');
                if (features.includes('auth')) deps.push('Flask-Login');
                break;

            case 'fastapi':
                deps.push('fastapi>=0.100');
                deps.push('uvicorn[standard]');
                if (features.includes('db')) deps.push('sqlalchemy');
                break;
        }

        deps.push('pytest');

        return deps.join('\n');
    }

    private getDjangoFiles(projectName: string, features: string[]): any[] {
        return [
            {
                path: 'manage.py',
                content: `#!/usr/bin/env python\nimport os\nimport sys\n\nif __name__ == "__main__":\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${projectName}.settings")\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)`
            },
            {
                path: `${projectName}/settings.py`,
                content: `from pathlib import Path\n\nBASE_DIR = Path(__file__).resolve().parent.parent\nSECRET_KEY = 'django-insecure-change-this'\nDEBUG = True\nALLOWED_HOSTS = []\n\nINSTALLED_APPS = [\n    'django.contrib.admin',\n    'django.contrib.auth',\n    'django.contrib.contenttypes',\n    'django.contrib.sessions',\n    'django.contrib.messages',\n    'django.contrib.staticfiles',\n]\n\nMIDDLEWARE = [\n    'django.middleware.security.SecurityMiddleware',\n    'django.contrib.sessions.middleware.SessionMiddleware',\n    'django.middleware.common.CommonMiddleware',\n    'django.middleware.csrf.CsrfViewMiddleware',\n    'django.contrib.auth.middleware.AuthenticationMiddleware',\n    'django.contrib.messages.middleware.MessageMiddleware',\n    'django.middleware.clickjacking.XFrameOptionsMiddleware',\n]\n\nROOT_URLCONF = '${projectName}.urls'\n\nDATABASES = {\n    'default': {\n        'ENGINE': 'django.db.backends.sqlite3',\n        'NAME': BASE_DIR / 'db.sqlite3',\n    }\n}`
            }
        ];
    }

    private getFlaskFiles(projectName: string, features: string[]): any[] {
        return [
            {
                path: 'app.py',
                content: `from flask import Flask\n\napp = Flask(__name__)\n\n@app.route('/')\ndef hello():\n    return {'message': 'Hello from Flask!'}\n\nif __name__ == '__main__':\n    app.run(debug=True)`
            }
        ];
    }

    private getFastAPIFiles(projectName: string, features: string[]): any[] {
        return [
            {
                path: 'main.py',
                content: `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/")\ndef read_root():\n    return {"message": "Hello from FastAPI!"}`
            }
        ];
    }
}
