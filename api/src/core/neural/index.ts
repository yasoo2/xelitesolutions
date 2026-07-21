/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * JOE NEURAL SYSTEM - نظام جو العصبي
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * نظام عصبي متقدم يحاكي عمل الدماغ البشري
 * يتضمن: Neural Core, State Manager, Visualization, Integration
 * 
 * @version 2.0.0
 * @author Joe Enterprise Team
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE EXPORTS - التصديرات الأساسية
// ═══════════════════════════════════════════════════════════════════════════════

export {
  NeuralNetwork,
  neuralCore,
  type NeuralState,
  type NeuronType,
  type SynapticStrength,
  type NeuralActivation,
  type Neuron,
  type Synapse,
  type Thought,
  type NeuralPathway,
  type MemoryEngram,
} from './NeuralCore';

export {
  NeuralStateManager,
  createStateManager,
  type StateTransition,
  type TransitionCondition,
  type StateContext,
  type StateSnapshot,
  type EmotionalState,
} from './NeuralStateManager';

export {
  NeuralVisualizer,
  createVisualizer,
  type VisualizationConfig,
  type NeuronVisual,
  type SynapseVisual,
  type ThoughtBubble,
  type HeatmapCell,
  type DecisionNode,
  type NeuralMetrics,
  type StreamEvent,
} from './NeuralVisualization';

export {
  NeuralAgent,
  createNeuralAgent,
  type NeuralAgentConfig,
  type TaskExecutionPlan,
  type NeuralTaskStep,
  type ExecutionContext,
  type NeuralResponse,
  type CreateNeuralAgentOptions,
} from './NeuralIntegration';

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

import type { NeuralState, NeuronType } from './NeuralCore';

/**
 * Check if a value is a valid neural state
 */
export const isNeuralState = (value: string): value is NeuralState => {
  return NEURAL_STATES.includes(value as typeof NEURAL_STATES[number]);
};

/**
 * Check if a value is a valid neuron type
 */
export const isNeuronType = (value: string): value is NeuronType => {
  return NEURON_TYPES.includes(value as typeof NEURON_TYPES[number]);
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
