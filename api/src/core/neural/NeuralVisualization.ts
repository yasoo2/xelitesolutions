/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEURAL VISUALIZATION SYSTEM - نظام التصور العصبي المتقدم
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * يوفر تصوراً ثلاثي الأبعاد وثنائي الأبعاد للنشاط العصبي
 * يتضمن: 3D Network, Heatmaps, Thought Streams, Decision Trees, Real-time Metrics
 */

import { EventEmitter } from 'events';
import { NeuralNetwork, NeuralState, Neuron, Synapse, Thought, NeuralPathway } from './NeuralCore';
import { EmotionalState } from './NeuralStateManager';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

export interface VisualizationConfig {
  mode: '3d' | '2d' | 'heatmap' | 'stream' | 'tree' | 'dashboard';
  updateInterval: number;
  showInactive: boolean;
  colorScheme: 'default' | 'heatmap' | 'emotion' | 'activity';
  detailLevel: 'minimal' | 'standard' | 'detailed';
}

export interface NeuronVisual {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  opacity: number;
  pulseIntensity: number;
  type: string;
  activationLevel: number;
  label?: string;
}

export interface SynapseVisual {
  id: string;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  strength: number;
  color: string;
  opacity: number;
  width: number;
  animated: boolean;
}

export interface ThoughtBubble {
  id: string;
  content: string;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  timestamp: number;
  depth: number;
  branch: number;
  connections: string[];
}

export interface HeatmapCell {
  x: number;
  y: number;
  intensity: number;
  color: string;
  neuronId?: string;
}

export interface DecisionNode {
  id: string;
  label: string;
  x: number;
  y: number;
  confidence: number;
  children: string[];
  parent?: string;
  state: NeuralState;
  isActive: boolean;
}

export interface NeuralMetrics {
  timestamp: number;
  totalNeurons: number;
  activeNeurons: number;
  totalSynapses: number;
  activeSynapses: number;
  averageActivation: number;
  networkDensity: number;
  thoughtCount: number;
  currentState: NeuralState;
  emotionalState: EmotionalState;
  processingSpeed: number; // thoughts per second
  memoryUtilization: number;
}

export interface StreamEvent {
  timestamp: number;
  type: 'thought' | 'activation' | 'state-change' | 'memory' | 'emotion';
  content: string;
  intensity: number;
  relatedIds: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR SCHEMES - مخططات الألوان
// ═══════════════════════════════════════════════════════════════════════════════

const COLOR_SCHEMES = {
  default: {
    input: '#4CAF50',
    hidden: '#2196F3',
    output: '#FF9800',
    memory: '#9C27B0',
    decision: '#F44336',
    pattern: '#00BCD4',
    attention: '#FFEB3B',
    emotion: '#E91E63',
    creativity: '#795548',
    inactive: '#607D8B',
    synapse: '#90A4AE',
    synapseStrong: '#4CAF50',
    synapseWeak: '#B0BEC5',
  },
  heatmap: {
    low: '#313695',
    mediumLow: '#4575B4',
    medium: '#74ADD1',
    mediumHigh: '#FEE090',
    high: '#F46D43',
    veryHigh: '#A50026',
  },
  emotion: {
    curiosity: '#4CAF50',
    confidence: '#2196F3',
    urgency: '#FF9800',
    satisfaction: '#8BC34A',
    frustration: '#F44336',
    excitement: '#E91E63',
  },
  activity: {
    none: '#ECEFF1',
    low: '#B3E5FC',
    medium: '#4FC3F7',
    high: '#0288D1',
    veryHigh: '#01579B',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEURAL VISUALIZER - الفئة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════════

export class NeuralVisualizer extends EventEmitter {
  private neuralNetwork: NeuralNetwork;
  private config: VisualizationConfig;
  private updateInterval: NodeJS.Timeout | null = null;
  
  // Cached visual data
  private neuronVisuals: Map<string, NeuronVisual> = new Map();
  private synapseVisuals: Map<string, SynapseVisual> = new Map();
  private thoughtBubbles: Map<string, ThoughtBubble> = new Map();
  private heatmapData: HeatmapCell[] = [];
  private decisionTree: Map<string, DecisionNode> = new Map();
  private eventStream: StreamEvent[] = [];
  
  // Metrics history for charts
  private metricsHistory: NeuralMetrics[] = [];
  private maxHistoryLength: number = 300; // 5 minutes at 1 sample/second

  constructor(neuralNetwork: NeuralNetwork, config?: Partial<VisualizationConfig>) {
    super();
    this.neuralNetwork = neuralNetwork;
    this.config = {
      mode: '3d',
      updateInterval: 100,
      showInactive: true,
      colorScheme: 'default',
      detailLevel: 'standard',
      ...config,
    };
    
    this.setupListeners();
    this.startVisualization();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SETUP & LIFECYCLE - الإعداد والدورة الحياتية
  // ═══════════════════════════════════════════════════════════════════════════════

  private setupListeners(): void {
    this.neuralNetwork.on('neuron-activated', (activation) => {
      this.onNeuronActivation(activation);
    });

    this.neuralNetwork.on('thought-created', (thought) => {
      this.onThoughtCreated(thought);
    });

    this.neuralNetwork.on('state-transition', (event) => {
      this.onStateTransition(event);
    });

    this.neuralNetwork.on('memory-recalled', (event) => {
      this.onMemoryRecalled(event);
    });

    this.neuralNetwork.on('synapse-reinforced', (event) => {
      this.onSynapseReinforced(event);
    });

    this.neuralNetwork.on('neural-update', (event) => {
      this.onNeuralUpdate(event);
    });
  }

  private startVisualization(): void {
    this.updateInterval = setInterval(() => {
      this.updateVisualization();
    }, this.config.updateInterval);
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS - معالجات الأحداث
  // ═══════════════════════════════════════════════════════════════════════════════

  private onNeuronActivation(activation: any): void {
    const neuron = this.neuralNetwork['neurons'].get(activation.neuronId);
    if (!neuron) return;

    // Update neuron visual
    const visual = this.getOrCreateNeuronVisual(neuron);
    visual.activationLevel = activation.intensity;
    visual.pulseIntensity = 1.0;
    visual.opacity = 0.8 + activation.intensity * 0.2;

    // Add to event stream
    this.addStreamEvent({
      timestamp: Date.now(),
      type: 'activation',
      content: `Neuron ${activation.neuronId} activated`,
      intensity: activation.intensity,
      relatedIds: [activation.neuronId],
    });

    this.emit('neuron-pulse', { id: activation.neuronId, intensity: activation.intensity });
  }

  private onThoughtCreated(thought: Thought): void {
    // Create thought bubble
    const bubble: ThoughtBubble = {
      id: thought.id,
      content: thought.content.substring(0, 100) + (thought.content.length > 100 ? '...' : ''),
      x: 50 + (thought.branch * 30),
      y: 50 + (thought.depth * 25),
      size: 10 + thought.confidence * 20,
      color: this.getThoughtColor(thought.state),
      opacity: 0.7 + thought.confidence * 0.3,
      timestamp: thought.timestamp,
      depth: thought.depth,
      branch: thought.branch,
      connections: thought.relatedThoughts,
    };

    this.thoughtBubbles.set(thought.id, bubble);

    // Add to event stream
    this.addStreamEvent({
      timestamp: Date.now(),
      type: 'thought',
      content: thought.content,
      intensity: thought.confidence,
      relatedIds: [thought.id, ...(thought.parentThought ? [thought.parentThought] : [])],
    });

    this.emit('thought-bubble-created', bubble);
  }

  private onStateTransition(event: any): void {
    // Add to event stream
    this.addStreamEvent({
      timestamp: Date.now(),
      type: 'state-change',
      content: `State: ${event.from} → ${event.to}`,
      intensity: 0.8,
      relatedIds: [],
    });

    this.emit('state-visual-changed', { from: event.from, to: event.to });
  }

  private onMemoryRecalled(event: any): void {
    this.addStreamEvent({
      timestamp: Date.now(),
      type: 'memory',
      content: `Recalled ${event.count} memories`,
      intensity: 0.6,
      relatedIds: [event.topMatch].filter(Boolean),
    });
  }

  private onSynapseReinforced(event: any): void {
    const synapse = this.neuralNetwork['synapses'].get(event.id);
    if (!synapse) return;

    // Update synapse visual
    const visual = this.getOrCreateSynapseVisual(synapse);
    visual.strength = event.newWeight;
    visual.animated = true;

    setTimeout(() => {
      visual.animated = false;
    }, 500);
  }

  private onNeuralUpdate(event: any): void {
    // Update metrics
    const metrics: NeuralMetrics = {
      timestamp: Date.now(),
      totalNeurons: event.metrics.totalActivations,
      activeNeurons: event.activeNeurons,
      totalSynapses: this.neuralNetwork['synapses'].size,
      activeSynapses: 0, // Would need to calculate
      averageActivation: event.metrics.averageActivationLevel,
      networkDensity: event.metrics.networkDensity,
      thoughtCount: event.metrics.totalThoughts,
      currentState: event.currentState,
      emotionalState: { curiosity: 0.5, confidence: 0.5, urgency: 0.3, satisfaction: 0.5, frustration: 0.1, excitement: 0.5 },
      processingSpeed: this.calculateProcessingSpeed(),
      memoryUtilization: event.metrics.totalThoughts / 1000,
    };

    this.metricsHistory.push(metrics);
    
    if (this.metricsHistory.length > this.maxHistoryLength) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistoryLength);
    }

    this.emit('metrics-updated', metrics);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VISUALIZATION UPDATES - تحديثات التصور
  // ═══════════════════════════════════════════════════════════════════════════════

  private updateVisualization(): void {
    // Decay pulse intensities
    this.neuronVisuals.forEach(visual => {
      visual.pulseIntensity *= 0.95;
      if (visual.pulseIntensity < 0.01) {
        visual.pulseIntensity = 0;
      }
    });

    // Update heatmap
    this.updateHeatmap();

    // Clean up old thought bubbles
    const now = Date.now();
    this.thoughtBubbles.forEach((bubble, id) => {
      if (now - bubble.timestamp > 30000) { // 30 seconds
        this.thoughtBubbles.delete(id);
      }
    });

    // Emit update
    this.emit('visualization-updated', {
      neurons: Array.from(this.neuronVisuals.values()),
      synapses: Array.from(this.synapseVisuals.values()),
      thoughts: Array.from(this.thoughtBubbles.values()),
      heatmap: this.heatmapData,
    });
  }

  private updateHeatmap(): void {
    const neurons = Array.from(this.neuralNetwork['neurons'].values());
    this.heatmapData = neurons.map(neuron => ({
      x: neuron.position.x,
      y: neuron.position.y,
      intensity: neuron.activationLevel,
      color: this.getHeatmapColor(neuron.activationLevel),
      neuronId: neuron.id,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VISUAL DATA GENERATORS - مولدات البيانات المرئية
  // ═══════════════════════════════════════════════════════════════════════════════

  get3DNetworkData(): { neurons: NeuronVisual[]; synapses: SynapseVisual[] } {
    const neurons = Array.from(this.neuralNetwork['neurons'].values())
      .map(neuron => this.getOrCreateNeuronVisual(neuron));
    
    const synapses = Array.from(this.neuralNetwork['synapses'].values())
      .map(synapse => this.getOrCreateSynapseVisual(synapse));

    return { neurons, synapses };
  }

  get2DNetworkData(): { neurons: NeuronVisual[]; synapses: SynapseVisual[] } {
    const data3d = this.get3DNetworkData();
    
    // Project 3D to 2D (simple perspective projection)
    const neurons = data3d.neurons.map(n => ({
      ...n,
      x: n.x + n.z * 0.3,
      y: n.y + n.z * 0.2,
    }));

    const synapses = data3d.synapses.map(s => ({
      ...s,
      from: {
        x: s.from.x + s.from.z * 0.3,
        y: s.from.y + s.from.z * 0.2,
        z: 0,
      },
      to: {
        x: s.to.x + s.to.z * 0.3,
        y: s.to.y + s.to.z * 0.2,
        z: 0,
      },
    }));

    return { neurons, synapses };
  }

  getHeatmapData(): HeatmapCell[] {
    return this.heatmapData;
  }

  getThoughtStreamData(): ThoughtBubble[] {
    return Array.from(this.thoughtBubbles.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getDecisionTreeData(): DecisionNode[] {
    return Array.from(this.decisionTree.values());
  }

  getEventStreamData(limit: number = 50): StreamEvent[] {
    return this.eventStream.slice(-limit);
  }

  getMetricsHistory(): NeuralMetrics[] {
    return this.metricsHistory;
  }

  getCurrentMetrics(): NeuralMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VISUAL HELPERS - مساعدات مرئية
  // ═══════════════════════════════════════════════════════════════════════════════

  private getOrCreateNeuronVisual(neuron: Neuron): NeuronVisual {
    if (this.neuronVisuals.has(neuron.id)) {
      return this.neuronVisuals.get(neuron.id)!;
    }

    const visual: NeuronVisual = {
      id: neuron.id,
      x: neuron.position.x,
      y: neuron.position.y,
      z: neuron.position.z,
      radius: this.getNeuronRadius(neuron),
      color: this.getNeuronColor(neuron),
      opacity: this.config.showInactive ? 0.3 : 0,
      pulseIntensity: 0,
      type: neuron.type,
      activationLevel: neuron.activationLevel,
      label: this.config.detailLevel === 'detailed' ? neuron.id : undefined,
    };

    this.neuronVisuals.set(neuron.id, visual);
    return visual;
  }

  private getOrCreateSynapseVisual(synapse: Synapse): SynapseVisual {
    if (this.synapseVisuals.has(synapse.id)) {
      return this.synapseVisuals.get(synapse.id)!;
    }

    const fromNeuron = this.neuralNetwork['neurons'].get(synapse.from);
    const toNeuron = this.neuralNetwork['neurons'].get(synapse.to);

    if (!fromNeuron || !toNeuron) {
      return null as any;
    }

    const visual: SynapseVisual = {
      id: synapse.id,
      from: { ...fromNeuron.position },
      to: { ...toNeuron.position },
      strength: synapse.weight,
      color: this.getSynapseColor(synapse),
      opacity: Math.abs(synapse.weight) * 0.8,
      width: Math.abs(synapse.weight) * 3,
      animated: false,
    };

    this.synapseVisuals.set(synapse.id, visual);
    return visual;
  }

  private getNeuronRadius(neuron: Neuron): number {
    const baseRadius = 3;
    const activationBonus = neuron.activationLevel * 5;
    const connectionBonus = Math.min(neuron.connections.length * 0.2, 3);
    
    return baseRadius + activationBonus + connectionBonus;
  }

  private getNeuronColor(neuron: Neuron): string {
    if (this.config.colorScheme === 'heatmap') {
      return this.getHeatmapColor(neuron.activationLevel);
    }

    if (this.config.colorScheme === 'emotion') {
      // Would need emotional state
      return COLOR_SCHEMES.default[neuron.type] || COLOR_SCHEMES.default.inactive;
    }

    if (this.config.colorScheme === 'activity') {
      return this.getActivityColor(neuron.activationLevel);
    }

    // Default scheme by type
    if (neuron.activationLevel < 0.1 && !this.config.showInactive) {
      return 'transparent';
    }

    return COLOR_SCHEMES.default[neuron.type] || COLOR_SCHEMES.default.inactive;
  }

  private getSynapseColor(synapse: Synapse): string {
    const absWeight = Math.abs(synapse.weight);
    
    if (absWeight > 0.7) return COLOR_SCHEMES.default.synapseStrong;
    if (absWeight > 0.3) return COLOR_SCHEMES.default.synapse;
    return COLOR_SCHEMES.default.synapseWeak;
  }

  private getHeatmapColor(intensity: number): string {
    if (intensity < 0.2) return COLOR_SCHEMES.heatmap.low;
    if (intensity < 0.4) return COLOR_SCHEMES.heatmap.mediumLow;
    if (intensity < 0.6) return COLOR_SCHEMES.heatmap.medium;
    if (intensity < 0.8) return COLOR_SCHEMES.heatmap.mediumHigh;
    if (intensity < 0.95) return COLOR_SCHEMES.heatmap.high;
    return COLOR_SCHEMES.heatmap.veryHigh;
  }

  private getActivityColor(level: number): string {
    if (level < 0.1) return COLOR_SCHEMES.activity.none;
    if (level < 0.3) return COLOR_SCHEMES.activity.low;
    if (level < 0.6) return COLOR_SCHEMES.activity.medium;
    if (level < 0.9) return COLOR_SCHEMES.activity.high;
    return COLOR_SCHEMES.activity.veryHigh;
  }

  private getThoughtColor(state: NeuralState): string {
    const stateColors: Record<NeuralState, string> = {
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

    return stateColors[state] || '#9E9E9E';
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STREAM MANAGEMENT - إدارة التدفق
  // ═══════════════════════════════════════════════════════════════════════════════

  private addStreamEvent(event: StreamEvent): void {
    this.eventStream.push(event);
    
    // Keep only last 1000 events
    if (this.eventStream.length > 1000) {
      this.eventStream = this.eventStream.slice(-1000);
    }

    this.emit('stream-event', event);
  }

  private calculateProcessingSpeed(): number {
    const recentEvents = this.eventStream.filter(
      e => Date.now() - e.timestamp < 10000 // Last 10 seconds
    );
    
    const thoughtEvents = recentEvents.filter(e => e.type === 'thought');
    return thoughtEvents.length / 10; // thoughts per second
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DECISION TREE - شجرة القرارات
  // ═══════════════════════════════════════════════════════════════════════════════

  addDecisionNode(node: DecisionNode): void {
    this.decisionTree.set(node.id, node);
  }

  updateDecisionNode(id: string, updates: Partial<DecisionNode>): void {
    const node = this.decisionTree.get(id);
    if (node) {
      Object.assign(node, updates);
    }
  }

  clearDecisionTree(): void {
    this.decisionTree.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONFIGURATION - الإعدادات
  // ═══════════════════════════════════════════════════════════════════════════════

  updateConfig(updates: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Rebuild visuals if needed
    if (updates.colorScheme || updates.detailLevel) {
      this.neuronVisuals.clear();
      this.synapseVisuals.clear();
    }

    this.emit('config-updated', this.config);
  }

  getConfig(): VisualizationConfig {
    return { ...this.config };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXPORT - التصدير
  // ═══════════════════════════════════════════════════════════════════════════════

  exportSnapshot(): object {
    return {
      timestamp: Date.now(),
      config: this.config,
      neurons: Array.from(this.neuronVisuals.values()),
      synapses: Array.from(this.synapseVisuals.values()),
      thoughts: Array.from(this.thoughtBubbles.values()),
      heatmap: this.heatmapData,
      metrics: this.getCurrentMetrics(),
      eventStream: this.eventStream.slice(-100),
    };
  }
}

// Export factory
export const createVisualizer = (
  neuralNetwork: NeuralNetwork,
  config?: Partial<VisualizationConfig>
) => {
  return new NeuralVisualizer(neuralNetwork, config);
};
