/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * JOE NEURAL SYSTEM - نظام جو العصبي
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * نظام عصبي متقدم يحاكي عمل الدماغ البشري
 * يتضمن: Neural Core, State Manager, Visualization, Dashboard, Integration
 * 
 * @version 2.0.0
 * @author Joe Enterprise Team
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE EXPORTS - التصديرات الأساسية
// ═══════════════════════════════════════════════════════════════════════════════

export {
  NeuralNetwork,
  NeuralCore,
  neuralCore,
  NeuralState,
  NeuronType,
  SynapticStrength,
  NeuralActivation,
  Neuron,
  Synapse,
  Thought,
  NeuralPathway,
  MemoryEngram,
} from './NeuralCore';

export {
  NeuralStateManager,
  StateTransition,
  TransitionCondition,
  StateContext,
  StateSnapshot,
  EmotionalState,
  createStateManager,
} from './NeuralStateManager';

export {
  NeuralVisualizer,
  VisualizationConfig,
  NeuronVisual,
  SynapseVisual,
  ThoughtBubble,
  HeatmapCell,
  DecisionNode,
  NeuralMetrics,
  StreamEvent,
  createVisualizer,
} from './NeuralVisualization';

export {
  NeuralDashboard,
} from './NeuralDashboard';

export {
  NeuralAgent,
  NeuralAgentConfig,
  TaskExecutionPlan,
  NeuralTaskStep,
  ExecutionContext,
  NeuralResponse,
  CreateNeuralAgentOptions,
  createNeuralAgent,
} from './NeuralIntegration';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES RE-EXPORT - إعادة تصدير الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  NeuralState as TNeuralState,
  NeuronType as TNeuronType,
  SynapticStrength as TSynapticStrength,
  NeuralActivation as TNeuralActivation,
  Neuron as TNeuron,
  Synapse as TSynapse,
  Thought as TThought,
  NeuralPathway as TNeuralPathway,
  MemoryEngram as TMemoryEngram,
  StateTransition as TStateTransition,
  TransitionCondition as TTransitionCondition,
  StateContext as TStateContext,
  StateSnapshot as TStateSnapshot,
  EmotionalState as TEmotionalState,
  VisualizationConfig as TVisualizationConfig,
  NeuronVisual as TNeuronVisual,
  SynapseVisual as TSynapseVisual,
  ThoughtBubble as TThoughtBubble,
  HeatmapCell as THeatmapCell,
  DecisionNode as TDecisionNode,
  NeuralMetrics as TNeuralMetrics,
  StreamEvent as TStreamEvent,
  NeuralAgentConfig as TNeuralAgentConfig,
  TaskExecutionPlan as TTaskExecutionPlan,
  NeuralTaskStep as TNeuralTaskStep,
  ExecutionContext as TExecutionContext,
  NeuralResponse as TNeuralResponse,
} from './NeuralCore';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS - الثوابت
// ═══════════════════════════════════════════════════════════════════════════════

export const NEURAL_VERSION = '2.0.0';

export const NEURAL_STATES = [
  'idle',
  'analyzing',
  'processing',
  'synthesizing',
  'deciding',
  'executing',
  'learning',
  'recalling',
  'reflecting',
  'optimizing',
  'healing',
  'completing',
] as const;

export const NEURON_TYPES = [
  'input',
  'hidden',
  'output',
  'memory',
  'decision',
  'pattern',
  'attention',
  'emotion',
  'creativity',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS - دوال المساعدة
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a value is a valid neural state
 */
export const isNeuralState = (value: string): value is NeuralState => {
  return NEURAL_STATES.includes(value as NeuralState);
};

/**
 * Check if a value is a valid neuron type
 */
export const isNeuronType = (value: string): value is NeuronType => {
  return NEURON_TYPES.includes(value as NeuronType);
};

/**
 * Get state color for visualization
 */
export const getStateColor = (state: NeuralState): string => {
  const colors: Record<NeuralState, string> = {
    idle: '#9E9E9E',
    analyzing: '#4CAF50',
    processing: '#2196F3',
    synthesizing: '#00BCD4',
    deciding: '#FF9800',
    executing: '#F44336',
    learning: '#9C27B0',
    recalling: '#673AB7',
    reflecting: '#795548',
    optimizing: '#FF5722',
    healing: '#E91E63',
    completing: '#8BC34A',
  };
  return colors[state] || '#9E9E9E';
};

/**
 * Get neuron type color
 */
export const getNeuronTypeColor = (type: NeuronType): string => {
  const colors: Record<NeuronType, string> = {
    input: '#4CAF50',
    hidden: '#2196F3',
    output: '#FF9800',
    memory: '#9C27B0',
    decision: '#F44336',
    pattern: '#00BCD4',
    attention: '#FFEB3B',
    emotion: '#E91E63',
    creativity: '#795548',
  };
  return colors[type] || '#607D8B';
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK START - البدء السريع
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick start function to create a fully configured neural system
 * 
 * @example
 * ```typescript
 * import { createNeuralSystem } from './joe-neural';
 * 
 * const system = createNeuralSystem({
 *   enableVisualization: true,
 *   enableThoughtBroadcasting: true,
 * });
 * 
 * // Execute a task
 * const result = await system.agent.executeTask(
 *   "Build a social network like Facebook",
 *   { complexity: 'extreme' }
 * );
 * ```
 */
export interface NeuralSystemOptions {
  enableVisualization?: boolean;
  enableThoughtBroadcasting?: boolean;
  enableEmotionalResponses?: boolean;
  autoTransitionStates?: boolean;
}

export interface NeuralSystem {
  neuralNetwork: import('./NeuralCore').NeuralNetwork;
  stateManager: import('./NeuralStateManager').NeuralStateManager;
  visualizer: import('./NeuralVisualization').NeuralVisualizer | null;
  agent: import('./NeuralIntegration').NeuralAgent;
}

export const createNeuralSystem = (options: NeuralSystemOptions = {}): NeuralSystem => {
  const { NeuralNetwork } = require('./NeuralCore');
  const { NeuralStateManager } = require('./NeuralStateManager');
  const { NeuralVisualizer } = require('./NeuralVisualization');
  const { NeuralAgent } = require('./NeuralIntegration');

  const neuralNetwork = new NeuralNetwork();
  const stateManager = new NeuralStateManager(neuralNetwork);
  
  const visualizer = options.enableVisualization 
    ? new NeuralVisualizer(neuralNetwork)
    : null;

  const agent = new NeuralAgent(neuralNetwork, stateManager, {
    enableVisualization: options.enableVisualization ?? true,
    enableThoughtBroadcasting: options.enableThoughtBroadcasting ?? true,
    enableEmotionalResponses: options.enableEmotionalResponses ?? true,
    autoTransitionStates: options.autoTransitionStates ?? true,
  });

  return {
    neuralNetwork,
    stateManager,
    visualizer,
    agent,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT - التصدير الافتراضي
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  NEURAL_VERSION,
  NEURAL_STATES,
  NEURON_TYPES,
  isNeuralState,
  isNeuronType,
  getStateColor,
  getNeuronTypeColor,
  createNeuralSystem,
};
