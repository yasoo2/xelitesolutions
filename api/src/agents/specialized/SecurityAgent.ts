import { GenesisAgent } from '../GenesisAgent';
import { TaskExecutor } from '../TaskExecutor';

export class SecurityAgent {
    private genesis: GenesisAgent;

    constructor() {
        this.genesis = new GenesisAgent();
    }

    async orchestrate(goal: string) {
        console.log(`[SecurityAgent] 🛡️ Starting audit: "${goal}"`);

        // Enrich goal with Security Persona
        const securityContext = `
        ROLE: Security Engineer (SecOps).
        FOCUS: OWASP Top 10, Dependency Vulnerabilities, Secrets Management, Static Analysis.
        TOOLS: sonar_analysis, dependency_auditor, security_scanner, browser_run (for pentest).
        
        GOAL: ${goal}
        `;

        return this.genesis.orchestrate(securityContext);
    }
}
