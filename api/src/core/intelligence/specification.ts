/**
 * Structured Specification Types
 * Core types for parsing and handling long specifications with multiple interacting constraints
 */

export interface StructuredSpecification {
  specificationId: string;
  sourceText: string;
  requirements: Requirement[];
  constraints: Constraint[];
  implicitRequirements: ImplicitRequirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  constraintInteractions: ConstraintInteraction[];
  metadata: {
    extractedAt: number;
    extractorVersion: string;
    confidence: number;
  };
}

export interface Requirement {
  id: string; // REQ-001, REQ-002, etc.
  type: 'functional' | 'non-functional' | 'constraint';
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  acceptanceCriteria: string[]; // References to AcceptanceCriterion.id
  relatedRequirements: string[]; // Other requirement IDs
  implicit: boolean;
}

export interface Constraint {
  id: string; // CONST-001
  description: string;
  type: 'performance' | 'security' | 'availability' | 'compliance' | 'operational';
  relatedRequirements: string[];
  tensionWith: string[]; // Other constraint IDs in tension
}

export interface ImplicitRequirement {
  id: string; // IMP-001
  inferredFrom: string[]; // Requirement IDs that imply this
  description: string;
  confidence: number; // 0-1
  type: 'functional' | 'non-functional' | 'constraint';
}

export interface AcceptanceCriterion {
  id: string; // AC-001
  requirementId: string;
  description: string;
  testable: boolean;
  testType: 'unit' | 'integration' | 'e2e' | 'manual' | 'observability';
}

export interface ConstraintInteraction {
  constraintIds: string[];
  tensionType: 'performance_vs_security' | 'flexibility_vs_simplicity' | 'consistency_vs_availability' | 'custom';
  description: string;
  resolutionStrategy: string;
}

// Verification result types
export interface SpecificationVerificationResult {
  specificationId: string;
  overallPass: boolean;
  requirements: RequirementVerificationResult[];
  constraintTensions: ConstraintTensionVerificationResult[];
  implicitRequirements: ImplicitRequirementVerificationResult[];
  coverage: number;
}

export interface RequirementVerificationResult {
  requirementId: string;
  pass: boolean;
  implementedIn: string[]; // file paths
  verifiedBy: string[]; // test paths
  evidence: string;
  failedCriteria: string[];
}

export interface ConstraintTensionVerificationResult {
  constraintIds: string[];
  resolved: boolean;
  resolution: string;
  evidence: string;
}

export interface ImplicitRequirementVerificationResult {
  requirementId: string;
  pass: boolean;
  evidence: string;
}

// Phase planning types
export interface PhasePlan {
  phaseNumber: number;
  name: string;
  tasks: ExecutionTask[];
  requirementsCovered: string[];
}

export interface ExecutionTask {
  id: string;
  description: string;
  tool: string;
  agent: string;
  input: Record<string, any>;
  dependsOn: string[];
  requirementIds: string[];
  parallel?: boolean;
  reasoning?: string;
}

export interface RequirementTraceabilityEntry {
  requirementId: string;
  phaseNumber: number;
  taskIds: string[];
  verificationTaskId?: string;
  acceptanceCriteriaIds: string[];
}