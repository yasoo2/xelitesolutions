# FULL SOURCE FILE INSPECTION REPORT

- **Total Discovered TypeScript Source Files (api/src):** 267
- **Total Inspected Source Files:** 267
- **Total Skipped Files:** 0

---

## FILE-BY-FILE INSPECTION BREAKDOWN

### 1. `api/src/api/app.ts`
- **Lines of Code:** 249
- **Import Dependencies:** 34
- **Exported Symbols:** `export const createApp`

### 2. `api/src/api/approvals/context.ts`
- **Lines of Code:** 9
- **Import Dependencies:** 0
- **Exported Symbols:** `export const planContext`

### 3. `api/src/api/controllers/sessionController.ts`
- **Lines of Code:** 531
- **Import Dependencies:** 9
- **Exported Symbols:** `export async function createSession`, `export function updateMockSessionTitle`, `export async function listSessions`, `export async function deleteSession`, `export async function deleteAllSessions`, `export async function togglePin`, `export async function moveSession`, `export async function addMessage`, `export function isAutoTitleCandidate`, `export async function updateSecrets`, `export async function listSessionMessages`, `export async function searchSessions`

### 4. `api/src/api/index.ts`
- **Lines of Code:** 142
- **Import Dependencies:** 13
- **Exported Symbols:** _Internal / Side-effect module_

### 5. `api/src/api/middleware/auth.ts`
- **Lines of Code:** 97
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface AuthPayload`, `export interface AuthenticatedRequest`, `export function authenticate`, `export function authenticateOptional`, `export function requireSuperAdmin`

### 6. `api/src/api/middleware/workspace.ts`
- **Lines of Code:** 59
- **Import Dependencies:** 4
- **Exported Symbols:** `export interface WorkspaceRequest`, `export async function requireWorkspace`

### 7. `api/src/api/routes/admin.ts`
- **Lines of Code:** 323
- **Import Dependencies:** 13
- **Exported Symbols:** _Internal / Side-effect module_

### 8. `api/src/api/routes/agent.ts`
- **Lines of Code:** 88
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 9. `api/src/api/routes/approvals.ts`
- **Lines of Code:** 227
- **Import Dependencies:** 10
- **Exported Symbols:** _Internal / Side-effect module_

### 10. `api/src/api/routes/assets.ts`
- **Lines of Code:** 60
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 11. `api/src/api/routes/auth.ts`
- **Lines of Code:** 508
- **Import Dependencies:** 7
- **Exported Symbols:** _Internal / Side-effect module_

### 12. `api/src/api/routes/browser.ts`
- **Lines of Code:** 174
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 13. `api/src/api/routes/build.ts`
- **Lines of Code:** 71
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 14. `api/src/api/routes/files.ts`
- **Lines of Code:** 228
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 15. `api/src/api/routes/git.ts`
- **Lines of Code:** 253
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 16. `api/src/api/routes/github.ts`
- **Lines of Code:** 236
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 17. `api/src/api/routes/health.ts`
- **Lines of Code:** 164
- **Import Dependencies:** 1
- **Exported Symbols:** _Internal / Side-effect module_

### 18. `api/src/api/routes/knowledge.ts`
- **Lines of Code:** 63
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 19. `api/src/api/routes/memory.ts`
- **Lines of Code:** 35
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 20. `api/src/api/routes/packages.ts`
- **Lines of Code:** 143
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 21. `api/src/api/routes/ping-deploy.ts`
- **Lines of Code:** 122
- **Import Dependencies:** 4
- **Exported Symbols:** _Internal / Side-effect module_

### 22. `api/src/api/routes/project.ts`
- **Lines of Code:** 581
- **Import Dependencies:** 7
- **Exported Symbols:** _Internal / Side-effect module_

### 23. `api/src/api/routes/providers.ts`
- **Lines of Code:** 280
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 24. `api/src/api/routes/run.ts`
- **Lines of Code:** 91
- **Import Dependencies:** 9
- **Exported Symbols:** _Internal / Side-effect module_

### 25. `api/src/api/routes/sentinel.ts`
- **Lines of Code:** 125
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 26. `api/src/api/routes/servers.ts`
- **Lines of Code:** 231
- **Import Dependencies:** 4
- **Exported Symbols:** _Internal / Side-effect module_

### 27. `api/src/api/routes/sessions.ts`
- **Lines of Code:** 42
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 28. `api/src/api/routes/system.ts`
- **Lines of Code:** 27
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 29. `api/src/api/routes/tools.ts`
- **Lines of Code:** 98
- **Import Dependencies:** 9
- **Exported Symbols:** _Internal / Side-effect module_

### 30. `api/src/api/routes/webhooks.ts`
- **Lines of Code:** 100
- **Import Dependencies:** 4
- **Exported Symbols:** _Internal / Side-effect module_

### 31. `api/src/api/routes/workspaces.ts`
- **Lines of Code:** 95
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 32. `api/src/api/ws.ts`
- **Lines of Code:** 329
- **Import Dependencies:** 8
- **Exported Symbols:** `export function registerRunOwner`, `export function registerSessionOwner`, `export function registerTerminalOwner`, `export type LiveEventType`, `export interface LiveEvent`, `export function attachWebSocket`, `export function broadcast`, `export function broadcastThinkingPhase`, `export function broadcastThinkingDetail`

### 33. `api/src/core/agents/ArchitectAgent.ts`
- **Lines of Code:** 160
- **Import Dependencies:** 3
- **Exported Symbols:** `export class ArchitectAgent`

### 34. `api/src/core/agents/autonomous-decision-maker.ts`
- **Lines of Code:** 194
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface DecisionContext`, `export interface Decision`, `export class AutonomousDecisionMaker`, `export const autonomousDecisionMaker`

### 35. `api/src/core/agents/AutonomousLoopEngine.ts`
- **Lines of Code:** 436
- **Import Dependencies:** 4
- **Exported Symbols:** `export interface LoopConfig`, `export interface LoopTask`, `export interface LoopState`, `export interface LoopResult`, `export class AutonomousLoopEngine`, `export async function buildUntilSuccess`

### 36. `api/src/core/agents/intelligent-retry-system.ts`
- **Lines of Code:** 269
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface Task`, `export interface ErrorPattern`, `export interface Fix`, `export interface RootCause`, `export interface RetryStrategy`, `export class IntelligentRetrySystem`, `export const intelligentRetrySystem`

### 37. `api/src/core/agents/JoeAgent-V2.ts`
- **Lines of Code:** 100
- **Import Dependencies:** 2
- **Exported Symbols:** `export class JoeAgent`

### 38. `api/src/core/agents/JoeAgent.ts`
- **Lines of Code:** 291
- **Import Dependencies:** 5
- **Exported Symbols:** `export class JoeAgent`

### 39. `api/src/core/agents/orchestrator.ts`
- **Lines of Code:** 146
- **Import Dependencies:** 0
- **Exported Symbols:** `export const orchestrator`

### 40. `api/src/core/agents/progress-persistence.ts`
- **Lines of Code:** 310
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface ProjectState`, `export interface Checkpoint`, `export interface RecoveryResult`, `export class ProgressPersistence`, `export const progressPersistence`

### 41. `api/src/core/agents/ProjectManagerAgent.ts`
- **Lines of Code:** 230
- **Import Dependencies:** 6
- **Exported Symbols:** `export class ProjectManagerAgent`

### 42. `api/src/core/agents/realtime-validator.ts`
- **Lines of Code:** 268
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface Step`, `export interface StepResult`, `export interface Issue`, `export interface Validation`, `export interface ValidationResult`, `export class RealtimeValidator`, `export const realtimeValidator`

### 43. `api/src/core/agents/TaskExecutor.ts`
- **Lines of Code:** 135
- **Import Dependencies:** 4
- **Exported Symbols:** `export interface TaskStep`, `export class TaskExecutor`

### 44. `api/src/core/intelligence/context-analyzer.ts`
- **Lines of Code:** 257
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface ConversationContext`, `export function analyzeContext`

### 45. `api/src/core/intelligence/IntentParser.ts`
- **Lines of Code:** 101
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface StructuredIntent`, `export class IntentParser`

### 46. `api/src/core/llm/context-engine.ts`
- **Lines of Code:** 361
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface ConversationContext`, `export interface ContextualIntent`, `export function extractEntities`, `export function analyzeContextualIntent`, `export function buildConversationContext`, `export function matchPatternWithContext`

### 47. `api/src/core/llm/free-intelligence-optimizer.ts`
- **Lines of Code:** 588
- **Import Dependencies:** 2
- **Exported Symbols:** `export type OptimizationResult`, `export const freeIntelligenceOptimizer`, `export const generateSmartResponse`

### 48. `api/src/core/llm/intelligent-router.ts`
- **Lines of Code:** 1052
- **Import Dependencies:** 6
- **Exported Symbols:** `export interface ModelConfig`, `export function flattenMultimodalMessages`, `export const MODELS`, `export async function advancedAnalyzeTask`, `export async function generateActionPlan`, `export interface TaskAnalysis`, `export function analyzeTask`, `export function selectBestModel`, `export async function routeToModel`, `export async function suggestCorrection`

### 49. `api/src/core/llm/multi-model-fallback.ts`
- **Lines of Code:** 192
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface ModelConfig`, `export interface ModelResponse`, `export interface Task`, `export class MultiModelFallback`, `export const Component`, `export const multiModelFallback`

### 50. `api/src/core/llm/providers/deepseek.ts`
- **Lines of Code:** 95
- **Import Dependencies:** 2
- **Exported Symbols:** `export const DEEPSEEK_MODELS`, `export class DeepSeekProvider`, `export const deepSeekProvider`

### 51. `api/src/core/llm/providers/gemini.ts`
- **Lines of Code:** 455
- **Import Dependencies:** 1
- **Exported Symbols:** `export class GeminiProvider`, `export const geminiProvider`

### 52. `api/src/core/llm/providers/groq.ts`
- **Lines of Code:** 57
- **Import Dependencies:** 0
- **Exported Symbols:** `export class GroqProvider`

### 53. `api/src/core/llm/providers/huggingface.ts`
- **Lines of Code:** 61
- **Import Dependencies:** 1
- **Exported Symbols:** `export const HUGGINGFACE_MODELS`, `export class HuggingFaceProvider`

### 54. `api/src/core/llm/providers/local.ts`
- **Lines of Code:** 52
- **Import Dependencies:** 1
- **Exported Symbols:** `export class LocalProvider`

### 55. `api/src/core/llm/providers/openai.ts`
- **Lines of Code:** 65
- **Import Dependencies:** 1
- **Exported Symbols:** `export class OpenAIProvider`, `export const openAIProvider`

### 56. `api/src/core/llm/providers/openrouter.ts`
- **Lines of Code:** 117
- **Import Dependencies:** 1
- **Exported Symbols:** `export const OPENROUTER_MODELS`, `export class OpenRouterProvider`

### 57. `api/src/core/llm/providers/pollinations.ts`
- **Lines of Code:** 85
- **Import Dependencies:** 1
- **Exported Symbols:** `export const POLLINATIONS_MODELS`, `export class PollinationsProvider`

### 58. `api/src/core/llm/providers/registry.ts`
- **Lines of Code:** 28
- **Import Dependencies:** 8
- **Exported Symbols:** `export const pollinationsProvider`, `export const openRouterProvider`, `export const huggingfaceProvider`, `export const groqProvider`, `export const localProvider`

### 59. `api/src/core/llm/smart-context-manager.ts`
- **Lines of Code:** 274
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface Message`, `export interface ContextSummary`, `export interface ContextStats`, `export class SmartContextManager`, `export const smartContextManager`

### 60. `api/src/core/llm/system-prompt.ts`
- **Lines of Code:** 49
- **Import Dependencies:** 0
- **Exported Symbols:** `export const BASE_SYSTEM_PROMPT`, `export const getSystemPrompt`

### 61. `api/src/core/llm/tool-picker.ts`
- **Lines of Code:** 79
- **Import Dependencies:** 1
- **Exported Symbols:** `export const MAX_PROVIDER_TOOLS`, `export const PRIORITY_TOOL_NAMES`, `export function selectToolDefsForProvider`

### 62. `api/src/core/llm/utils.ts`
- **Lines of Code:** 91
- **Import Dependencies:** 0
- **Exported Symbols:** `export function extractToolCallFromText`, `export function setDynamicOpenAIKey`, `export function getApiKeyForUser`, `export function getDynamicOpenAIKey`, `export function setActiveProvider`, `export function getActiveProvider`

### 63. `api/src/core/llm/weak-model-enhancer.ts`
- **Lines of Code:** 417
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface WeakModelStrategy`, `export interface EnhancedPrompt`, `export function analyzeTaskComplexity`, `export function breakDownLargeTask`, `export function createEnhancedPrompt`, `export class SelfCorrectionSystem`, `export class TemplateSystem`, `export const ComponentName`, `export interface InterfaceName`, `export interface IModel`, `export class IterativeRefinement`, `export const selfCorrectionSystem`, `export const templateSystem`, `export const iterativeRefinement`

### 64. `api/src/core/llm.ts`
- **Lines of Code:** 48
- **Import Dependencies:** 4
- **Exported Symbols:** `export async function callLLM`, `export async function generateSessionTitle`, `export async function planNextStep`

### 65. `api/src/core/memory/long-term-memory.ts`
- **Lines of Code:** 343
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface MemoryEntry`, `export interface UserProfile`, `export const longTermMemory`

### 66. `api/src/core/memory/VectorMemory.ts`
- **Lines of Code:** 169
- **Import Dependencies:** 4
- **Exported Symbols:** `export class VectorMemory`

### 67. `api/src/core/neural/index.ts`
- **Lines of Code:** 236
- **Import Dependencies:** 2
- **Exported Symbols:** `export const NEURAL_VERSION`, `export const NEURAL_STATES`, `export const NEURON_TYPES`, `export const isNeuralState`, `export const isNeuronType`, `export const getStateColor`, `export const getNeuronTypeColor`, `export interface NeuralSystemOptions`, `export interface NeuralSystem`, `export const createNeuralSystem`

### 68. `api/src/core/neural/NeuralCore.ts`
- **Lines of Code:** 968
- **Import Dependencies:** 1
- **Exported Symbols:** `export type NeuralState`, `export type NeuronType`, `export type SynapticStrength`, `export interface NeuralActivation`, `export interface Neuron`, `export interface Synapse`, `export interface Thought`, `export interface NeuralPathway`, `export interface MemoryEngram`, `export class NeuralNetwork`, `export const neuralCore`

### 69. `api/src/core/neural/NeuralIntegration.ts`
- **Lines of Code:** 661
- **Import Dependencies:** 4
- **Exported Symbols:** `export interface NeuralAgentConfig`, `export interface TaskExecutionPlan`, `export interface NeuralTaskStep`, `export interface ExecutionContext`, `export interface NeuralResponse`, `export class NeuralAgent`, `export interface CreateNeuralAgentOptions`, `export const createNeuralAgent`

### 70. `api/src/core/neural/NeuralStateManager.ts`
- **Lines of Code:** 681
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface StateTransition`, `export interface TransitionCondition`, `export interface StateContext`, `export interface StateSnapshot`, `export interface EmotionalState`, `export class NeuralStateManager`, `export const createStateManager`

### 71. `api/src/core/neural/NeuralVisualization.ts`
- **Lines of Code:** 678
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface VisualizationConfig`, `export interface NeuronVisual`, `export interface SynapseVisual`, `export interface ThoughtBubble`, `export interface HeatmapCell`, `export interface DecisionNode`, `export interface NeuralMetrics`, `export interface StreamEvent`, `export class NeuralVisualizer`, `export const createVisualizer`

### 72. `api/src/core/orchestrator/ExecutionMemory.ts`
- **Lines of Code:** 38
- **Import Dependencies:** 0
- **Exported Symbols:** `export class ExecutionMemory`

### 73. `api/src/core/orchestrator/PlanningEngine.ts`
- **Lines of Code:** 132
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface ExecutionStep`, `export interface ExecutionPlan`, `export class PlanningEngine`

### 74. `api/src/core/orchestrator/types.ts`
- **Lines of Code:** 98
- **Import Dependencies:** 0
- **Exported Symbols:** `export type JoeWorkflowMode`, `export type JoePhaseStatus`, `export type JoeRiskLevel`, `export interface JoeExecutionContext`, `export interface JoeTaskDefinition`, `export interface JoePhaseDefinition`, `export interface JoeWorkflowPlan`, `export interface JoeToolResult`, `export interface JoeTaskExecutionResult`, `export interface JoePhaseExecutionResult`, `export interface JoeQualityIssue`, `export interface JoeQualityGateResult`, `export interface JoeOrchestratorResult`, `export interface JoeToolExecutor`

### 75. `api/src/core/templates/EnterpriseTemplatesLibrary.ts`
- **Lines of Code:** 93
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface TemplateConfig`, `export interface Template`, `export class EnterpriseTemplatesLibrary`, `export const enterpriseTemplates`

### 76. `api/src/kernel/ExecutionEnforcer.ts`
- **Lines of Code:** 104
- **Import Dependencies:** 3
- **Exported Symbols:** `export class ExecutionEnforcer`

### 77. `api/src/kernel/ExecutionEngine.ts`
- **Lines of Code:** 484
- **Import Dependencies:** 6
- **Exported Symbols:** `export interface ExecutionRequest`, `export interface ExecutionResult`, `export interface ExecutionOptions`, `export interface ExecutionSession`, `export class ExecutionEngine`, `export const executionEngine`

### 78. `api/src/kernel/ExecutionGateway.ts`
- **Lines of Code:** 89
- **Import Dependencies:** 3
- **Exported Symbols:** `export class ExecutionGateway`

### 79. `api/src/kernel/ExecutionGuard.ts`
- **Lines of Code:** 79
- **Import Dependencies:** 1
- **Exported Symbols:** `export class ExecutionGuard`

### 80. `api/src/modules/browser/config.ts`
- **Lines of Code:** 30
- **Import Dependencies:** 0
- **Exported Symbols:** `export type BrowserConfig`, `export const DEFAULT_BROWSER_CONFIG`

### 81. `api/src/modules/browser/executor.ts`
- **Lines of Code:** 1168
- **Import Dependencies:** 8
- **Exported Symbols:** `export async function executePlannedActions`

### 82. `api/src/modules/browser/intelligence.ts`
- **Lines of Code:** 342
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface PageAnalysis`, `export interface InteractiveElement`, `export interface FormElement`, `export interface ArticleContent`, `export function analyzePage`, `export async function analyzePageVision`, `export function planInteraction`, `export function extractData`

### 83. `api/src/modules/browser/interactions.ts`
- **Lines of Code:** 518
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface Interaction`, `export interface NaturalMovement`, `export class AdvancedInteractionSystem`, `export const advancedInteractions`

### 84. `api/src/modules/browser/manager.ts`
- **Lines of Code:** 468
- **Import Dependencies:** 5
- **Exported Symbols:** `export function getBrowserViewport`, `export function getChromiumLaunchOptions`, `export async function screenshotSessionJpeg`, `export async function withBrowserConcurrency`, `export function touchSession`, `export async function createSession`, `export async function getBrowserSession`, `export function setStreamMask`, `export function startStreaming`, `export function stopStreaming`, `export async function stopSession`, `export async function healthcheckBrowser`

### 85. `api/src/modules/browser/runner.ts`
- **Lines of Code:** 1080
- **Import Dependencies:** 8
- **Exported Symbols:** `export function splitBrowserInstructionIntoStepsForDebug`, `export async function runBrowserInstruction`

### 86. `api/src/modules/browser/secrets.ts`
- **Lines of Code:** 145
- **Import Dependencies:** 1
- **Exported Symbols:** `export async function resolveSecretsInText`, `export function rewriteInlineLoginCredentialsToSecrets`, `export function redactSecretsFromString`

### 87. `api/src/modules/browser/types.ts`
- **Lines of Code:** 139
- **Import Dependencies:** 0
- **Exported Symbols:** `export type BrowserRunMode`, `export type BrowserRunRequest`, `export type FailureReason`, `export type StepEvent`, `export type StreamFrameEvent`, `export type CursorMoveEvent`, `export type HighlightBoxesEvent`, `export type SessionStatusEvent`, `export type ActionLogEvent`, `export type ActionFeedbackEvent`, `export type FinalReportEvent`, `export type FinalStatusEvent`, `export type DebugSnapshotEvent`, `export type BrowserWsEvent`, `export type ElementType`, `export type DetectedElement`, `export type PageData`

### 88. `api/src/modules/browser/wsHub.ts`
- **Lines of Code:** 165
- **Import Dependencies:** 5
- **Exported Symbols:** `export async function canAccessBrowserSession`, `export function attachBrowserWss`, `export function broadcastBrowserEvent`

### 89. `api/src/modules/codegen/large-scale-generator.ts`
- **Lines of Code:** 582
- **Import Dependencies:** 10
- **Exported Symbols:** `export interface CodeTemplate`, `export interface TemplateFile`, `export interface ProjectConfig`, `export const REACT_VITE_TEMPLATE`, `export const EXPRESS_API_TEMPLATE`, `export class LargeScaleCodeGenerator`, `export const codeGenerator`

### 90. `api/src/modules/enterprise/integration.ts`
- **Lines of Code:** 230
- **Import Dependencies:** 7
- **Exported Symbols:** `export interface EnhancedRequest`, `export interface EnhancedResponse`, `export async function processEnterpriseRequest`, `export async function enhanceAutoMode`

### 91. `api/src/modules/sentinel/services/SentinelActionRunner.ts`
- **Lines of Code:** 105
- **Import Dependencies:** 5
- **Exported Symbols:** `export class SentinelActionRunner`

### 92. `api/src/modules/sentinel/services/SentinelActionService.ts`
- **Lines of Code:** 67
- **Import Dependencies:** 4
- **Exported Symbols:** `export class SentinelActionService`

### 93. `api/src/modules/sentinel/services/SentinelAuditService.ts`
- **Lines of Code:** 59
- **Import Dependencies:** 2
- **Exported Symbols:** `export class SentinelAuditService`

### 94. `api/src/modules/sentinel/services/SentinelIncidentService.ts`
- **Lines of Code:** 76
- **Import Dependencies:** 3
- **Exported Symbols:** `export class SentinelIncidentService`

### 95. `api/src/modules/sentinel/services/SentinelPolicyEngine.ts`
- **Lines of Code:** 130
- **Import Dependencies:** 4
- **Exported Symbols:** `export interface TelemetryPayload`, `export interface SentinelAction`, `export class SentinelPolicyEngine`

### 96. `api/src/modules/services/AgentLoopService.ts`
- **Lines of Code:** 200
- **Import Dependencies:** 8
- **Exported Symbols:** `export class AgentLoopService`

### 97. `api/src/modules/services/AlertService.ts`
- **Lines of Code:** 93
- **Import Dependencies:** 3
- **Exported Symbols:** `export class AlertService`, `export const alertService`

### 98. `api/src/modules/services/BinaryService.ts`
- **Lines of Code:** 99
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface BinaryCheckResult`, `export class BinaryService`

### 99. `api/src/modules/services/CortexState.ts`
- **Lines of Code:** 113
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface TaskState`, `export interface FinancialState`, `export class CortexState`

### 100. `api/src/modules/services/DeployManager.ts`
- **Lines of Code:** 394
- **Import Dependencies:** 12
- **Exported Symbols:** `export class DeployManager`, `export const deployManager`

### 101. `api/src/modules/services/knowledge.ts`
- **Lines of Code:** 132
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface Document`, `export const KnowledgeService`

### 102. `api/src/modules/services/memory.ts`
- **Lines of Code:** 229
- **Import Dependencies:** 3
- **Exported Symbols:** `export class MemoryService`

### 103. `api/src/modules/services/notifications.ts`
- **Lines of Code:** 171
- **Import Dependencies:** 0
- **Exported Symbols:** `export type NotificationSeverity`, `export interface NotificationOptions`, `export async function sendSlackNotification`, `export async function sendDiscordNotification`, `export async function sendNotification`, `export async function notifyError`, `export async function notifyCritical`, `export async function notifyRecovery`

### 104. `api/src/modules/services/RepairTicketService.ts`
- **Lines of Code:** 92
- **Import Dependencies:** 0
- **Exported Symbols:** `export type RepairTicketSeverity`, `export interface RepairTicketInput`, `export interface RepairTicket`, `export class RepairTicketService`

### 105. `api/src/modules/services/secrets.ts`
- **Lines of Code:** 289
- **Import Dependencies:** 0
- **Exported Symbols:** `export async function setUserSecretEncrypted`, `export async function getUserSecret`, `export function setSessionSecret`, `export function getSessionSecret`, `export function clearSessionSecrets`, `export function setSessionSecretEncrypted`, `export async function setPendingTool`, `export async function popPendingTool`, `export function setSessionRunConfig`, `export function getSessionRunConfig`

### 106. `api/src/modules/services/SelfFixExecutionService.ts`
- **Lines of Code:** 139
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface SelfFixExecutionInput`, `export interface SelfFixExecutionResult`, `export class SelfFixExecutionService`

### 107. `api/src/modules/services/SelfFixService.ts`
- **Lines of Code:** 268
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface SelfFixPlan`, `export class SelfFixService`

### 108. `api/src/modules/services/ToolService.ts`
- **Lines of Code:** 610
- **Import Dependencies:** 10
- **Exported Symbols:** `export function formatToolError`, `export interface ToolContext`, `export async function executeTool`

### 109. `api/src/modules/services/TraceManager.ts`
- **Lines of Code:** 73
- **Import Dependencies:** 1
- **Exported Symbols:** `export type TraceEventKind`, `export interface TraceEvent`, `export interface Trace`, `export class TraceManager`, `export const traceManager`

### 110. `api/src/modules/services/vectorDb.ts`
- **Lines of Code:** 137
- **Import Dependencies:** 2
- **Exported Symbols:** `export class VectorDbService`, `export const vectorDb`

### 111. `api/src/modules/services/WorkspaceService.ts`
- **Lines of Code:** 447
- **Import Dependencies:** 9
- **Exported Symbols:** `export class WorkspaceService`, `export const workspaceService`

### 112. `api/src/modules/terminal/command-router.ts`
- **Lines of Code:** 118
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface CommandResult`, `export class CommandRouter`, `export const commandRouter`

### 113. `api/src/modules/terminal/ssh-manager.ts`
- **Lines of Code:** 248
- **Import Dependencies:** 4
- **Exported Symbols:** `export class SSHManager`, `export const sshManager`

### 114. `api/src/modules/terminal/terminal-kernel.ts`
- **Lines of Code:** 185
- **Import Dependencies:** 7
- **Exported Symbols:** `export class TerminalKernel`, `export const terminalKernel`

### 115. `api/src/modules/tools/base.ts`
- **Lines of Code:** 20
- **Import Dependencies:** 1
- **Exported Symbols:** _Internal / Side-effect module_

### 116. `api/src/modules/tools/definitions/AdvancedTools.ts`
- **Lines of Code:** 732
- **Import Dependencies:** 6
- **Exported Symbols:** `export class PatternRecognitionTool`, `export class AutoRefactorTool`, `export class TestGeneratorTool`, `export class PerformanceProfilerTool`, `export class DocumentationGeneratorTool`, `export const AdvancedTools`

### 117. `api/src/modules/tools/definitions/AIGeneratorTool.ts`
- **Lines of Code:** 150
- **Import Dependencies:** 3
- **Exported Symbols:** `export class AIGeneratorTool`

### 118. `api/src/modules/tools/definitions/AlertManagerTool.ts`
- **Lines of Code:** 282
- **Import Dependencies:** 1
- **Exported Symbols:** `export class AlertManagerTool`

### 119. `api/src/modules/tools/definitions/AnalysisTools.ts`
- **Lines of Code:** 226
- **Import Dependencies:** 7
- **Exported Symbols:** `export class AnalyzeProjectTool`, `export class AnalyzeCodebaseTool`, `export class ProjectDetectTool`

### 120. `api/src/modules/tools/definitions/ApiTesterTool.ts`
- **Lines of Code:** 99
- **Import Dependencies:** 1
- **Exported Symbols:** `export class ApiTesterTool`

### 121. `api/src/modules/tools/definitions/ArchitectTool.ts`
- **Lines of Code:** 39
- **Import Dependencies:** 2
- **Exported Symbols:** `export const ArchitectTool`

### 122. `api/src/modules/tools/definitions/ArchiveFilesTool.ts`
- **Lines of Code:** 192
- **Import Dependencies:** 4
- **Exported Symbols:** `export class ArchiveFilesTool`

### 123. `api/src/modules/tools/definitions/AuthBuilderTool.ts`
- **Lines of Code:** 435
- **Import Dependencies:** 13
- **Exported Symbols:** `export class AuthBuilderTool`, `export interface JWTPayload`, `export function generateToken`, `export function verifyToken`, `export function authMiddleware`, `export function optionalAuth`, `export function setupOAuth`, `export const sessionConfig`, `export function setupSession`, `export function requireSession`, `export function destroySession`, `export type Role`, `export const PERMISSIONS`, `export function hasRole`, `export function hasPermission`, `export function isAdmin`, `export function isModerator`, `export const authConfig`

### 124. `api/src/modules/tools/definitions/AutoTesterTool.ts`
- **Lines of Code:** 190
- **Import Dependencies:** 2
- **Exported Symbols:** `export class AutoTesterTool`

### 125. `api/src/modules/tools/definitions/BrowserActionTool.ts`
- **Lines of Code:** 201
- **Import Dependencies:** 7
- **Exported Symbols:** `export class BrowserActionTool`

### 126. `api/src/modules/tools/definitions/BrowserRunTool.ts`
- **Lines of Code:** 291
- **Import Dependencies:** 7
- **Exported Symbols:** `export class BrowserRunTool`

### 127. `api/src/modules/tools/definitions/BrowserVisionTool.ts`
- **Lines of Code:** 65
- **Import Dependencies:** 4
- **Exported Symbols:** `export class BrowserVisionTool`

### 128. `api/src/modules/tools/definitions/BulkFileGeneratorTool.ts`
- **Lines of Code:** 109
- **Import Dependencies:** 3
- **Exported Symbols:** `export const BulkFileGeneratorTool`

### 129. `api/src/modules/tools/definitions/CacheManagerTool.ts`
- **Lines of Code:** 191
- **Import Dependencies:** 2
- **Exported Symbols:** `export class CacheManagerTool`

### 130. `api/src/modules/tools/definitions/CentralAnswerTool.ts`
- **Lines of Code:** 76
- **Import Dependencies:** 2
- **Exported Symbols:** `export class CentralAnswerTool`

### 131. `api/src/modules/tools/definitions/CodebaseNavigatorTool.ts`
- **Lines of Code:** 137
- **Import Dependencies:** 4
- **Exported Symbols:** `export const CodebaseNavigatorTool`

### 132. `api/src/modules/tools/definitions/CodebaseOutlineTool.ts`
- **Lines of Code:** 94
- **Import Dependencies:** 4
- **Exported Symbols:** `export class CodebaseOutlineTool`

### 133. `api/src/modules/tools/definitions/CodeReviewerTool.ts`
- **Lines of Code:** 223
- **Import Dependencies:** 4
- **Exported Symbols:** `export class CodeReviewerTool`

### 134. `api/src/modules/tools/definitions/ContentTools.ts`
- **Lines of Code:** 154
- **Import Dependencies:** 3
- **Exported Symbols:** `export class HttpFetchTool`, `export class HtmlExtractTool`, `export class RssFetchTool`, `export class JsonQueryTool`

### 135. `api/src/modules/tools/definitions/DatabaseEnterpriseTools.ts`
- **Lines of Code:** 160
- **Import Dependencies:** 4
- **Exported Symbols:** `export class DbSchemaMigratorTool`, `export class QueryOptimizerTool`, `export class LargeDataSeederTool`

### 136. `api/src/modules/tools/definitions/DatasourceTool.ts`
- **Lines of Code:** 224
- **Import Dependencies:** 1
- **Exported Symbols:** `export class DatasourceTool`

### 137. `api/src/modules/tools/definitions/DeadCodeTool.ts`
- **Lines of Code:** 112
- **Import Dependencies:** 5
- **Exported Symbols:** `export class DeadCodeTool`

### 138. `api/src/modules/tools/definitions/DeployProjectTool.ts`
- **Lines of Code:** 241
- **Import Dependencies:** 4
- **Exported Symbols:** `export class DeployProjectTool`

### 139. `api/src/modules/tools/definitions/DockerManagerTool.ts`
- **Lines of Code:** 73
- **Import Dependencies:** 2
- **Exported Symbols:** `export class DockerManagerTool`

### 140. `api/src/modules/tools/definitions/EliteTools.ts`
- **Lines of Code:** 327
- **Import Dependencies:** 2
- **Exported Symbols:** `export class DependencyGraphTool`, `export class BusinessLogicTool`, `export class ChaosTestingTool`, `export class ComplianceValidatorTool`, `export class CostEstimatorTool`, `export class AmbiguityResolverTool`, `export class MultiAgentDebateTool`, `export class SelfConfidenceTool`, `export class AIWriteFileTool`

### 141. `api/src/modules/tools/definitions/ErrorRecoveryTool.ts`
- **Lines of Code:** 184
- **Import Dependencies:** 5
- **Exported Symbols:** `export class ErrorRecoveryTool`

### 142. `api/src/modules/tools/definitions/FallbackTool.ts`
- **Lines of Code:** 237
- **Import Dependencies:** 1
- **Exported Symbols:** `export class FallbackTool`

### 143. `api/src/modules/tools/definitions/GitHubActionsTool.ts`
- **Lines of Code:** 254
- **Import Dependencies:** 3
- **Exported Symbols:** `export class GitHubActionsTool`

### 144. `api/src/modules/tools/definitions/GitHubPRTool.ts`
- **Lines of Code:** 199
- **Import Dependencies:** 2
- **Exported Symbols:** `export class GitHubPRTool`

### 145. `api/src/modules/tools/definitions/GitHubRepoManagerTool.ts`
- **Lines of Code:** 236
- **Import Dependencies:** 2
- **Exported Symbols:** `export class GitHubRepoManagerTool`

### 146. `api/src/modules/tools/definitions/GitTools.ts`
- **Lines of Code:** 130
- **Import Dependencies:** 9
- **Exported Symbols:** `export class GitOpsTool`

### 147. `api/src/modules/tools/definitions/GoBuilderTool.ts`
- **Lines of Code:** 526
- **Import Dependencies:** 3
- **Exported Symbols:** `export class GoBuilderTool`

### 148. `api/src/modules/tools/definitions/I18nTranslatorTool.ts`
- **Lines of Code:** 102
- **Import Dependencies:** 3
- **Exported Symbols:** `export class I18nTranslatorTool`

### 149. `api/src/modules/tools/definitions/ImageGenerationTool.ts`
- **Lines of Code:** 65
- **Import Dependencies:** 1
- **Exported Symbols:** `export const ImageGenerationTool`

### 150. `api/src/modules/tools/definitions/InfrastructureTools.ts`
- **Lines of Code:** 230
- **Import Dependencies:** 5
- **Exported Symbols:** `export class TerraformManagerTool`, `export class KubernetesOpsTool`, `export class DockerSwarmOpsTool`

### 151. `api/src/modules/tools/definitions/JavaBuilderTool.ts`
- **Lines of Code:** 439
- **Import Dependencies:** 3
- **Exported Symbols:** `export class JavaBuilderTool`

### 152. `api/src/modules/tools/definitions/JoeEngineeringReportTool.ts`
- **Lines of Code:** 158
- **Import Dependencies:** 2
- **Exported Symbols:** `export class JoeEngineeringReportTool`

### 153. `api/src/modules/tools/definitions/KnowledgeTools.ts`
- **Lines of Code:** 63
- **Import Dependencies:** 3
- **Exported Symbols:** `export class KnowledgeSearchTool`, `export class KnowledgeAddTool`

### 154. `api/src/modules/tools/definitions/LLMCacheTool.ts`
- **Lines of Code:** 239
- **Import Dependencies:** 2
- **Exported Symbols:** `export class LLMCacheTool`

### 155. `api/src/modules/tools/definitions/LoggerTool.ts`
- **Lines of Code:** 229
- **Import Dependencies:** 1
- **Exported Symbols:** `export class LoggerTool`

### 156. `api/src/modules/tools/definitions/MemoryTool.ts`
- **Lines of Code:** 58
- **Import Dependencies:** 1
- **Exported Symbols:** `export const MemoryTools`

### 157. `api/src/modules/tools/definitions/MobileBuilderTool.ts`
- **Lines of Code:** 507
- **Import Dependencies:** 25
- **Exported Symbols:** `export class MobileBuilderTool`, `export function AppNavigator`, `export const useStore`, `export const store`, `export type RootState`, `export type AppDispatch`, `export function AppProvider`, `export const useApp`

### 158. `api/src/modules/tools/definitions/MonitoringTool.ts`
- **Lines of Code:** 205
- **Import Dependencies:** 1
- **Exported Symbols:** `export class MonitoringTool`

### 159. `api/src/modules/tools/definitions/NotifyUserTool.ts`
- **Lines of Code:** 86
- **Import Dependencies:** 2
- **Exported Symbols:** `export class NotifyUserTool`

### 160. `api/src/modules/tools/definitions/PaymentsTool.ts`
- **Lines of Code:** 124
- **Import Dependencies:** 2
- **Exported Symbols:** `export class PaymentsTool`

### 161. `api/src/modules/tools/definitions/PerformanceAnalyzerTool.ts`
- **Lines of Code:** 201
- **Import Dependencies:** 3
- **Exported Symbols:** `export class PerformanceAnalyzerTool`

### 162. `api/src/modules/tools/definitions/PhaseExecutorTool.ts`
- **Lines of Code:** 249
- **Import Dependencies:** 2
- **Exported Symbols:** `export class PhaseExecutorTool`

### 163. `api/src/modules/tools/definitions/ProgressiveGeneratorTool.ts`
- **Lines of Code:** 698
- **Import Dependencies:** 10
- **Exported Symbols:** `export interface GenerationBatch`, `export interface ProjectManifest`, `export class ProgressiveGeneratorTool`

### 164. `api/src/modules/tools/definitions/ProjectPlannerTool.ts`
- **Lines of Code:** 190
- **Import Dependencies:** 2
- **Exported Symbols:** `export class ProjectPlannerTool`

### 165. `api/src/modules/tools/definitions/ProjectStateManagerTool.ts`
- **Lines of Code:** 268
- **Import Dependencies:** 1
- **Exported Symbols:** `export class ProjectStateManagerTool`

### 166. `api/src/modules/tools/definitions/PythonBuilderTool.ts`
- **Lines of Code:** 194
- **Import Dependencies:** 1
- **Exported Symbols:** `export class PythonBuilderTool`

### 167. `api/src/modules/tools/definitions/PythonExecutionTool.ts`
- **Lines of Code:** 112
- **Import Dependencies:** 5
- **Exported Symbols:** `export class PythonExecutionTool`

### 168. `api/src/modules/tools/definitions/QualityTools.ts`
- **Lines of Code:** 417
- **Import Dependencies:** 6
- **Exported Symbols:** `export class SonarAnalysisTool`, `export class DependencyAuditTool`, `export class QualityRunTool`, `export class SecretsScanRepoTool`, `export class CiGeneratePipelineTool`, `export class LoadTesterTool`

### 169. `api/src/modules/tools/definitions/RepoSelfCodingTools.ts`
- **Lines of Code:** 280
- **Import Dependencies:** 5
- **Exported Symbols:** `export class RepoReadFileTool`, `export class RepoSearchTool`, `export class RepoApplyPatchTool`, `export class RepoRunCommandTool`, `export class RepoDiffSummaryTool`

### 170. `api/src/modules/tools/definitions/RequestAnalyzerTool.ts`
- **Lines of Code:** 202
- **Import Dependencies:** 2
- **Exported Symbols:** `export class RequestAnalyzerTool`

### 171. `api/src/modules/tools/definitions/RetryManagerTool.ts`
- **Lines of Code:** 279
- **Import Dependencies:** 1
- **Exported Symbols:** `export class RetryManagerTool`

### 172. `api/src/modules/tools/definitions/ScreenshotTool.ts`
- **Lines of Code:** 262
- **Import Dependencies:** 6
- **Exported Symbols:** `export class ScreenshotTool`, `export class VisualComparisonTool`

### 173. `api/src/modules/tools/definitions/SearchApiTool.ts`
- **Lines of Code:** 63
- **Import Dependencies:** 3
- **Exported Symbols:** `export class SearchApiTool`

### 174. `api/src/modules/tools/definitions/SecurityScannerTool.ts`
- **Lines of Code:** 196
- **Import Dependencies:** 3
- **Exported Symbols:** `export class SecurityScannerTool`

### 175. `api/src/modules/tools/definitions/SwaggerDocsTool.ts`
- **Lines of Code:** 364
- **Import Dependencies:** 4
- **Exported Symbols:** `export class SwaggerDocsTool`

### 176. `api/src/modules/tools/definitions/SystemTools.ts`
- **Lines of Code:** 647
- **Import Dependencies:** 9
- **Exported Symbols:** `export class EchoTool`, `export class FileEditTool`, `export class WriteFileTool`, `export class LsTool`, `export class GrepSearchTool`, `export class NpmManagerTool`, `export class ScaffoldProjectTool`, `export class ShellExecuteTool`, `export class ShellStatusTool`

### 177. `api/src/modules/tools/definitions/TaskInteractionTools.ts`
- **Lines of Code:** 255
- **Import Dependencies:** 8
- **Exported Symbols:** `export class TerminalManagerTool`, `export class SafeReadFileTool`, `export class AskUserTool`

### 178. `api/src/modules/tools/definitions/TaskLifecycleTool.ts`
- **Lines of Code:** 46
- **Import Dependencies:** 3
- **Exported Symbols:** `export class TaskLifecycleTool`

### 179. `api/src/modules/tools/definitions/TaskLoopTool.ts`
- **Lines of Code:** 188
- **Import Dependencies:** 2
- **Exported Symbols:** `export class TaskLoopTool`

### 180. `api/src/modules/tools/definitions/TemplateManagerTool.ts`
- **Lines of Code:** 382
- **Import Dependencies:** 9
- **Exported Symbols:** `export class TemplateManagerTool`

### 181. `api/src/modules/tools/definitions/TodoWriteTool.ts`
- **Lines of Code:** 78
- **Import Dependencies:** 2
- **Exported Symbols:** `export const TodoWriteTool`

### 182. `api/src/modules/tools/definitions/UtilityTools.ts`
- **Lines of Code:** 266
- **Import Dependencies:** 5
- **Exported Symbols:** `export class DirectoryInspectionTool`, `export class FileSearchTool`, `export class SymbolInspectorTool`, `export const x`, `export class AdvancedFileEditTool`

### 183. `api/src/modules/tools/definitions/VideoActionTool.ts`
- **Lines of Code:** 80
- **Import Dependencies:** 2
- **Exported Symbols:** `export class VideoActionTool`

### 184. `api/src/modules/tools/definitions/VisualQATool.ts`
- **Lines of Code:** 106
- **Import Dependencies:** 4
- **Exported Symbols:** `export const VisualQATool`

### 185. `api/src/modules/tools/definitions/WebDevelopmentTools.ts`
- **Lines of Code:** 665
- **Import Dependencies:** 9
- **Exported Symbols:** `export class WebPipelineTool`, `export class DevServerTool`, `export class ScaffoldTool`

### 186. `api/src/modules/tools/handlers.ts`
- **Lines of Code:** 128
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface HandlerResult`, `export async function handleShellCommand`, `export async function handleGitCommand`, `export async function handleFsCommand`

### 187. `api/src/modules/tools/registry.ts`
- **Lines of Code:** 113
- **Import Dependencies:** 38
- **Exported Symbols:** `export const tools`

### 188. `api/src/modules/tools/terminal/TerminalState.ts`
- **Lines of Code:** 21
- **Import Dependencies:** 0
- **Exported Symbols:** `export const terminals`, `export function registerTerminal`, `export function getTerminal`, `export function removeTerminal`

### 189. `api/src/modules/tools/ToolRegistry-V2.ts`
- **Lines of Code:** 472
- **Import Dependencies:** 2
- **Exported Symbols:** `export class ToolRegistry`, `export const toolRegistry`

### 190. `api/src/modules/tools/types.ts`
- **Lines of Code:** 30
- **Import Dependencies:** 0
- **Exported Symbols:** `export type ToolPermission`, `export interface ToolDefinition`, `export interface ToolExecutionInput`, `export interface ToolExecutionResult`

### 191. `api/src/modules/tools/utils.ts`
- **Lines of Code:** 74
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface ResolvePathOptions`, `export function resolveToolPath`

### 192. `api/src/modules/vision/image-analyzer.ts`
- **Lines of Code:** 161
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface ImageAnalysis`, `export interface UIAnalysis`, `export interface UIComponent`, `export async function analyzeImage`, `export async function analyzeUIScreenshot`, `export async function extractTextFromImage`, `export async function compareScreenshots`, `export async function screenshotToCode`

### 193. `api/src/modules/voice/interface.ts`
- **Lines of Code:** 123
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface VoiceConfig`, `export interface TranscriptionResult`, `export async function transcribeAudio`, `export async function synthesizeSpeech`, `export class VoiceConversation`, `export function detectVoiceCommand`

### 194. `api/src/orchestration/AgentExecutionFirewall.ts`
- **Lines of Code:** 64
- **Import Dependencies:** 2
- **Exported Symbols:** `export const executionFirewall`

### 195. `api/src/orchestration/AgentOrchestrator.ts`
- **Lines of Code:** 445
- **Import Dependencies:** 13
- **Exported Symbols:** `export type AgentGoal`, `export type AgentType`, `export type ExecutionNode`, `export type AgentDAG`, `export class AgentOrchestrator`

### 196. `api/src/orchestration/agents/BaseAgent.ts`
- **Lines of Code:** 15
- **Import Dependencies:** 0
- **Exported Symbols:** _Internal / Side-effect module_

### 197. `api/src/orchestration/agents/BrowserAgent.ts`
- **Lines of Code:** 75
- **Import Dependencies:** 3
- **Exported Symbols:** `export class BrowserAgent`

### 198. `api/src/orchestration/agents/DevAgent.ts`
- **Lines of Code:** 35
- **Import Dependencies:** 2
- **Exported Symbols:** `export class DevAgent`

### 199. `api/src/orchestration/agents/SecurityAgent.ts`
- **Lines of Code:** 32
- **Import Dependencies:** 2
- **Exported Symbols:** `export class SecurityAgent`

### 200. `api/src/shared/config.ts`
- **Lines of Code:** 43
- **Import Dependencies:** 1
- **Exported Symbols:** `export const config`

### 201. `api/src/shared/lib/jsondb.ts`
- **Lines of Code:** 109
- **Import Dependencies:** 2
- **Exported Symbols:** `export class JsonStore`

### 202. `api/src/shared/models/approval.ts`
- **Lines of Code:** 23
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IApproval`, `export const Approval`

### 203. `api/src/shared/models/artifact.ts`
- **Lines of Code:** 21
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IArtifact`, `export const Artifact`

### 204. `api/src/shared/models/conversationSummary.ts`
- **Lines of Code:** 50
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IConversationSummary`, `export const ConversationSummary`

### 205. `api/src/shared/models/deployment.ts`
- **Lines of Code:** 31
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IDeployment`, `export const Deployment`

### 206. `api/src/shared/models/file.ts`
- **Lines of Code:** 25
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IFile`, `export const FileModel`

### 207. `api/src/shared/models/memoryItem.ts`
- **Lines of Code:** 27
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IMemoryItem`, `export const MemoryItem`

### 208. `api/src/shared/models/message.ts`
- **Lines of Code:** 25
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IMessage`, `export const Message`

### 209. `api/src/shared/models/project.ts`
- **Lines of Code:** 19
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IProject`, `export const Project`

### 210. `api/src/shared/models/run.ts`
- **Lines of Code:** 33
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IRun`, `export const Run`

### 211. `api/src/shared/models/SentinelActionRun.ts`
- **Lines of Code:** 26
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface SentinelActionRunDocument`, `export const SentinelActionRunModel`

### 212. `api/src/shared/models/SentinelAuditLog.ts`
- **Lines of Code:** 25
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface SentinelAuditLogDocument`, `export const SentinelAuditLogModel`

### 213. `api/src/shared/models/SentinelIncident.ts`
- **Lines of Code:** 30
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface SentinelIncidentDocument`, `export const SentinelIncidentModel`

### 214. `api/src/shared/models/SentinelPolicy.ts`
- **Lines of Code:** 22
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface SentinelPolicyDocument`, `export const SentinelPolicyModel`

### 215. `api/src/shared/models/SentinelServerBaseline.ts`
- **Lines of Code:** 32
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface SentinelServerBaselineDocument`, `export const SentinelServerBaselineModel`

### 216. `api/src/shared/models/ServerConfig.ts`
- **Lines of Code:** 35
- **Import Dependencies:** 0
- **Exported Symbols:** `export interface ServerConfig`, `export interface ServerConnectionStatus`, `export interface CommandExecutionContext`

### 217. `api/src/shared/models/ServerConfigModel.ts`
- **Lines of Code:** 32
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface ServerConfigDocument`, `export const ServerConfigModel`

### 218. `api/src/shared/models/session.ts`
- **Lines of Code:** 35
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface ISession`, `export const Session`

### 219. `api/src/shared/models/summary.ts`
- **Lines of Code:** 19
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface ISummary`, `export const Summary`

### 220. `api/src/shared/models/systemConfig.ts`
- **Lines of Code:** 16
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface ISystemConfig`, `export const SystemConfig`

### 221. `api/src/shared/models/tenant.ts`
- **Lines of Code:** 19
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface ITenant`, `export const Tenant`

### 222. `api/src/shared/models/toolExecution.ts`
- **Lines of Code:** 29
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IToolExecution`, `export const ToolExecution`

### 223. `api/src/shared/models/user.ts`
- **Lines of Code:** 89
- **Import Dependencies:** 2
- **Exported Symbols:** `export interface IUser`, `export const User`, `export function validatePasswordStrength`, `export const MAX_FAILED_ATTEMPTS`, `export const LOCKOUT_DURATION_MS`

### 224. `api/src/shared/models/userSecret.ts`
- **Lines of Code:** 68
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface IUserSecret`, `export const UserSecret`

### 225. `api/src/shared/models/workspace.ts`
- **Lines of Code:** 77
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IWorkspace`, `export const Workspace`

### 226. `api/src/shared/models/workspaceMember.ts`
- **Lines of Code:** 25
- **Import Dependencies:** 1
- **Exported Symbols:** `export interface IWorkspaceMember`, `export const WorkspaceMember`

### 227. `api/src/shared/types/express.d.ts`
- **Lines of Code:** 10
- **Import Dependencies:** 1
- **Exported Symbols:** _Internal / Side-effect module_

### 228. `api/src/shared/utils/browserUtils.ts`
- **Lines of Code:** 89
- **Import Dependencies:** 0
- **Exported Symbols:** `export function extractTitleFromHtml`, `export function inferSiteLabel`, `export function summarizeBrowserOutputForChat`, `export function sanitizeToolResultForBroadcast`

### 229. `api/src/shared/utils/logger.ts`
- **Lines of Code:** 37
- **Import Dependencies:** 1
- **Exported Symbols:** `export const logger`, `export const logStream`

### 230. `api/src/shared/utils/network.ts`
- **Lines of Code:** 47
- **Import Dependencies:** 1
- **Exported Symbols:** `export function isPortOpen`, `export function isLocalOrInternalUrl`

### 231. `api/src/shared/utils/redaction.ts`
- **Lines of Code:** 100
- **Import Dependencies:** 0
- **Exported Symbols:** `export function redactSecretsFromString`, `export function safeErrorMessage`, `export function redactToolInputForStorage`

### 232. `api/src/shared/utils/url.ts`
- **Lines of Code:** 135
- **Import Dependencies:** 1
- **Exported Symbols:** `export function normalizeUrlForGoto`

### 233. `api/src/system/Analyst.ts`
- **Lines of Code:** 67
- **Import Dependencies:** 2
- **Exported Symbols:** `export class Analyst`

### 234. `api/src/system/Builder.ts`
- **Lines of Code:** 473
- **Import Dependencies:** 10
- **Exported Symbols:** `export class Builder`

### 235. `api/src/system/deploy-helper.ts`
- **Lines of Code:** 67
- **Import Dependencies:** 4
- **Exported Symbols:** _Internal / Side-effect module_

### 236. `api/src/system/enhancements/index.ts`
- **Lines of Code:** 75
- **Import Dependencies:** 7
- **Exported Symbols:** `export function initializeEnhancements`, `export function shutdownEnhancements`

### 237. `api/src/system/monitoring/health-monitor.ts`
- **Lines of Code:** 250
- **Import Dependencies:** 3
- **Exported Symbols:** `export interface SystemMetrics`, `export interface HealthCheck`, `export interface HealthIssue`, `export class HealthMonitor`, `export const healthMonitor`

### 238. `api/src/system/scripts/deep_audit.ts`
- **Lines of Code:** 92
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 239. `api/src/system/scripts/generate_code_map.ts`
- **Lines of Code:** 84
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 240. `api/src/system/scripts/generate_test_token.ts`
- **Lines of Code:** 23
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 241. `api/src/system/scripts/scan_imports.ts`
- **Lines of Code:** 86
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 242. `api/src/system/scripts/verify_core_logic.ts`
- **Lines of Code:** 81
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 243. `api/src/system/scripts/verify_elite_tools.ts`
- **Lines of Code:** 66
- **Import Dependencies:** 0
- **Exported Symbols:** _Internal / Side-effect module_

### 244. `api/src/system/scripts/verify_tools.ts`
- **Lines of Code:** 245
- **Import Dependencies:** 6
- **Exported Symbols:** _Internal / Side-effect module_

### 245. `api/src/test-intelligence.ts`
- **Lines of Code:** 11
- **Import Dependencies:** 0
- **Exported Symbols:** `export const ADVANCED_FREE_PATTERNS`

### 246. `api/src/tests/architecture/guard_architecture.ts`
- **Lines of Code:** 83
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 247. `api/src/tests/architecture/guard_package_scripts.ts`
- **Lines of Code:** 121
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 248. `api/src/tests/manual/test_execution_gateway.ts`
- **Lines of Code:** 34
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 249. `api/src/tests/manual/test_prompt.ts`
- **Lines of Code:** 31
- **Import Dependencies:** 4
- **Exported Symbols:** _Internal / Side-effect module_

### 250. `api/src/tests/manual/test_ui_flow.ts`
- **Lines of Code:** 94
- **Import Dependencies:** 4
- **Exported Symbols:** _Internal / Side-effect module_

### 251. `api/src/tests/manual/verify_autonomous_loop.ts`
- **Lines of Code:** 65
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 252. `api/src/tests/manual/verify_firewall.ts`
- **Lines of Code:** 45
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 253. `api/src/tests/manual/verify_fixes.ts`
- **Lines of Code:** 99
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 254. `api/src/tests/manual/verify_joe_build_page.ts`
- **Lines of Code:** 602
- **Import Dependencies:** 5
- **Exported Symbols:** _Internal / Side-effect module_

### 255. `api/src/tests/manual/verify_joe_full_engineer_flow.ts`
- **Lines of Code:** 191
- **Import Dependencies:** 4
- **Exported Symbols:** `export const taskLimit`, `export const taskLimit`, `export const taskLimit`

### 256. `api/src/tests/manual/verify_production.ts`
- **Lines of Code:** 80
- **Import Dependencies:** 0
- **Exported Symbols:** _Internal / Side-effect module_

### 257. `api/src/tests/manual/verify_self_fix_build_context.ts`
- **Lines of Code:** 74
- **Import Dependencies:** 1
- **Exported Symbols:** _Internal / Side-effect module_

### 258. `api/src/tests/manual/verify_self_fix_execution_safety.ts`
- **Lines of Code:** 81
- **Import Dependencies:** 1
- **Exported Symbols:** _Internal / Side-effect module_

### 259. `api/src/tests/manual/verify_self_fix_typescript_missing_name.ts`
- **Lines of Code:** 141
- **Import Dependencies:** 3
- **Exported Symbols:** `export function getAnswer`, `export const untouched`

### 260. `api/src/tests/manual/verify_self_fix_typescript_number_to_string.ts`
- **Lines of Code:** 132
- **Import Dependencies:** 3
- **Exported Symbols:** `export const untouched`

### 261. `api/src/tests/manual/verify_self_fix_typescript_repair.ts`
- **Lines of Code:** 148
- **Import Dependencies:** 3
- **Exported Symbols:** `export const untouched`

### 262. `api/src/tests/manual/verify_self_healing_loop.ts`
- **Lines of Code:** 112
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 263. `api/src/tests/manual/verify_self_healing_success_loop.ts`
- **Lines of Code:** 123
- **Import Dependencies:** 3
- **Exported Symbols:** _Internal / Side-effect module_

### 264. `api/src/tests/manual/verify_system.ts`
- **Lines of Code:** 52
- **Import Dependencies:** 0
- **Exported Symbols:** _Internal / Side-effect module_

### 265. `api/src/tests/manual/verify_terminal_manager.ts`
- **Lines of Code:** 75
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 266. `api/src/verify_thoughts.ts`
- **Lines of Code:** 29
- **Import Dependencies:** 2
- **Exported Symbols:** _Internal / Side-effect module_

### 267. `api/src/__tests__/enterprise.test.ts`
- **Lines of Code:** 178
- **Import Dependencies:** 0
- **Exported Symbols:** _Internal / Side-effect module_

