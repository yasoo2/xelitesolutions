import { ToolDefinition } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * JavaBuilderTool - Spring Boot project scaffolding and management
 * Provides comprehensive Java/Spring Boot development support
 */
export class JavaBuilderTool implements ToolDefinition {
    name = 'java_builder';
    version = '1.0.0';
    description = 'Build Java/Spring Boot projects with Maven/Gradle support';
    tags = ['java', 'spring-boot', 'maven', 'gradle'];

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
                enum: ['spring-boot', 'spring-mvc', 'plain-java'],
                description: 'Java framework'
            },
            buildTool: {
                type: 'string' as const,
                enum: ['maven', 'gradle'],
                description: 'Build tool (default: maven)'
            },
            javaVersion: {
                type: 'string' as const,
                enum: ['8', '11', '17', '21'],
                description: 'Java version (default: 17)'
            },
            features: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Features to include (web, data-jpa, security, etc.)'
            },
            dependencies: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Additional dependencies'
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

    async execute(input: { action: string; projectName?: string; framework?: string; buildTool?: string; javaVersion?: string; features?: string[]; dependencies?: string[] }) {
        const { action, projectName, framework, buildTool, javaVersion, features, dependencies } = input;
        const logs: string[] = [];

        try {
            logs.push(`JavaBuilder: ${action}`);

            switch (action) {
                case 'scaffold':
                    return this.scaffoldProject(projectName || 'java-app', framework || 'spring-boot', buildTool || 'maven', javaVersion || '17', features || [], logs);

                case 'dependencies':
                    return this.manageDependencies(buildTool || 'maven', dependencies || [], logs);

                case 'test':
                    return this.setupTests(logs);

                case 'build':
                    return this.buildProject(buildTool || 'maven', logs);

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

    private scaffoldProject(projectName: string, framework: string, buildTool: string, javaVersion: string, features: string[], logs: string[]) {
        const projectPath = path.join(process.cwd(), projectName);
        const filesCreated: string[] = [];

        // Create project structure
        const structure = this.getProjectStructure(projectName, framework, buildTool, javaVersion, features);

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

        logs.push(`Created Java project: ${projectName}`);
        logs.push(`Framework: ${framework}, Build Tool: ${buildTool}, Java: ${javaVersion}`);
        logs.push(`Files created: ${filesCreated.length}`);

        return {
            ok: true,
            output: {
                success: true,
                projectName,
                projectPath,
                filesCreated,
                framework,
                buildTool,
                javaVersion,
                buildCommand: buildTool === 'maven' ? 'mvn clean install' : 'gradle build'
            },
            logs
        };
    }

    private getProjectStructure(projectName: string, framework: string, buildTool: string, javaVersion: string, features: string[]): Record<string, string | null> {
        const packageName = projectName.toLowerCase().replace(/-/g, '');
        const packagePath = `src/main/java/com/example/${packageName}`;
        const testPath = `src/test/java/com/example/${packageName}`;

        const structure: Record<string, string | null> = {};

        // Build configuration
        if (buildTool === 'maven') {
            structure['pom.xml'] = this.generatePomXml(projectName, javaVersion, features);
        } else {
            structure['build.gradle'] = this.generateBuildGradle(projectName, javaVersion, features);
        }

        // Application properties
        structure['src/main/resources/application.properties'] = this.generateApplicationProperties(features);
        structure['src/main/resources/application.yml'] = '';

        // Main application class
        if (framework === 'spring-boot') {
            structure[`${packagePath}/Application.java`] = this.generateSpringBootApplication(packageName);

            if (features.includes('web')) {
                structure[`${packagePath}/controller/HelloController.java`] = this.generateController(packageName);
            }

            if (features.includes('data-jpa')) {
                structure[`${packagePath}/model/Entity.java`] = this.generateEntity(packageName);
                structure[`${packagePath}/repository/EntityRepository.java`] = this.generateRepository(packageName);
            }
        }

        // Test files
        structure[`${testPath}/ApplicationTests.java`] = this.generateTestClass(packageName);

        // Additional directories
        structure['src/main/resources/static/'] = null;
        structure['src/main/resources/templates/'] = null;

        return structure;
    }

    private generatePomXml(projectName: string, javaVersion: string, features: string[]): string {
        const dependencies = features.map(f => {
            switch (f) {
                case 'web':
                    return `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>`;
                case 'data-jpa':
                    return `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>`;
                case 'security':
                    return `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>`;
                default:
                    return '';
            }
        }).filter(Boolean).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>${projectName}</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>${projectName}</name>
    <description>Spring Boot project</description>

    <properties>
        <java.version>${javaVersion}</java.version>
    </properties>

    <dependencies>
${dependencies}
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>`;
    }

    private generateBuildGradle(projectName: string, javaVersion: string, features: string[]): string {
        const dependencies = features.map(f => {
            switch (f) {
                case 'web':
                    return `    implementation 'org.springframework.boot:spring-boot-starter-web'`;
                case 'data-jpa':
                    return `    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'`;
                case 'security':
                    return `    implementation 'org.springframework.boot:spring-boot-starter-security'`;
                default:
                    return '';
            }
        }).filter(Boolean).join('\n');

        return `plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0'
    id 'io.spring.dependency-management' version '1.1.4'
}

group = 'com.example'
version = '0.0.1-SNAPSHOT'
sourceCompatibility = '${javaVersion}'

repositories {
    mavenCentral()
}

dependencies {
${dependencies}
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

tasks.named('test') {
    useJUnitPlatform()
}`;
    }

    private generateApplicationProperties(features: string[]): string {
        let props = `spring.application.name=application
server.port=8080
`;

        if (features.includes('data-jpa')) {
            props += `
# Database Configuration
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driverClassName=org.h2.Driver
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.jpa.hibernate.ddl-auto=update
`;
        }

        return props;
    }

    private generateSpringBootApplication(packageName: string): string {
        return `package com.example.${packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}`;
    }

    private generateController(packageName: string): string {
        return `package com.example.${packageName}.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {
    
    @GetMapping("/")
    public String hello() {
        return "Hello, World!";
    }
}`;
    }

    private generateEntity(packageName: string): string {
        return `package com.example.${packageName}.model;

import jakarta.persistence.*;

@Entity
@Table(name = "entities")
public class Entity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private String name;
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}`;
    }

    private generateRepository(packageName: string): string {
        return `package com.example.${packageName}.repository;

import com.example.${packageName}.model.Entity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EntityRepository extends JpaRepository<Entity, Long> {
}`;
    }

    private generateTestClass(packageName: string): string {
        return `package com.example.${packageName};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ApplicationTests {
    
    @Test
    void contextLoads() {
    }
}`;
    }

    private manageDependencies(buildTool: string, dependencies: string[], logs: string[]) {
        logs.push(`Managing dependencies for ${buildTool}`);
        logs.push(`Dependencies: ${dependencies.join(', ')}`);

        return {
            ok: true,
            output: {
                success: true,
                buildTool,
                dependencies,
                message: `Dependencies configuration ready for ${buildTool}`
            },
            logs
        };
    }

    private setupTests(logs: string[]) {
        logs.push('Setting up JUnit tests');

        return {
            ok: true,
            output: {
                success: true,
                testFramework: 'JUnit 5',
                message: 'Test configuration ready'
            },
            logs
        };
    }

    private buildProject(buildTool: string, logs: string[]) {
        const buildCommand = buildTool === 'maven' ? 'mvn clean install' : 'gradle build';
        logs.push(`Build command: ${buildCommand}`);

        return {
            ok: true,
            output: {
                success: true,
                buildTool,
                buildCommand,
                message: `Use '${buildCommand}' to build the project`
            },
            logs
        };
    }
}
