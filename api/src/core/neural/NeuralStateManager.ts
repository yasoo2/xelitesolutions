/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEURAL STATE MANAGER - مدير الحالات العصبية المتقدم
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * يدير الانتقالات بين الحالات العصبية المختلفة بشكل ذكي وسلس
 * يتضمن: State Machine, Transition Probabilities, State History, Predictive State Switching
 */

import { EventEmitter } from 'events';
import { NeuralNetwork, NeuralState, NeuralActivation } from './NeuralCore';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

export interface StateTransition {
  from: NeuralState;
  to: NeuralState;
  probability: number;
  conditions: TransitionCondition[];
  triggers: string[];
  estimatedDuration: number; // ms
  priority: number; // 1-10
}

export interface TransitionCondition {
  type: 'time' | 'activation' | 'memory' | 'thought' | 'external' | 'confidence';
  threshold: number;
  operator: '>' | '<' | '==' | '>=' | '<=';
  value: any;
}

export interface StateContext {
  input?: string;
  goal?: string;
  progress?: number;
  errors?: Error[];
  memories?: string[];
  confidence?: number;
  complexity?: 'low' | 'medium' | 'high' | 'extreme';
  urgency?: 'low' | 'medium' | 'high' | 'critical';
}

export interface StateSnapshot {
  state: NeuralState;
  timestamp: number;
  duration: number;
  context: StateContext;
  activations: NeuralActivation[];
  thoughts: string[];
  metrics: {
    confidence: number;
    progress: number;
    errorCount: number;
  };
}

export interface EmotionalState {
  curiosity: number;      // 0-1
  confidence: number;     // 0-1
  urgency: number;        // 0-1
  satisfaction: number;   // 0-1
  frustration: number;    // 0-1
  excitement: number;     // 0-1
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE TRANSITION MATRIX - مصفوفة انتقال الحالات
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TRANSITIONS: StateTransition[] = [
  // From IDLE
  {
    from: 'idle',
    to: 'analyzing',
    probability: 0.9,
    conditions: [{ type: 'external', threshold: 0, operator: '>', value: 'input_received' }],
    triggers: ['new_input', 'user_request'],
    estimatedDuration: 2000,
    priority: 10,
  },

  // From ANALYZING
  {
    from: 'analyzing',
    to: 'processing',
    probability: 0.8,
    conditions: [{ type: 'time', threshold: 2000, operator: '>', value: null }],
    triggers: ['analysis_complete', 'pattern_detected'],
    estimatedDuration: 5000,
    priority: 9,
  },
  {
    from: 'analyzing',
    to: 'recalling',
    probability: 0.3,
    conditions: [{ type: 'memory', threshold: 0.5, operator: '>', value: 'relevant_memory' }],
    triggers: ['memory_hint', 'similar_pattern'],
    estimatedDuration: 1000,
    priority: 7,
  },

  // From RECALLING
  {
    from: 'recalling',
    to: 'processing',
    probability: 0.9,
    conditions: [{ type: 'time', threshold: 1000, operator: '>', value: null }],
    triggers: ['memory_loaded', 'context_ready'],
    estimatedDuration: 3000,
    priority: 8,
  },

  // From PROCESSING
  {
    from: 'processing',
    to: 'synthesizing',
    probability: 0.7,
    conditions: [{ type: 'activation', threshold: 0.6, operator: '>', value: null }],
    triggers: ['data_processed', 'patterns_identified'],
    estimatedDuration: 4000,
    priority: 9,
  },
  {
    from: 'processing',
    to: 'learning',
    probability: 0.2,
    conditions: [{ type: 'confidence', threshold: 0.3, operator: '<', value: null }],
    triggers: ['low_confidence', 'new_pattern'],
    estimatedDuration: 3000,
    priority: 6,
  },

  // From SYNTHESIZING
  {
    from: 'synthesizing',
    to: 'deciding',
    probability: 0.85,
    conditions: [{ type: 'time', threshold: 4000, operator: '>', value: null }],
    triggers: ['synthesis_complete', 'solution_ready'],
    estimatedDuration: 2000,
    priority: 9,
  },
  {
    from: 'synthesizing',
    to: 'reflecting',
    probability: 0.15,
    conditions: [{ type: 'confidence', threshold: 0.5, operator: '<', value: null }],
    triggers: ['uncertainty', 'multiple_options'],
    estimatedDuration: 1500,
    priority: 5,
  },

  // From DECIDING
  {
    from: 'deciding',
    to: 'executing',
    probability: 0.9,
    conditions: [{ type: 'confidence', threshold: 0.6, operator: '>', value: null }],
    triggers: ['decision_made', 'path_selected'],
    estimatedDuration: 10000,
    priority: 10,
  },
  {
    from: 'deciding',
    to: 'analyzing',
    probability: 0.1,
    conditions: [{ type: 'confidence', threshold: 0.4, operator: '<', value: null }],
    triggers: ['insufficient_info', 'reanalysis_needed'],
    estimatedDuration: 3000,
    priority: 4,
  },

  // From EXECUTING
  {
    from: 'executing',
    to: 'healing',
    probability: 0.2,
    conditions: [{ type: 'external', threshold: 0, operator: '>', value: 'error_occurred' }],
    triggers: ['execution_error', 'failure'],
    estimatedDuration: 5000,
    priority: 9,
  },
  {
    from: 'executing',
    to: 'optimizing',
    probability: 0.3,
    conditions: [{ type: 'time', threshold: 5000, operator: '>', value: null }],
    triggers: ['execution_slow', 'performance_issue'],
    estimatedDuration: 3000,
    priority: 6,
  },
  {
    from: 'executing',
    to: 'completing',
    probability: 0.5,
    conditions: [{ type: 'external', threshold: 0, operator: '>', value: 'success' }],
    triggers: ['execution_success', 'task_complete'],
    estimatedDuration: 1000,
    priority: 10,
  },

  // From HEALING
  {
    from: 'healing',
    to: 'executing',
    probability: 0.7,
    conditions: [{ type: 'external', threshold: 0, operator: '>', value: 'fix_applied' }],
    triggers: ['error_fixed', 'retry_ready'],
    estimatedDuration: 8000,
    priority: 9,
  },
  {
    from: 'healing',
    to: 'analyzing',
    probability: 0.3,
    conditions: [{ type: 'external', threshold: 0, operator: '>', value: 'fix_failed' }],
    triggers: ['healing_failed', 'reanalysis_needed'],
    estimatedDuration: 3000,
    priority: 5,
  },

  // From OPTIMIZING
  {
    from: 'optimizing',
    to: 'executing',
    probability: 0.8,
    conditions: [{ type: 'time', threshold: 3000, operator: '>', value: null }],
    triggers: ['optimization_complete', 'performance_improved'],
    estimatedDuration: 5000,
    priority: 7,
  },

  // From REFLECTING
  {
    from: 'reflecting',
    to: 'deciding',
    probability: 0.6,
    conditions: [{ type: 'time', threshold: 1500, operator: '>', value: null }],
    triggers: ['reflection_complete', 'insights_gained'],
    estimatedDuration: 2000,
    priority: 6,
  },
  {
    from: 'reflecting',
    to: 'analyzing',
    probability: 0.4,
    conditions: [{ type: 'external', threshold: 0, operator: '>', value: 'new_questions' }],
    triggers: ['deeper_analysis_needed'],
    estimatedDuration: 3000,
    priority: 5,
  },

  // From LEARNING
  {
    from: 'learning',
    to: 'processing',
    probability: 0.9,
    conditions: [{ type: 'time', threshold: 3000, operator: '>', value: null }],
    triggers: ['learning_complete', 'knowledge_updated'],
    estimatedDuration: 4000,
    priority: 7,
  },

  // From COMPLETING
  {
    from: 'completing',
    to: 'idle',
    probability: 1.0,
    conditions: [{ type: 'time', threshold: 1000, operator: '>', value: null }],
    triggers: ['cleanup_complete', 'ready_for_next'],
    estimatedDuration: 500,
    priority: 10,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// NEURAL STATE MANAGER - الفئة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════════

export class NeuralStateManager extends EventEmitter {
  private neuralNetwork: NeuralNetwork;
  private transitions: Map<string, StateTransition> = new Map();
  private stateHistory: StateSnapshot[] = [];
  private emotionalState: EmotionalState;
  private currentContext: StateContext = {};
  
  private stateStartTime: number = Date.now();
  private stateTimeout: NodeJS.Timeout | null = null;
  private isAutoTransitionEnabled: boolean = true;

  constructor(neuralNetwork: NeuralNetwork) {
    super();
    this.neuralNetwork = neuralNetwork;
    this.emotionalState = this.getInitialEmotionalState();
    this.initializeTransitions();
    this.setupNeuralListeners();
  }

  private getInitialEmotionalState(): EmotionalState {
    return {
      curiosity: 0.7,
      confidence: 0.6,
      urgency: 0.3,
      satisfaction: 0.5,
      frustration: 0.1,
      excitement: 0.5,
    };
  }

  private initializeTransitions(): void {
    DEFAULT_TRANSITIONS.forEach(transition => {
      const key = `${transition.from}->${transition.to}`;
      this.transitions.set(key, transition);
    });
  }

  private setupNeuralListeners(): void {
    this.neuralNetwork.on('neuron-activated', (activation: NeuralActivation) => {
      this.onNeuralActivation(activation);
    });

    this.neuralNetwork.on('thought-created', (thought: any) => {
      this.onThoughtCreated(thought);
    });

    this.neuralNetwork.on('memory-recalled', (event: any) => {
      this.onMemoryRecalled(event);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE TRANSITION - انتقال الحالة
  // ═══════════════════════════════════════════════════════════════════════════════

  async transitionTo(
    targetState: NeuralState,
    reason?: string,
    context?: StateContext
  ): Promise<boolean> {
    const currentState = this.neuralNetwork.getCurrentState();
    
    if (currentState === targetState) {
      return true;
    }

    // Validate transition
    const transitionKey = `${currentState}->${targetState}`;
    const transition = this.transitions.get(transitionKey);

    if (!transition && !this.isValidTransition(currentState, targetState)) {
      console.warn(`[StateManager] Invalid transition: ${currentState} -> ${targetState}`);
      return false;
    }

    // Save snapshot of current state
    this.saveStateSnapshot();

    // Update emotional state based on transition
    this.updateEmotionalStateForTransition(currentState, targetState);

    // Perform transition
    this.neuralNetwork.transitionState(targetState, reason);
    this.stateStartTime = Date.now();

    // Update context
    if (context) {
      this.currentContext = { ...this.currentContext, ...context };
    }

    // Clear existing timeout
    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
    }

    // Set up auto-transition if enabled
    if (this.isAutoTransitionEnabled) {
      this.setupAutoTransition(targetState);
    }

    this.emit('state-changed', {
      from: currentState,
      to: targetState,
      reason,
      context: this.currentContext,
      emotionalState: this.emotionalState,
      timestamp: Date.now(),
    });

    return true;
  }

  private isValidTransition(from: NeuralState, to: NeuralState): boolean {
    // Allow any transition in emergency situations
    if (this.emotionalState.urgency > 0.8) {
      return true;
    }

    // Check if there's a defined transition
    const transitionKey = `${from}->${to}`;
    return this.transitions.has(transitionKey);
  }

  private setupAutoTransition(currentState: NeuralState): void {
    // Find possible next states
    const possibleTransitions = Array.from(this.transitions.values())
      .filter(t => t.from === currentState)
      .sort((a, b) => b.priority - a.priority);

    if (possibleTransitions.length === 0) return;

    // Select transition based on probability and conditions
    const selectedTransition = this.selectTransition(possibleTransitions);
    
    if (selectedTransition) {
      const delay = selectedTransition.estimatedDuration;
      
      this.stateTimeout = setTimeout(() => {
        if (this.neuralNetwork.getCurrentState() === currentState) {
          this.transitionTo(selectedTransition.to, 'auto-transition');
        }
      }, delay);
    }
  }

  private selectTransition(transitions: StateTransition[]): StateTransition | null {
    // Filter by conditions
    const validTransitions = transitions.filter(t => 
      this.checkTransitionConditions(t.conditions)
    );

    if (validTransitions.length === 0) return null;

    // Weight by probability and emotional state
    const weightedTransitions = validTransitions.map(t => {
      let weight = t.probability;

      // Adjust based on emotional state
      if (t.to === 'healing' && this.emotionalState.frustration > 0.5) {
        weight *= 1.5;
      }
      if (t.to === 'learning' && this.emotionalState.curiosity > 0.7) {
        weight *= 1.3;
      }
      if (t.to === 'optimizing' && this.emotionalState.urgency > 0.6) {
        weight *= 1.4;
      }

      return { transition: t, weight };
    });

    // Select based on weighted probability
    const totalWeight = weightedTransitions.reduce((sum, wt) => sum + wt.weight, 0);
    let random = Math.random() * totalWeight;

    for (const wt of weightedTransitions) {
      random -= wt.weight;
      if (random <= 0) {
        return wt.transition;
      }
    }

    return weightedTransitions[0]?.transition || null;
  }

  private checkTransitionConditions(conditions: TransitionCondition[]): boolean {
    return conditions.every(condition => {
      const value = this.getConditionValue(condition.type);
      
      switch (condition.operator) {
        case '>': return value > condition.threshold;
        case '<': return value < condition.threshold;
        case '==': return value === condition.threshold;
        case '>=': return value >= condition.threshold;
        case '<=': return value <= condition.threshold;
        default: return false;
      }
    });
  }

  private getConditionValue(type: TransitionCondition['type']): number {
    switch (type) {
      case 'time':
        return Date.now() - this.stateStartTime;
      case 'activation':
        return this.neuralNetwork.getMetrics().averageActivationLevel;
      case 'confidence':
        return this.emotionalState.confidence;
      case 'memory':
        return this.neuralNetwork.getNetworkStats().memories / 100;
      default:
        return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EMOTIONAL STATE - الحالة العاطفية
  // ═══════════════════════════════════════════════════════════════════════════════

  private updateEmotionalStateForTransition(from: NeuralState, to: NeuralState): void {
    // Update emotions based on state transition
    switch (to) {
      case 'analyzing':
        this.emotionalState.curiosity = Math.min(1, this.emotionalState.curiosity + 0.1);
        break;
      case 'executing':
        this.emotionalState.excitement = Math.min(1, this.emotionalState.excitement + 0.15);
        this.emotionalState.urgency = Math.min(1, this.emotionalState.urgency + 0.1);
        break;
      case 'healing':
        this.emotionalState.frustration = Math.min(1, this.emotionalState.frustration + 0.2);
        this.emotionalState.confidence = Math.max(0, this.emotionalState.confidence - 0.1);
        break;
      case 'completing':
        this.emotionalState.satisfaction = Math.min(1, this.emotionalState.satisfaction + 0.3);
        this.emotionalState.excitement = Math.max(0, this.emotionalState.excitement - 0.1);
        this.emotionalState.frustration = Math.max(0, this.emotionalState.frustration - 0.2);
        break;
    }

    // Decay emotions over time
    this.decayEmotions();

    this.emit('emotional-state-changed', { ...this.emotionalState });
  }

  private decayEmotions(): void {
    this.emotionalState.curiosity *= 0.995;
    this.emotionalState.excitement *= 0.99;
    this.emotionalState.frustration *= 0.98;
    this.emotionalState.urgency *= 0.97;
  }

  updateEmotionalState(updates: Partial<EmotionalState>): void {
    this.emotionalState = { ...this.emotionalState, ...updates };
    this.emit('emotional-state-changed', { ...this.emotionalState });
  }

  getEmotionalState(): EmotionalState {
    return { ...this.emotionalState };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS - معالجات الأحداث
  // ═══════════════════════════════════════════════════════════════════════════════

  private onNeuralActivation(activation: NeuralActivation): void {
    // Increase excitement on strong activations
    if (activation.intensity > 0.7) {
      this.emotionalState.excitement = Math.min(1, this.emotionalState.excitement + 0.05);
    }

    // Increase confidence on consistent activations
    if (activation.confidence > 0.8) {
      this.emotionalState.confidence = Math.min(1, this.emotionalState.confidence + 0.02);
    }
  }

  private onThoughtCreated(thought: any): void {
    // Update curiosity based on thought depth
    if (thought.depth > 3) {
      this.emotionalState.curiosity = Math.min(1, this.emotionalState.curiosity + 0.03);
    }
  }

  private onMemoryRecalled(event: any): void {
    // Increase confidence when memories are successfully recalled
    if (event.count > 0) {
      this.emotionalState.confidence = Math.min(1, this.emotionalState.confidence + 0.05);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SNAPSHOTS - اللقطات
  // ═══════════════════════════════════════════════════════════════════════════════

  private saveStateSnapshot(): void {
    const currentState = this.neuralNetwork.getCurrentState();
    const duration = Date.now() - this.stateStartTime;

    const snapshot: StateSnapshot = {
      state: currentState,
      timestamp: Date.now(),
      duration,
      context: { ...this.currentContext },
      activations: [], // Would be populated from neural network
      thoughts: [], // Would be populated from neural network
      metrics: {
        confidence: this.emotionalState.confidence,
        progress: this.currentContext.progress || 0,
        errorCount: this.currentContext.errors?.length || 0,
      },
    };

    this.stateHistory.push(snapshot);

    // Keep only last 100 snapshots
    if (this.stateHistory.length > 100) {
      this.stateHistory = this.stateHistory.slice(-100);
    }
  }

  getStateHistory(limit?: number): StateSnapshot[] {
    const history = [...this.stateHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  getCurrentStateDuration(): number {
    return Date.now() - this.stateStartTime;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTEXT MANAGEMENT - إدارة السياق
  // ═══════════════════════════════════════════════════════════════════════════════

  updateContext(updates: Partial<StateContext>): void {
    this.currentContext = { ...this.currentContext, ...updates };
    
    // Update emotional state based on context
    if (updates.errors && updates.errors.length > 0) {
      this.emotionalState.frustration = Math.min(1, this.emotionalState.frustration + 0.1 * updates.errors.length);
    }
    
    if (updates.progress !== undefined) {
      if (updates.progress > (this.currentContext.progress || 0)) {
        this.emotionalState.satisfaction = Math.min(1, this.emotionalState.satisfaction + 0.05);
      }
    }
  }

  getContext(): StateContext {
    return { ...this.currentContext };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONFIGURATION - الإعدادات
  // ═══════════════════════════════════════════════════════════════════════════════

  setAutoTransition(enabled: boolean): void {
    this.isAutoTransitionEnabled = enabled;
    
    if (!enabled && this.stateTimeout) {
      clearTimeout(this.stateTimeout);
      this.stateTimeout = null;
    }
  }

  addTransition(transition: StateTransition): void {
    const key = `${transition.from}->${transition.to}`;
    this.transitions.set(key, transition);
  }

  removeTransition(from: NeuralState, to: NeuralState): void {
    const key = `${from}->${to}`;
    this.transitions.delete(key);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXPORT - التصدير
  // ═══════════════════════════════════════════════════════════════════════════════

  exportState(): object {
    return {
      currentState: this.neuralNetwork.getCurrentState(),
      emotionalState: this.emotionalState,
      context: this.currentContext,
      stateHistory: this.stateHistory,
      transitions: Array.from(this.transitions.entries()),
    };
  }
}

// Export singleton
export const createStateManager = (neuralNetwork: NeuralNetwork) => {
  return new NeuralStateManager(neuralNetwork);
};
