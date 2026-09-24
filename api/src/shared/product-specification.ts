/**
 * ProductSpecification — The requirement-derived understanding of what the user wants built.
 *
 * This replaces the template-driven approach (detectAppKind → stockBlueprintFor → ENGINE_COMPONENT).
 * ProductSpecification is derived from the user's own words + repository evidence + project memory.
 * It must generalize to software categories that did not exist when Joe was written.
 */

export type UserPersona = {
  role: string;
  goals: string[];
  painPoints: string[];
  technicalLevel: 'novice' | 'intermediate' | 'expert';
};

export type EntitySpec = {
  name: string;
  displayName: string;
  description: string;
  attributes: EntityAttribute[];
  relationships: EntityRelationship[];
  lifecycle: 'persistent' | 'ephemeral' | 'cached';
  businessRules: string[];
};

export type EntityAttribute = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'reference' | 'json' | 'binary';
  required: boolean;
  unique: boolean;
  indexed: boolean;
  validation?: string;
  description: string;
  defaultValue?: any;
};

export type EntityRelationship = {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';
  targetEntity: string;
  foreignKey?: string;
  throughEntity?: string;
  description: string;
};

export type UserJourney = {
  name: string;
  actor: string;
  trigger: string;
  steps: JourneyStep[];
  successCriteria: string[];
  failureModes: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
};

export type JourneyStep = {
  action: string;
  screen?: string;
  apiCall?: string;
  decision?: string;
  expectedOutcome: string;
};

export type BusinessRule = {
  id: string;
  description: string;
  entities: string[];
  condition: string;
  action: 'enforce' | 'validate' | 'transform' | 'notify' | 'prevent';
  severity: 'error' | 'warning' | 'info';
  testable: boolean;
};

export type WorkflowSpec = {
  name: string;
  trigger: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  actors: string[];
};

export type WorkflowState = {
  name: string;
  description: string;
  isTerminal: boolean;
  allowedActions: string[];
};

export type WorkflowTransition = {
  from: string;
  to: string;
  condition: string;
  action?: string;
};

export type PermissionSpec = {
  role: string;
  resource: string;
  actions: ('create' | 'read' | 'update' | 'delete' | 'execute' | 'manage')[];
  conditions?: string;
};

export type FunctionalRequirement = {
  id: string;
  title: string;
  description: string;
  userJourney: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  acceptanceCriteria: string[];
  dependencies: string[];
};

export type NonFunctionalRequirement = {
  category: 'performance' | 'security' | 'usability' | 'reliability' | 'scalability' | 'accessibility' | 'maintainability' | 'compliance';
  requirement: string;
  metric?: string;
  target?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
};

export type IntegrationSpec = {
  name: string;
  type: 'api' | 'database' | 'messageQueue' | 'fileStorage' | 'auth' | 'payment' | 'email' | 'sms' | 'analytics' | 'other';
  provider?: string;
  contract?: string;
  authMethod?: string;
  dataFlow: 'inbound' | 'outbound' | 'bidirectional';
  criticality: 'critical' | 'high' | 'medium' | 'low';
};

export type UXExpectation = {
  aspect: 'layout' | 'navigation' | 'forms' | 'feedback' | 'visualDesign' | 'interaction' | 'accessibility' | 'responsive';
  expectation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  references?: string[];
};

export type VisualDomainExpectation = {
  domain: string;
  brandAttributes: string[];
  colorScheme?: string;
  typography?: string;
  imageryStyle?: string;
  toneOfVoice?: string;
  mustAvoid: string[];
};

export type Constraint = {
  type: 'technical' | 'business' | 'regulatory' | 'budget' | 'timeline' | 'team' | 'infrastructure';
  description: string;
  impact: 'blocks' | 'limits' | 'guides';
};

export type Assumption = {
  description: string;
  confidence: 'high' | 'medium' | 'low';
  validationNeeded: boolean;
  riskIfWrong: string;
};

export type UnansweredQuestion = {
  question: string;
  context: string;
  impact: 'blocks' | 'delays' | 'minor';
  suggestedResolution: string;
};

export type AcceptanceCriterion = {
  id: string;
  requirementId: string;
  description: string;
  testType: 'functional' | 'ui' | 'api' | 'performance' | 'security' | 'accessibility' | 'businessRule';
  given: string;
  when: string;
  then: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  automatable: boolean;
};

export interface ProductSpecification {
  // Identity
  productId: string;
  version: number;
  createdAt: number;
  updatedAt: number;

  // Core Understanding
  productGoal: string;
  productName: string;
  domain: string;
  targetUsers: UserPersona[];

  // Product Model
  entities: EntitySpec[];
  relationships: EntityRelationship[];
  userJourneys: UserJourney[];
  businessRules: BusinessRule[];
  workflows: WorkflowSpec[];
  permissions: PermissionSpec[];

  // Requirements
  functionalRequirements: FunctionalRequirement[];
  nonFunctionalRequirements: NonFunctionalRequirement[];
  integrations: IntegrationSpec[];

  // UX/Visual
  uxExpectations: UXExpectation[];
  visualDomainExpectations: VisualDomainExpectation[];

  // Constraints & Unknowns
  constraints: Constraint[];
  assumptions: Assumption[];
  unansweredQuestions: UnansweredQuestion[];

  // Acceptance
  acceptanceCriteria: AcceptanceCriterion[];

  // Evolution
  changeLog: ChangeEntry[];
}

export type ChangeEntry = {
  timestamp: number;
  author: 'productAnalyst' | 'architect' | 'implementation' | 'user';
  changeType: 'added' | 'modified' | 'removed' | 'clarified';
  field: string;
  previousValue?: any;
  newValue?: any;
  reason: string;
};

/**
 * Evidence used to derive ProductSpecification
 */
export interface ProductEvidence {
  userRequest: string;
  repositoryEvidence?: RepositoryEvidence;
  projectMemory?: ProjectMemory;
  userConstraints?: string[];
}

export interface RepositoryEvidence {
  existingProjects: ExistingProject[];
  patterns: CodePattern[];
  techStack: TechStackElement[];
}

export interface ExistingProject {
  name: string;
  path: string;
  type: string;
  entities: string[];
  techStack: string[];
  relevance: number;
}

export interface CodePattern {
  pattern: string;
  frequency: number;
  examples: string[];
}

export interface TechStackElement {
  category: 'language' | 'framework' | 'database' | 'orm' | 'build' | 'test' | 'deployment';
  technology: string;
  version?: string;
  confidence: number;
}

export interface ProjectMemory {
  previousProducts: PreviousProduct[];
  userPreferences: UserPreference[];
  architecturalDecisions: ArchitecturalDecision[];
}

export interface PreviousProduct {
  productId: string;
  productName: string;
  domain: string;
  keyEntities: string[];
  architecturalPattern: string;
  lessonsLearned: string[];
}

export interface UserPreference {
  category: string;
  preference: string;
  confidence: number;
}

export interface ArchitecturalDecision {
  decision: string;
  rationale: string;
  alternatives: string[];
  timestamp: number;
}

/**
 * Result of ProductAnalyst analysis
 */
export interface ProductAnalysisResult {
  productSpecification: ProductSpecification;
  clarificationGate?: ClarificationGate;
  confidence: number;
  derivationNotes: string[];
}

export interface ClarificationGate {
  required: boolean;
  questions: ClarificationQuestion[];
  reason: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  context: string;
  impact: 'blocks' | 'delays' | 'minor';
  options?: string[];
  defaultAnswer?: string;
}