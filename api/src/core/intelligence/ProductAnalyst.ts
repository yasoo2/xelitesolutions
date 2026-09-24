/**
 * ProductAnalyst — Derives ProductSpecification from user request + evidence.
 *
 * This is the primary intelligence component that replaces template selection.
 * It uses the LLM to genuinely understand what the user wants built,
 * rather than mapping to predefined archetypes.
 */

import { callLLM } from '../../core/llm';
import { isProviderFailure, routeToModel } from '../../core/llm/intelligent-router';
import { workspaceService } from '../../modules/services/WorkspaceService';
import { readJoeProjectForRun } from '../../api/page-store';
import { EngineeringEvidence } from '../../modules/tools/definitions/EngineeringDiscoveryTool';
import {
  ProductSpecification,
  ProductEvidence,
  ProductAnalysisResult,
  ClarificationGate,
  ClarificationQuestion,
  ChangeEntry,
  UserPersona,
  EntitySpec,
  EntityAttribute,
  EntityRelationship,
  UserJourney,
  JourneyStep,
  BusinessRule,
  WorkflowSpec,
  WorkflowState,
  WorkflowTransition,
  PermissionSpec,
  FunctionalRequirement,
  NonFunctionalRequirement,
  IntegrationSpec,
  UXExpectation,
  VisualDomainExpectation,
  Constraint,
  Assumption,
  UnansweredQuestion,
  AcceptanceCriterion,
} from '../../shared/product-specification';

const SYSTEM_PROMPT = `You are a Senior Product Analyst. Your job is to deeply understand a user's software request and produce a comprehensive ProductSpecification.

You do NOT select from predefined templates or archetypes. You derive the specification from the user's own words, the repository evidence, and project memory.

OUTPUT: Valid JSON matching the ProductSpecification schema exactly. No prose, no markdown.

CRITICAL RULES:
1. Every entity, journey, rule, requirement must come from the user's request or evidence — NEVER invent.
2. If something is ambiguous, mark it in unansweredQuestions with impact="blocks" — this triggers a clarification gate.
3. The productName must come from the user's language, not a generic label.
4. Domain is whatever the user describes — not a fixed catalog.
5. Visual/domain expectations must reflect the specific business (perfume store ≠ dental clinic ≠ game).
6. Business rules are the user's stated constraints, not generic CRUD rules.
7. Acceptance criteria must be testable and traced to specific requirements.
8. If the request is too vague to produce a meaningful spec, set clarificationGate.required=true with specific questions.

ENTITY ATTRIBUTES: Use specific types (string, number, boolean, date, datetime, enum, reference, json, binary). Mark required/unique/indexed based on what the user implies.

RELATIONSHIPS: Only include what the user explicitly describes or what is logically necessary for their journeys.

USER JOURNEYS: Each journey must have a clear actor, trigger, steps, and success criteria derived from the request.

BUSINESS RULES: These are invariants the user states or that are logically necessary. Each must be testable.

ACCEPTANCE CRITERIA: Use Gherkin-style (given/when/then). Each must trace to a functional requirement.

UNANSWERED QUESTIONS: Be honest about what you cannot determine. These become clarification gates.

VISUAL/DOMAIN: A luxury perfume store has different expectations than a dental clinic. Capture this specifically.`;

const CLARIFICATION_PROMPT = `The user's request is too ambiguous to produce a meaningful ProductSpecification.

Your job: Generate specific, targeted clarification questions that will unblock the analysis.

Output: JSON with clarificationGate.required=true and specific questions.

Each question must:
- Reference something specific from the user's request
- Explain why it blocks the analysis
- Provide sensible options where applicable
- Have clear impact assessment`;

export class ProductAnalyst {
  private sessionId: string;
  private workspaceId: string;
  private runId: string;

  constructor(sessionId: string, workspaceId: string, runId: string) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.runId = runId;
  }

  async analyze(userRequest: string, context?: { evidence?: ProductEvidence }): Promise<ProductAnalysisResult> {
    const evidence = await this.gatherEvidence(userRequest, context?.evidence);
    const derivationNotes: string[] = [];

    // First, check if we can produce a spec directly or need clarification
    const initialAnalysis = await this.performAnalysis(userRequest, evidence, derivationNotes);

    if (initialAnalysis.clarificationGate?.required) {
      return {
        productSpecification: this.createMinimalSpec(userRequest),
        clarificationGate: initialAnalysis.clarificationGate,
        confidence: 0.3,
        derivationNotes,
      };
    }

    return {
      productSpecification: initialAnalysis.productSpecification,
      confidence: initialAnalysis.confidence,
      derivationNotes,
    };
  }

  private async gatherEvidence(userRequest: string, providedEvidence?: ProductEvidence): Promise<ProductEvidence> {
    const workspaceRoot = workspaceService.getActiveRoot(this.workspaceId);
    const sessionKey = this.sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const activeProject = readJoeProjectForRun(sessionKey, this.runId);

    // Gather repository evidence
    const existingProjects = await this.discoverExistingProjects(workspaceRoot);
    const patterns = await this.extractCodePatterns(existingProjects);
    const techStack = await this.detectTechStack(workspaceRoot);

    // Gather project memory (simplified for now)
    const projectMemory = await this.loadProjectMemory();

    return {
      userRequest,
      repositoryEvidence: {
        existingProjects,
        patterns,
        techStack,
      },
      projectMemory,
      userConstraints: this.extractConstraints(userRequest),
      ...providedEvidence,
    };
  }

  private async discoverExistingProjects(workspaceRoot: string): Promise<any[]> {
    // Simplified - in reality would scan workspace for projects
    const projects: any[] = [];
    try {
      const fs = require('fs');
      const path = require('path');
      if (fs.existsSync(workspaceRoot)) {
        const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const projectPath = path.join(workspaceRoot, entry.name);
            if (fs.existsSync(path.join(projectPath, 'package.json'))) {
              const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
              projects.push({
                name: entry.name,
                path: projectPath,
                type: this.inferProjectType(pkg),
                entities: [],
                techStack: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }),
                relevance: 0.5,
              });
            }
          }
        }
      }
    } catch { /* ignore */ }
    return projects;
  }

  private inferProjectType(pkg: any): string {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.react || deps.vue || deps.svelte) return 'frontend';
    if (deps.express || deps.fastify || deps.nest) return 'backend';
    if (deps.next || deps.nuxt || deps.remix) return 'fullstack';
    return 'unknown';
  }

  private async extractCodePatterns(projects: any[]): Promise<any[]> {
    // Simplified - would analyze actual code in real implementation
    return [];
  }

  private async detectTechStack(workspaceRoot: string): Promise<any[]> {
    const stack: any[] = [];
    try {
      const fs = require('fs');
      const path = require('path');
      const rootPkgPath = path.join(workspaceRoot, 'package.json');
      if (fs.existsSync(rootPkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, version] of Object.entries(deps)) {
          stack.push({
            category: this.categorizeDep(name),
            technology: name,
            version: version as string,
            confidence: 0.8,
          });
        }
      }
    } catch { /* ignore */ }
    return stack;
  }

  private categorizeDep(name: string): string {
    const frontend = ['react', 'vue', 'svelte', 'next', 'nuxt', 'remix', 'vite'];
    const backend = ['express', 'fastify', 'nest', 'koa', 'hapi'];
    const db = ['mongoose', 'prisma', 'typeorm', 'sequelize', 'knex', 'pg', 'mysql2'];
    const test = ['jest', 'vitest', 'mocha', 'cypress', 'playwright'];
    const build = ['webpack', 'rollup', 'esbuild', 'tsc', 'swc'];
    
    if (frontend.some(f => name.includes(f))) return 'framework';
    if (backend.some(b => name.includes(b))) return 'backend';
    if (db.some(d => name.includes(d))) return 'database';
    if (test.some(t => name.includes(t))) return 'test';
    if (build.some(b => name.includes(b))) return 'build';
    return 'other';
  }

  private async loadProjectMemory(): Promise<any> {
    // Would load from longTermMemory in real implementation
    return {
      previousProducts: [],
      userPreferences: [],
      architecturalDecisions: [],
    };
  }

  private extractConstraints(request: string): string[] {
    const constraints: string[] = [];
    const lower = request.toLowerCase();
    if (/(?:without|no|don't|never)\s+(?:build|create|deploy|publish|external|api)/i.test(request)) {
      constraints.push('no_external_deployment');
    }
    if (/(?:local|offline|no\s+(?:server|backend|database))/i.test(request)) {
      constraints.push('local_only');
    }
    if (/(?:read[- ]?only|without\s+(?:changing|modifying|writing))/i.test(request)) {
      constraints.push('read_only');
    }
    return constraints;
  }

  private async performAnalysis(
    userRequest: string,
    evidence: ProductEvidence,
    derivationNotes: string[]
  ): Promise<{ productSpecification: ProductSpecification; clarificationGate?: ClarificationGate; confidence: number }> {
    // Build context for LLM
    const context = this.buildAnalysisContext(userRequest, evidence);
    derivationNotes.push('Built analysis context with request, repository evidence, project memory');

    // Call LLM for deep analysis
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ];

    let response: string;
    try {
      response = await routeToModel(messages, undefined, undefined, undefined, undefined, undefined, undefined, {
        purpose: 'internal',
        sessionId: this.sessionId,
        runId: this.runId,
        workspaceId: this.workspaceId,
        engineeringPipeline: true,
        providerTimeoutMs: 120000,
        maxCompletionTokens: 12000,
        reasoningEffort: 'high',
      });
    } catch (error) {
      derivationNotes.push(`LLM call failed: ${error}`);
      return this.fallbackAnalysis(userRequest, evidence, derivationNotes);
    }

    if (isProviderFailure(response)) {
      derivationNotes.push('Provider failure, using fallback');
      return this.fallbackAnalysis(userRequest, evidence, derivationNotes);
    }

    // Parse LLM response
    let spec: ProductSpecification;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      spec = JSON.parse(jsonMatch[0]);
      derivationNotes.push('Parsed LLM response as ProductSpecification');
    } catch (parseError) {
      derivationNotes.push(`Failed to parse LLM response: ${parseError}`);
      return this.fallbackAnalysis(userRequest, evidence, derivationNotes);
    }

    // Validate and enrich
    spec = this.validateAndEnrich(spec, userRequest, evidence, derivationNotes);

    // Check for clarification needs
    const clarificationGate = this.checkClarificationNeeded(spec, userRequest, evidence);
    
    const confidence = clarificationGate?.required ? 0.3 : this.calculateConfidence(spec, evidence);

    return { productSpecification: spec, clarificationGate, confidence };
  }

  private buildAnalysisContext(userRequest: string, evidence: ProductEvidence): string {
    const parts: string[] = [
      `USER REQUEST: ${userRequest}`,
      '',
      '=== REPOSITORY EVIDENCE ===',
    ];

    if (evidence.repositoryEvidence?.existingProjects?.length) {
      parts.push('Existing Projects:');
      for (const p of evidence.repositoryEvidence.existingProjects) {
        parts.push(`  - ${p.name} (${p.type}): ${p.techStack.slice(0, 5).join(', ')}`);
      }
    }

    if (evidence.repositoryEvidence?.techStack?.length) {
      parts.push('Tech Stack:');
      for (const t of evidence.repositoryEvidence.techStack) {
        parts.push(`  - ${t.category}: ${t.technology}@${t.version} (confidence: ${t.confidence})`);
      }
    }

    if (evidence.projectMemory?.previousProducts?.length) {
      parts.push('Previous Products:');
      for (const p of evidence.projectMemory.previousProducts) {
        parts.push(`  - ${p.productName} (${p.domain}): ${p.keyEntities.join(', ')} [${p.architecturalPattern}]`);
      }
    }

    if (evidence.projectMemory?.userPreferences?.length) {
      parts.push('User Preferences:');
      for (const pref of evidence.projectMemory.userPreferences) {
        parts.push(`  - ${pref.category}: ${pref.preference}`);
      }
    }

    if (evidence.userConstraints?.length) {
      parts.push('User Constraints:');
      for (const c of evidence.userConstraints) parts.push(`  - ${c}`);
    }

    parts.push('', '=== INSTRUCTIONS ===', 'Produce a complete ProductSpecification JSON. Be specific. No templates.');

    return parts.join('\n');
  }

  private validateAndEnrich(
    spec: Partial<ProductSpecification>,
    userRequest: string,
    evidence: ProductEvidence,
    derivationNotes: string[]
  ): ProductSpecification {
    const now = Date.now();
    const productId = `prod_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Ensure required fields with sensible defaults
    const enriched: ProductSpecification = {
      productId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      productGoal: spec.productGoal || userRequest,
      productName: spec.productName || this.extractProductName(userRequest),
      domain: spec.domain || this.inferDomain(userRequest),
      targetUsers: spec.targetUsers || this.inferTargetUsers(userRequest),
      entities: spec.entities || [],
      relationships: spec.relationships || [],
      userJourneys: spec.userJourneys || [],
      businessRules: spec.businessRules || [],
      workflows: spec.workflows || [],
      permissions: spec.permissions || [],
      functionalRequirements: spec.functionalRequirements || [],
      nonFunctionalRequirements: spec.nonFunctionalRequirements || [],
      integrations: spec.integrations || [],
      uxExpectations: spec.uxExpectations || [],
      visualDomainExpectations: spec.visualDomainExpectations || [],
      constraints: spec.constraints || [],
      assumptions: spec.assumptions || [],
      unansweredQuestions: spec.unansweredQuestions || [],
      acceptanceCriteria: spec.acceptanceCriteria || [],
      changeLog: spec.changeLog || [{
        timestamp: now,
        author: 'productAnalyst',
        changeType: 'added',
        field: 'initial',
        newValue: 'created from user request',
        reason: 'Initial product specification derived from user request',
      }],
    };

    derivationNotes.push('Validated and enriched ProductSpecification with defaults');
    return enriched;
  }

  private extractProductName(request: string): string {
    // Try to extract a product name from the request
    const patterns = [
      /(?:build|create|make|develop)\s+(?:a|an|my)\s+([^,\.]+?)(?:\s+(?:with|that|for|to|,|\.|$))/i,
      /(?:called|named)\s+["']?([^"',.]+)["']?/i,
      /^([^:]{3,50}):/,
    ];
    for (const pattern of patterns) {
      const match = request.match(pattern);
      if (match?.[1]) {
        return match[1].trim().slice(0, 60);
      }
    }
    return 'Unnamed Product';
  }

  private inferDomain(request: string): string {
    const domains = [
      { keywords: ['perfume', 'fragrance', 'scent', 'beauty', 'cosmetic'], domain: 'beauty/fragrance e-commerce' },
      { keywords: ['dental', 'clinic', 'patient', 'appointment', 'dentist', 'treatment'], domain: 'healthcare/dental' },
      { keywords: ['educational', 'game', 'children', 'kids', 'learning', 'letters', 'numbers'], domain: 'educational technology' },
      { keywords: ['e-commerce', 'store', 'shop', 'cart', 'checkout', 'product'], domain: 'e-commerce' },
      { keywords: ['management', 'system', 'dashboard', 'admin', 'crm', 'erp'], domain: 'business management' },
      { keywords: ['logistics', 'fleet', 'delivery', 'shipping', 'warehouse'], domain: 'logistics' },
      { keywords: ['booking', 'reservation', 'schedule', 'calendar'], domain: 'booking/scheduling' },
    ];
    const lower = request.toLowerCase();
    for (const d of domains) {
      if (d.keywords.some(k => lower.includes(k))) return d.domain;
    }
    return 'custom application';
  }

  private inferTargetUsers(request: string): UserPersona[] {
    const lower = request.toLowerCase();
    const personas: UserPersona[] = [];

    if (/(?:customer|client|buyer|shopper|user)/i.test(request)) {
      personas.push({
        role: 'Customer',
        goals: ['Browse products', 'Make purchases', 'Track orders'],
        painPoints: ['Complex navigation', 'Slow checkout'],
        technicalLevel: 'novice',
      });
    }
    if (/(?:admin|manager|owner|staff|employee|dentist|doctor|receptionist)/i.test(request)) {
      personas.push({
        role: 'Staff/Admin',
        goals: ['Manage data', 'View reports', 'Process orders'],
        painPoints: ['Manual entry', 'No real-time updates'],
        technicalLevel: 'intermediate',
      });
    }
    if (/(?:child|kid|student|learner|player)/i.test(request)) {
      personas.push({
        role: 'Child/Learner',
        goals: ['Learn', 'Play', 'Progress'],
        painPoints: ['Boring content', 'Too difficult'],
        technicalLevel: 'novice',
      });
    }
    return personas.length > 0 ? personas : [{
      role: 'User',
      goals: ['Use the application'],
      painPoints: [],
      technicalLevel: 'intermediate',
    }];
  }

  private checkClarificationNeeded(
    spec: ProductSpecification,
    userRequest: string,
    evidence: ProductEvidence
  ): ClarificationGate | undefined {
    const questions: ClarificationQuestion[] = [];

    // If no entities and request implies data
    if (spec.entities.length === 0 && /\b(data|record|store|save|manage|track)\b/i.test(userRequest)) {
      questions.push({
        id: 'entities_needed',
        question: 'What specific data entities should the system manage? (e.g., patients, products, appointments, users)',
        context: 'Your request implies data management but no specific entities were identified.',
        impact: 'blocks',
        options: [],
      });
    }

    // If no user journeys
    if (spec.userJourneys.length === 0) {
      questions.push({
        id: 'journeys_needed',
        question: 'What are the key user workflows? (e.g., "customer browses → adds to cart → checks out")',
        context: 'No clear user journeys could be derived from the request.',
        impact: 'blocks',
      });
    }

    // If domain is generic
    if (spec.domain === 'custom application' || spec.domain === 'unknown') {
      questions.push({
        id: 'domain_clarification',
        question: 'What industry or domain is this for? (e.g., healthcare, e-commerce, education, logistics)',
        context: 'The domain affects architecture, compliance, and UX decisions.',
        impact: 'delays',
      });
    }

    if (questions.length > 0) {
      return {
        required: true,
        questions,
        reason: 'Critical ambiguities prevent generating a meaningful product specification.',
      };
    }

    return undefined;
  }

  private calculateConfidence(spec: ProductSpecification, evidence: ProductEvidence): number {
    let confidence = 0.5;
    
    if (spec.entities.length > 0) confidence += 0.1;
    if (spec.userJourneys.length > 0) confidence += 0.15;
    if (spec.businessRules.length > 0) confidence += 0.1;
    if (spec.functionalRequirements.length > 0) confidence += 0.1;
    if (spec.acceptanceCriteria.length > 0) confidence += 0.1;
    if (evidence.repositoryEvidence?.existingProjects?.length) confidence += 0.05;
    if (spec.unansweredQuestions.length === 0) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  private fallbackAnalysis(
    userRequest: string,
    evidence: ProductEvidence,
    derivationNotes: string[]
  ): { productSpecification: ProductSpecification; clarificationGate?: ClarificationGate; confidence: number } {
    derivationNotes.push('Using fallback heuristic analysis (LLM unavailable)');
    
    // Minimal heuristic-based spec as last resort
    const spec = this.createMinimalSpec(userRequest);
    
    // Still try to extract basic info
    spec.domain = this.inferDomain(userRequest);
    spec.targetUsers = this.inferTargetUsers(userRequest);
    spec.productName = this.extractProductName(userRequest);
    
    const clarificationGate = this.checkClarificationNeeded(spec, userRequest, evidence);
    
    return {
      productSpecification: spec,
      clarificationGate,
      confidence: 0.2,
    };
  }

  private createMinimalSpec(userRequest: string): ProductSpecification {
    const now = Date.now();
    return {
      productId: `prod_${now}_${Math.random().toString(36).slice(2, 8)}`,
      version: 1,
      createdAt: now,
      updatedAt: now,
      productGoal: userRequest,
      productName: this.extractProductName(userRequest),
      domain: 'unknown',
      targetUsers: [{ role: 'User', goals: [], painPoints: [], technicalLevel: 'intermediate' }],
      entities: [],
      relationships: [],
      userJourneys: [],
      businessRules: [],
      workflows: [],
      permissions: [],
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      integrations: [],
      uxExpectations: [],
      visualDomainExpectations: [],
      constraints: [],
      assumptions: [],
      unansweredQuestions: [],
      acceptanceCriteria: [],
      changeLog: [{
        timestamp: now,
        author: 'productAnalyst',
        changeType: 'added',
        field: 'initial',
        newValue: 'minimal fallback spec',
        reason: 'LLM unavailable, created minimal specification',
      }],
    };
  }
}