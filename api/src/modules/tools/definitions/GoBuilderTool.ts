import { ToolDefinition } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GoBuilderTool - Go project scaffolding with Gin/Echo support
 * Provides comprehensive Go development support
 */
export class GoBuilderTool implements ToolDefinition {
    name = 'go_builder';
    version = '1.0.0';
    description = 'Build Go projects with Gin/Echo framework support';
    tags = ['go', 'golang', 'gin', 'echo'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['scaffold', 'dependencies', 'test', 'build'],
                description: 'Action to perform'
            },
            projectName: {
                type: 'string' as const,
                description: 'Project name'
            },
            framework: {
                type: 'string' as const,
                enum: ['gin', 'echo', 'plain'],
                description: 'Go framework (default: gin)'
            },
            features: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Features to include (api, database, auth, etc.)'
            },
            dependencies: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Additional Go modules'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            filesCreated: { type: 'array' as const },
            projectPath: { type: 'string' as const },
            buildCommand: { type: 'string' as const }
        }
    };

    permissions = ['write' as const, 'read' as const];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 10;
    auditFields = ['action', 'projectName'];
    mockSupported = false;

    async execute(input: { action: string; projectName?: string; framework?: string; features?: string[]; dependencies?: string[] }) {
        const { action, projectName, framework, features, dependencies } = input;
        const logs: string[] = [];

        try {
            logs.push(`GoBuilder: ${action}`);

            switch (action) {
                case 'scaffold':
                    return this.scaffoldProject(projectName || 'go-app', framework || 'gin', features || [], logs);

                case 'dependencies':
                    return this.manageDependencies(dependencies || [], logs);

                case 'test':
                    return this.setupTests(logs);

                case 'build':
                    return this.buildProject(logs);

                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }

    private scaffoldProject(projectName: string, framework: string, features: string[], logs: string[]) {
        const projectPath = path.join(process.cwd(), projectName);
        const filesCreated: string[] = [];

        // Create project structure
        const structure = this.getProjectStructure(projectName, framework, features);

        for (const [filePath, content] of Object.entries(structure)) {
            const fullPath = path.join(projectPath, filePath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (content !== null) {
                fs.writeFileSync(fullPath, content);
                filesCreated.push(filePath);
            }
        }

        logs.push(`Created Go project: ${projectName}`);
        logs.push(`Framework: ${framework}`);
        logs.push(`Files created: ${filesCreated.length}`);

        return {
            ok: true,
            output: {
                success: true,
                projectName,
                projectPath,
                filesCreated,
                framework,
                buildCommand: 'go build -o bin/app ./cmd/app'
            },
            logs
        };
    }

    private getProjectStructure(projectName: string, framework: string, features: string[]): Record<string, string | null> {
        const structure: Record<string, string | null> = {};

        // Go module file
        structure['go.mod'] = this.generateGoMod(projectName, framework, features);

        // Main application
        structure['cmd/app/main.go'] = this.generateMainGo(framework, features);

        // API handlers
        if (features.includes('api')) {
            structure['internal/handlers/health.go'] = this.generateHealthHandler(framework);
            structure['internal/handlers/api.go'] = this.generateAPIHandler(framework);
        }

        // Database
        if (features.includes('database')) {
            structure['internal/database/db.go'] = this.generateDatabaseGo();
            structure['internal/models/user.go'] = this.generateUserModel();
        }

        // Configuration
        structure['config/config.go'] = this.generateConfigGo();
        structure['.env.example'] = this.generateEnvExample();

        // Tests
        structure['cmd/app/main_test.go'] = this.generateMainTest();

        // README
        structure['README.md'] = this.generateReadme(projectName, framework);

        // Directories
        structure['internal/middleware/'] = null;
        structure['internal/services/'] = null;
        structure['bin/'] = null;

        return structure;
    }

    private generateGoMod(projectName: string, framework: string, features: string[]): string {
        let dependencies = '';

        if (framework === 'gin') {
            dependencies += '\trequire github.com/gin-gonic/gin v1.9.1\n';
        } else if (framework === 'echo') {
            dependencies += '\trequire github.com/labstack/echo/v4 v4.11.4\n';
        }

        if (features.includes('database')) {
            dependencies += '\trequire gorm.io/gorm v1.25.5\n';
            dependencies += '\trequire gorm.io/driver/postgres v1.5.4\n';
        }

        return `module github.com/example/${projectName}

go 1.21

${dependencies}`;
    }

    private generateMainGo(framework: string, features: string[]): string {
        if (framework === 'gin') {
            return `package main

import (
    "github.com/gin-gonic/gin"
    "log"
)

func main() {
    r := gin.Default()
    
    r.GET("/", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "message": "Hello, World!",
        })
    })
    
    r.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "status": "healthy",
        })
    })
    
    log.Println("Server starting on :8080")
    if err := r.Run(":8080"); err != nil {
        log.Fatal(err)
    }
}`;
        } else if (framework === 'echo') {
            return `package main

import (
    "github.com/labstack/echo/v4"
    "github.com/labstack/echo/v4/middleware"
    "net/http"
)

func main() {
    e := echo.New()
    
    e.Use(middleware.Logger())
    e.Use(middleware.Recover())
    
    e.GET("/", func(c echo.Context) error {
        return c.JSON(http.StatusOK, map[string]string{
            "message": "Hello, World!",
        })
    })
    
    e.GET("/health", func(c echo.Context) error {
        return c.JSON(http.StatusOK, map[string]string{
            "status": "healthy",
        })
    })
    
    e.Logger.Fatal(e.Start(":8080"))
}`;
        } else {
            return `package main

import (
    "fmt"
    "log"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Hello, World!")
    })
    
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        fmt.Fprintf(w, "{\\"status\\": \\"healthy\\"}")
    })
    
    log.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}`;
        }
    }

    private generateHealthHandler(framework: string): string {
        if (framework === 'gin') {
            return `package handlers

import "github.com/gin-gonic/gin"

func HealthCheck(c *gin.Context) {
    c.JSON(200, gin.H{
        "status": "healthy",
        "service": "api",
    })
}`;
        } else {
            return `package handlers

import (
    "github.com/labstack/echo/v4"
    "net/http"
)

func HealthCheck(c echo.Context) error {
    return c.JSON(http.StatusOK, map[string]string{
        "status": "healthy",
        "service": "api",
    })
}`;
        }
    }

    private generateAPIHandler(framework: string): string {
        if (framework === 'gin') {
            return `package handlers

import "github.com/gin-gonic/gin"

func GetItems(c *gin.Context) {
    c.JSON(200, gin.H{
        "items": []string{"item1", "item2", "item3"},
    })
}

func CreateItem(c *gin.Context) {
    var item map[string]interface{}
    if err := c.BindJSON(&item); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    c.JSON(201, item)
}`;
        } else {
            return `package handlers

import (
    "github.com/labstack/echo/v4"
    "net/http"
)

func GetItems(c echo.Context) error {
    items := []string{"item1", "item2", "item3"}
    return c.JSON(http.StatusOK, map[string]interface{}{
        "items": items,
    })
}

func CreateItem(c echo.Context) error {
    var item map[string]interface{}
    if err := c.Bind(&item); err != nil {
        return c.JSON(http.StatusBadRequest, map[string]string{
            "error": err.Error(),
        })
    }
    return c.JSON(http.StatusCreated, item)
}`;
        }
    }

    private generateDatabaseGo(): string {
        return `package database

import (
    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "log"
)

var DB *gorm.DB

func Connect(dsn string) error {
    var err error
    DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
    if err != nil {
        return err
    }
    
    log.Println("Database connected successfully")
    return nil
}

func Close() error {
    sqlDB, err := DB.DB()
    if err != nil {
        return err
    }
    return sqlDB.Close()
}`;
    }

    private generateUserModel(): string {
        return `package models

import "gorm.io/gorm"

type User struct {
    gorm.Model
    Name     string \`json:"name"\`
    Email    string \`json:"email" gorm:"unique"\`
    Password string \`json:"-"\`
}`;
    }

    private generateConfigGo(): string {
        return `package config

import (
    "os"
)

type Config struct {
    Port        string
    DatabaseURL string
}

func Load() *Config {
    return &Config{
        Port:        getEnv("PORT", "8080"),
        DatabaseURL: getEnv("DATABASE_URL", ""),
    }
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}`;
    }

    private generateEnvExample(): string {
        return `PORT=8080
DATABASE_URL=postgres://user:password@localhost:5432/dbname?sslmode=disable`;
    }

    private generateMainTest(): string {
        return `package main

import "testing"

func TestMain(t *testing.T) {
    // Add your tests here
    t.Log("Test placeholder")
}`;
    }

    private generateReadme(projectName: string, framework: string): string {
        return `# ${projectName}

A Go application built with ${framework}.

## Getting Started

### Prerequisites
- Go 1.21 or higher

### Installation

\`\`\`bash
# Install dependencies
go mod download

# Run the application
go run cmd/app/main.go

# Build the application
go build -o bin/app ./cmd/app
\`\`\`

### Testing

\`\`\`bash
go test ./...
\`\`\`

## API Endpoints

- \`GET /\` - Hello World
- \`GET /health\` - Health check

## License

MIT
`;
    }

    private manageDependencies(dependencies: string[], logs: string[]) {
        logs.push(`Managing Go modules`);
        logs.push(`Dependencies: ${dependencies.join(', ')}`);

        return {
            ok: true,
            output: {
                success: true,
                dependencies,
                message: 'Run "go mod tidy" to install dependencies'
            },
            logs
        };
    }

    private setupTests(logs: string[]) {
        logs.push('Setting up Go tests');

        return {
            ok: true,
            output: {
                success: true,
                testCommand: 'go test ./...',
                message: 'Test configuration ready'
            },
            logs
        };
    }

    private buildProject(logs: string[]) {
        const buildCommand = 'go build -o bin/app ./cmd/app';
        logs.push(`Build command: ${buildCommand}`);

        return {
            ok: true,
            output: {
                success: true,
                buildCommand,
                runCommand: './bin/app',
                message: `Use '${buildCommand}' to build the project`
            },
            logs
        };
    }
}
