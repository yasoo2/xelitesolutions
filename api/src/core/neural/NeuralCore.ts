/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEURAL CORE SYSTEM - النظام العصبي المركزي
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * نظام عصبي متقدم يحاكي عمل الدماغ البشري في معالجة المعلومات واتخاذ القرارات
 * يتضمن: Neurons, Synapses, Neural Pathways, Plasticity, Memory Networks
 */

import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

export type NeuralState = 
  | 'idle'           | 'analyzing'      | 'processing' 
  | 'synthesizing'   | 'deciding'       | 'executing'
  | 'learning'       | 'recalling'      | 'reflecting'
  | 'optimizing'     | 'healing'        | 'completing';

export type NeuronType = 
  | 'input'          | 'hidden'         | 'output'
  | 'memory'         | 'decision'       | 'pattern'
  | 'attention'      | 'emotion'        | 'creativity';

export type SynapticStrength = 'weak' | 'moderate' | 'strong' | 'very-strong';

export interface NeuralActivation {
  neuronId: string;
  timestamp: number;
  intensity: number;        // 0.0 to 1.0
  state: NeuralState;
  thought: string;
  confidence: number;
  relatedNeurons: string[];
}

export interface Neuron {
  id: string;
  type: NeuronType;
  layer: number;
  position: { x: number; y: number; z: number };
  activationLevel: number;
  threshold: number;
  lastActivated: number;
  activationHistory: NeuralActivation[];
  connections: Synapse[];
  metadata: {
    createdAt: number;
    activationCount: number;
    totalActivationTime: number;
    specialization: string[];
  };
}

export interface Synapse {
  id: string;
  from: string;             // Neuron ID
  to: string;               // Neuron ID
  weight: number;           // -1.0 to 1.0
  strength: SynapticStrength;
  lastUsed: number;
  useCount: number;
  plasticity: number;       // How easily weight changes
  metadata: {
    createdAt: number;
    reinforcedCount: number;
    weakenedCount: number;
  };
}

export interface Thought {
  id: string;
  content: string;
  timestamp: number;
  state: NeuralState;
  confidence: number;
  sourceNeurons: string[];
  relatedThoughts: string[];
  depth: number;            // How deep in thought process
  branch: number;           // Which branch of thinking
  parentThought?: string;
  childThoughts: string[];
}

export interface NeuralPathway {
  id: string;
  name: string;
  neurons: string[];        // Ordered list of neuron IDs
  synapses: string[];       // Ordered list of synapse IDs
  strength: number;
  useCount: number;
  lastUsed: number;
  isActive: boolean;
  activationPattern: number[];
}

export interface MemoryEngram {
  id: string;
  type: 'short-term' | 'long-term' | 'procedural' | 'semantic' | 'episodic';
  content: any;
  timestamp: number;
  strength: number;         // Memory strength (decays over time)
  accessCount: number;
  lastAccessed: number;
  associatedNeurons: string[];
  emotionalTag?: string;
  importance: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEURAL CONSTANTS - الثوابت العصبية
// ═══════════════════════════════════════════════════════════════════════════════

const NEURAL_CONSTANTS = {
  // Activation thresholds
  ACTIVATION_THRESHOLD: 0.3,
  STRONG_ACTIVATION: 0.7,
  MAX_ACTIVATION: 1.0,
  
  // Decay rates
  ACTIVATION_DECAY: 0.95,        // How fast activation fades
  MEMORY_DECAY: 0.99,            // How fast memories fade
  SYNAPTIC_DECAY: 0.999,         // How fast unused synapses weaken
  
  // Learning rates
  HEBBIAN_LEARNING_RATE: 0.1,    // "Neurons that fire together, wire together"
  PLASTICITY_DECAY: 0.995,       // Plasticity decreases with age
  
  // Network limits
  MAX_NEURONS: 10000,
  MAX_SYNAPSES_PER_NEURON: 100,
  MAX_MEMORY_ENGRAMS: 50000,
  
  // Timing
  REFRACTORY_PERIOD: 50,         // ms before neuron can fire again
  THOUGHT_INTERVAL: 100,         // ms between thought updates
  
  // States
  STATE_TRANSITION_PROBABILITY: 0.3,
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEURAL NETWORK - الشبكة العصبية
// ═══════════════════════════════════════════════════════════════════════════════

export class NeuralNetwork extends EventEmitter {
  private neurons: Map<string, Neuron> = new Map();
  private synapses: Map<string, Synapse> = new Map();
  private pathways: Map<string, NeuralPathway> = new Map();
  private memories: Map<string, MemoryEngram> = new Map();
  private thoughts: Map<string, Thought> = new Map();
  
  private activeNeurons: Set<string> = new Set();
  private currentState: NeuralState = 'idle';
  private stateHistory: Array<{ state: NeuralState; timestamp: number }> = [];
  
  private thoughtCounter: number = 0;
  private neuronCounter: number = 0;
  private synapseCounter: number = 0;
  
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  
  // Metrics
  private metrics = {
    totalActivations: 0,
    totalThoughts: 0,
    averageActivationLevel: 0,
    networkDensity: 0,
    averagePathwayStrength: 0,
  };

  constructor() {
    super();
    this.initializeCoreNeurons();
    this.startNeuralCycle();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION - التهيئة
  // ═══════════════════════════════════════════════════════════════════════════════

  private initializeCoreNeurons(): void {
    // Create core state neurons
    const states: NeuralState[] = [
      'idle', 'analyzing', 'processing', 'synthesizing', 
      'deciding', 'executing', 'learning', 'recalling', 
      'reflecting', 'optimizing', 'healing', 'completing'
    ];

    states.forEach((state, index) => {
      this.createNeuron({
        type: 'decision',
        layer: 0,
        position: { x: index * 10, y: 0, z: 0 },
        specialization: [state]
      });
    });

    // Create input processing neurons
    for (let i = 0; i < 20; i++) {
      this.createNeuron({
        type: 'input',
        layer: 1,
        position: { x: i * 5, y: 10, z: Math.random() * 5 },
        specialization: ['input-processing']
      });
    }

    // Create pattern recognition neurons
    for (let i = 0; i < 50; i++) {
      this.createNeuron({
        type: 'pattern',
        layer: 2,
        position: { x: Math.random() * 100, y: 20, z: Math.random() * 10 },
        specialization: ['pattern-recognition']
      });
    }

    // Create memory neurons
    for (let i = 0; i < 30; i++) {
      this.createNeuron({
        type: 'memory',
        layer: 3,
        position: { x: Math.random() * 100, y: 30, z: Math.random() * 10 },
        specialization: ['memory-storage']
      });
    }

    // Create attention neurons
    for (let i = 0; i < 10; i++) {
      this.createNeuron({
        type: 'attention',
        layer: 4,
        position: { x: i * 10, y: 40, z: 0 },
        specialization: ['attention-focus']
      });
    }

    // Create output neurons
    for (let i = 0; i < 15; i++) {
      this.createNeuron({
        type: 'output',
        layer: 5,
        position: { x: i * 7, y: 50, z: 0 },
        specialization: ['output-generation']
      });
    }

    // Create initial connections
    this.createInitialConnections();
    
    this.emit('initialized', { 
      neurons: this.neurons.size, 
      synapses: this.synapses.size 
    });
  }

  private createInitialConnections(): void {
    const inputNeurons = this.getNeuronsByType('input');
    const patternNeurons = this.getNeuronsByType('pattern');
    const memoryNeurons = this.getNeuronsByType('memory');
    const attentionNeurons = this.getNeuronsByType('attention');
    const outputNeurons = this.getNeuronsByType('output');

    // Connect input → pattern (dense)
    inputNeurons.forEach(input => {
      patternNeurons.forEach(pattern => {
        if (Math.random() < 0.3) {
          this.createSynapse(input.id, pattern.id, Math.random() * 0.5);
        }
      });
    });

    // Connect pattern → memory (moderate)
    patternNeurons.forEach(pattern => {
      memoryNeurons.forEach(memory => {
        if (Math.random() < 0.2) {
          this.createSynapse(pattern.id, memory.id, Math.random() * 0.4);
        }
      });
    });

    // Connect attention → all (sparse but strong)
    attentionNeurons.forEach(attention => {
      [...patternNeurons, ...memoryNeurons].forEach(target => {
        if (Math.random() < 0.1) {
          this.createSynapse(attention.id, target.id, 0.7 + Math.random() * 0.3);
        }
      });
    });

    // Connect memory → output
    memoryNeurons.forEach(memory => {
      outputNeurons.forEach(output => {
        if (Math.random() < 0.15) {
          this.createSynapse(memory.id, output.id, Math.random() * 0.5);
        }
      });
    });

    // Connect pattern → output (direct)
    patternNeurons.forEach(pattern => {
      outputNeurons.forEach(output => {
        if (Math.random() < 0.1) {
          this.createSynapse(pattern.id, output.id, Math.random() * 0.3);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // NEURON MANAGEMENT - إدارة العصبونات
  // ═══════════════════════════════════════════════════════════════════════════════

  createNeuron(options: {
    type: NeuronType;
    layer: number;
    position: { x: number; y: number; z: number };
    threshold?: number;
    specialization?: string[];
  }): Neuron {
    const id = `neuron_${++this.neuronCounter}_${Date.now()}`;
    
    const neuron: Neuron = {
      id,
      type: options.type,
      layer: options.layer,
      position: options.position,
      activationLevel: 0,
      threshold: options.threshold || NEURAL_CONSTANTS.ACTIVATION_THRESHOLD,
      lastActivated: 0,
      activationHistory: [],
      connections: [],
      metadata: {
        createdAt: Date.now(),
        activationCount: 0,
        totalActivationTime: 0,
        specialization: options.specialization || [],
      },
    };

    this.neurons.set(id, neuron);
    this.emit('neuron-created', { id, type: options.type });
    
    return neuron;
  }

  activateNeuron(neuronId: string, intensity: number = 1.0): boolean {
    const neuron = this.neurons.get(neuronId);
    if (!neuron) return false;

    // Check refractory period
    const timeSinceLastActivation = Date.now() - neuron.lastActivated;
    if (timeSinceLastActivation < NEURAL_CONSTANTS.REFRACTORY_PERIOD) {
      return false;
    }

    // Activate
    neuron.activationLevel = Math.min(
      NEURAL_CONSTANTS.MAX_ACTIVATION,
      neuron.activationLevel + intensity
    );

    if (neuron.activationLevel >= neuron.threshold) {
      neuron.lastActivated = Date.now();
      neuron.metadata.activationCount++;
      this.activeNeurons.add(neuronId);

      const activation: NeuralActivation = {
        neuronId,
        timestamp: Date.now(),
        intensity,
        state: this.currentState,
        thought: this.getCurrentThought()?.content || '',
        confidence: this.getCurrentThought()?.confidence || 0.5,
        relatedNeurons: neuron.connections.map(s => s.to),
      };

      neuron.activationHistory.push(activation);
      this.metrics.totalActivations++;

      // Propagate to connected neurons
      this.propagateActivation(neuron, intensity);

      this.emit('neuron-activated', activation);
      return true;
    }

    return false;
  }

  private propagateActivation(neuron: Neuron, intensity: number): void {
    neuron.connections.forEach(synapse => {
      const targetNeuron = this.neurons.get(synapse.to);
      if (targetNeuron) {
        const propagatedIntensity = intensity * synapse.weight * synapse.plasticity;
        if (propagatedIntensity > 0.1) {
          setTimeout(() => {
            this.activateNeuron(synapse.to, propagatedIntensity);
          }, 10);
        }
      }
    });
  }

  private decayActivations(): void {
    this.neurons.forEach(neuron => {
      neuron.activationLevel *= NEURAL_CONSTANTS.ACTIVATION_DECAY;
      
      if (neuron.activationLevel < 0.01) {
        neuron.activationLevel = 0;
        this.activeNeurons.delete(neuron.id);
      }
    });
  }

  getNeuronsByType(type: NeuronType): Neuron[] {
    return Array.from(this.neurons.values()).filter(n => n.type === type);
  }

  getActiveNeurons(): Neuron[] {
    return Array.from(this.activeNeurons).map(id => this.neurons.get(id)!).filter(Boolean);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SYNAPSE MANAGEMENT - إدارة المشابك العصبية
  // ═══════════════════════════════════════════════════════════════════════════════

  createSynapse(from: string, to: string, weight: number): Synapse | null {
    const fromNeuron = this.neurons.get(from);
    const toNeuron = this.neurons.get(to);
    
    if (!fromNeuron || !toNeuron) return null;
    if (fromNeuron.connections.length >= NEURAL_CONSTANTS.MAX_SYNAPSES_PER_NEURON) {
      return null;
    }

    const id = `synapse_${++this.synapseCounter}_${Date.now()}`;
    
    const synapse: Synapse = {
      id,
      from,
      to,
      weight: Math.max(-1, Math.min(1, weight)),
      strength: this.weightToStrength(Math.abs(weight)),
      lastUsed: 0,
      useCount: 0,
      plasticity: 1.0,
      metadata: {
        createdAt: Date.now(),
        reinforcedCount: 0,
        weakenedCount: 0,
      },
    };

    this.synapses.set(id, synapse);
    fromNeuron.connections.push(synapse);
    
    this.emit('synapse-created', { id, from, to, weight });
    
    return synapse;
  }

  reinforceSynapse(synapseId: string, amount: number = 0.1): void {
    const synapse = this.synapses.get(synapseId);
    if (!synapse) return;

    synapse.weight = Math.min(1, synapse.weight + amount * synapse.plasticity);
    synapse.strength = this.weightToStrength(Math.abs(synapse.weight));
    synapse.metadata.reinforcedCount++;
    synapse.plasticity *= NEURAL_CONSTANTS.PLASTICITY_DECAY;
    
    this.emit('synapse-reinforced', { id: synapseId, newWeight: synapse.weight });
  }

  weakenSynapse(synapseId: string, amount: number = 0.05): void {
    const synapse = this.synapses.get(synapseId);
    if (!synapse) return;

    synapse.weight = Math.max(-1, synapse.weight - amount);
    synapse.strength = this.weightToStrength(Math.abs(synapse.weight));
    synapse.metadata.weakenedCount++;
    
    this.emit('synapse-weakened', { id: synapseId, newWeight: synapse.weight });
  }

  private weightToStrength(weight: number): SynapticStrength {
    if (weight < 0.3) return 'weak';
    if (weight < 0.6) return 'moderate';
    if (weight < 0.85) return 'strong';
    return 'very-strong';
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // THOUGHT PROCESS - عملية التفكير
  // ═══════════════════════════════════════════════════════════════════════════════

  createThought(content: string, options?: {
    state?: NeuralState;
    confidence?: number;
    parentThought?: string;
    depth?: number;
    branch?: number;
  }): Thought {
    const id = `thought_${++this.thoughtCounter}_${Date.now()}`;
    
    const thought: Thought = {
      id,
      content,
      timestamp: Date.now(),
      state: options?.state || this.currentState,
      confidence: options?.confidence || 0.5,
      sourceNeurons: Array.from(this.activeNeurons),
      relatedThoughts: [],
      depth: options?.depth || 0,
      branch: options?.branch || 0,
      parentThought: options?.parentThought,
      childThoughts: [],
    };

    // Link to parent
    if (thought.parentThought) {
      const parent = this.thoughts.get(thought.parentThought);
      if (parent) {
        parent.childThoughts.push(id);
        thought.relatedThoughts.push(parent.id);
      }
    }

    this.thoughts.set(id, thought);
    this.metrics.totalThoughts++;

    // Activate relevant neurons
    this.activateRelevantNeurons(content);

    this.emit('thought-created', { id, content, state: thought.state });
    
    return thought;
  }

  private activateRelevantNeurons(content: string): void {
    const keywords = content.toLowerCase().split(/\s+/);
    
    this.neurons.forEach(neuron => {
      const relevance = keywords.filter(kw => 
        neuron.metadata.specialization.some(spec => 
          spec.toLowerCase().includes(kw) || kw.includes(spec.toLowerCase())
        )
      ).length;
      
      if (relevance > 0) {
        this.activateNeuron(neuron.id, relevance * 0.3);
      }
    });
  }

  getCurrentThought(): Thought | undefined {
    const thoughts = Array.from(this.thoughts.values());
    if (thoughts.length === 0) return undefined;
    
    return thoughts.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  getThoughtChain(thoughtId: string): Thought[] {
    const chain: Thought[] = [];
    let current = this.thoughts.get(thoughtId);
    
    while (current) {
      chain.unshift(current);
      current = current.parentThought ? this.thoughts.get(current.parentThought) : undefined;
    }
    
    return chain;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT - إدارة الحالات
  // ═══════════════════════════════════════════════════════════════════════════════

  transitionState(newState: NeuralState, reason?: string): void {
    const oldState = this.currentState;
    this.currentState = newState;
    
    this.stateHistory.push({
      state: newState,
      timestamp: Date.now(),
    });

    // Activate state-specific neurons
    const stateNeurons = Array.from(this.neurons.values()).filter(
      n => n.metadata.specialization.includes(newState)
    );
    
    stateNeurons.forEach(neuron => {
      this.activateNeuron(neuron.id, 0.8);
    });

    this.emit('state-transition', { 
      from: oldState, 
      to: newState, 
      reason,
      timestamp: Date.now()
    });
  }

  getCurrentState(): NeuralState {
    return this.currentState;
  }

  getStateHistory(): Array<{ state: NeuralState; timestamp: number }> {
    return [...this.stateHistory];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
// MEMORY SYSTEM - نظام الذاكرة
// ═══════════════════════════════════════════════════════════════════════════════

storeMemory(content: any, options?: {
    type?: MemoryEngram['type'];
    importance?: number;
    emotionalTag?: string;
    associatedNeurons?: string[];
  }): MemoryEngram {
    const id = `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Find or create associated neurons
    const associatedNeurons = options?.associatedNeurons || 
      this.findRelevantNeurons(JSON.stringify(content));

    const memory: MemoryEngram = {
      id,
      type: options?.type || 'short-term',
      content,
      timestamp: Date.now(),
      strength: options?.importance || 0.5,
      accessCount: 0,
      lastAccessed: Date.now(),
      associatedNeurons,
      emotionalTag: options?.emotionalTag,
      importance: options?.importance || 0.5,
    };

    this.memories.set(id, memory);

    // Strengthen associated synapses
    associatedNeurons.forEach(neuronId => {
      const neuron = this.neurons.get(neuronId);
      if (neuron) {
        neuron.connections.forEach(synapse => {
          if (associatedNeurons.includes(synapse.to)) {
            this.reinforceSynapse(synapse.id, 0.2);
          }
        });
      }
    });

    this.emit('memory-stored', { id, type: memory.type, strength: memory.strength });
    
    return memory;
  }

  recallMemory(query: string, options?: {
    type?: MemoryEngram['type'];
    minStrength?: number;
    limit?: number;
  }): MemoryEngram[] {
    const queryLower = query.toLowerCase();
    const queryKeywords = queryLower.split(/\s+/);

    const memories = Array.from(this.memories.values())
      .filter(m => !options?.type || m.type === options.type)
      .filter(m => !options?.minStrength || m.strength >= options.minStrength)
      .map(memory => {
        // Calculate relevance score
        const contentStr = JSON.stringify(memory.content).toLowerCase();
        
        // Keyword match score
        const keywordScore = queryKeywords.filter(kw => 
          contentStr.includes(kw)
        ).length / queryKeywords.length;

        // Recency score (newer = better)
        const age = Date.now() - memory.timestamp;
        const recencyScore = Math.exp(-age / (24 * 60 * 60 * 1000)); // Decay over 24 hours

        // Access frequency score
        const accessScore = Math.min(memory.accessCount / 10, 1);

        // Emotional relevance (if tagged)
        const emotionalBonus = memory.emotionalTag ? 0.2 : 0;

        // Combined score
        const relevance = (
          keywordScore * 0.4 +
          recencyScore * 0.2 +
          accessScore * 0.2 +
          memory.strength * 0.15 +
          memory.importance * 0.05 +
          emotionalBonus
        );

        return { memory, relevance };
      })
      .filter(({ relevance }) => relevance > 0.1)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, options?.limit || 10)
      .map(({ memory }) => {
        // Update access stats
        memory.accessCount++;
        memory.lastAccessed = Date.now();
        
        // Reactivate associated neurons
        memory.associatedNeurons.forEach(neuronId => {
          this.activateNeuron(neuronId, 0.3);
        });

        return memory;
      });

    this.emit('memory-recalled', { 
      query, 
      count: memories.length,
      topMatch: memories[0]?.id 
    });

    return memories;
  }

  consolidateMemory(memoryId: string): boolean {
    const memory = this.memories.get(memoryId);
    if (!memory) return false;

    if (memory.type === 'short-term' && memory.accessCount >= 3) {
      memory.type = 'long-term';
      memory.strength = Math.min(1, memory.strength * 1.5);
      
      this.emit('memory-consolidated', { id: memoryId, newType: 'long-term' });
      return true;
    }

    return false;
  }

  private findRelevantNeurons(content: string): string[] {
    const keywords = content.toLowerCase().split(/\s+/);
    const relevant: string[] = [];

    this.neurons.forEach(neuron => {
      const matchScore = keywords.filter(kw =>
        neuron.metadata.specialization.some(spec =>
          spec.toLowerCase().includes(kw) || content.toLowerCase().includes(spec.toLowerCase())
        )
      ).length;

      if (matchScore > 0) {
        relevant.push(neuron.id);
      }
    });

    return relevant.slice(0, 10);
  }

  private decayMemories(): void {
    this.memories.forEach(memory => {
      const age = Date.now() - memory.timestamp;
      const decayFactor = Math.pow(NEURAL_CONSTANTS.MEMORY_DECAY, age / 1000);
      memory.strength *= decayFactor;

      // Remove very weak memories
      if (memory.strength < 0.01 && memory.type === 'short-term') {
        this.memories.delete(memory.id);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATHWAY MANAGEMENT - إدارة المسارات العصبية
  // ═══════════════════════════════════════════════════════════════════════════════

  createPathway(name: string, neuronIds: string[]): NeuralPathway | null {
    if (neuronIds.length < 2) return null;

    const id = `pathway_${Date.now()}`;
    const synapses: string[] = [];

    // Create or find synapses between consecutive neurons
    for (let i = 0; i < neuronIds.length - 1; i++) {
      const fromNeuron = this.neurons.get(neuronIds[i]);
      if (!fromNeuron) continue;

      const existingSynapse = fromNeuron.connections.find(s => s.to === neuronIds[i + 1]);
      
      if (existingSynapse) {
        synapses.push(existingSynapse.id);
      } else {
        const newSynapse = this.createSynapse(neuronIds[i], neuronIds[i + 1], 0.5);
        if (newSynapse) {
          synapses.push(newSynapse.id);
        }
      }
    }

    const pathway: NeuralPathway = {
      id,
      name,
      neurons: neuronIds,
      synapses,
      strength: this.calculatePathwayStrength(synapses),
      useCount: 0,
      lastUsed: Date.now(),
      isActive: false,
      activationPattern: [],
    };

    this.pathways.set(id, pathway);
    this.emit('pathway-created', { id, name, neuronCount: neuronIds.length });

    return pathway;
  }

  activatePathway(pathwayId: string): boolean {
    const pathway = this.pathways.get(pathwayId);
    if (!pathway) return false;

    pathway.isActive = true;
    pathway.useCount++;
    pathway.lastUsed = Date.now();

    // Activate neurons in sequence
    pathway.neurons.forEach((neuronId, index) => {
      setTimeout(() => {
        this.activateNeuron(neuronId, 0.7);
      }, index * 20);
    });

    // Strengthen pathway
    pathway.synapses.forEach(synapseId => {
      this.reinforceSynapse(synapseId, 0.05);
    });

    pathway.strength = this.calculatePathwayStrength(pathway.synapses);

    this.emit('pathway-activated', { id: pathwayId, strength: pathway.strength });
    
    return true;
  }

  private calculatePathwayStrength(synapseIds: string[]): number {
    if (synapseIds.length === 0) return 0;
    
    const totalWeight = synapseIds.reduce((sum, id) => {
      const synapse = this.synapses.get(id);
      return sum + (synapse?.weight || 0);
    }, 0);

    return totalWeight / synapseIds.length;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // NEURAL CYCLE - الدورة العصبية
  // ═══════════════════════════════════════════════════════════════════════════════

  private startNeuralCycle(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    this.updateInterval = setInterval(() => {
      this.neuralUpdate();
    }, NEURAL_CONSTANTS.THOUGHT_INTERVAL);

    this.emit('cycle-started');
  }

  private neuralUpdate(): void {
    // Decay activations
    this.decayActivations();

    // Decay memories
    this.decayMemories();

    // Update metrics
    this.updateMetrics();

    // Emit status
    this.emit('neural-update', {
      activeNeurons: this.activeNeurons.size,
      currentState: this.currentState,
      totalThoughts: this.thoughts.size,
      totalMemories: this.memories.size,
      metrics: this.metrics,
    });
  }

  private updateMetrics(): void {
    const neurons = Array.from(this.neurons.values());
    
    this.metrics.averageActivationLevel = neurons.reduce(
      (sum, n) => sum + n.activationLevel, 0
    ) / neurons.length;

    const totalPossibleSynapses = neurons.length * NEURAL_CONSTANTS.MAX_SYNAPSES_PER_NEURON;
    this.metrics.networkDensity = this.synapses.size / totalPossibleSynapses;

    const pathways = Array.from(this.pathways.values());
    this.metrics.averagePathwayStrength = pathways.length > 0
      ? pathways.reduce((sum, p) => sum + p.strength, 0) / pathways.length
      : 0;
  }

  stop(): void {
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.emit('cycle-stopped');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXPORT/IMPORT - التصدير والاستيراد
  // ═══════════════════════════════════════════════════════════════════════════════

  exportState(): object {
    return {
      neurons: Array.from(this.neurons.entries()),
      synapses: Array.from(this.synapses.entries()),
      pathways: Array.from(this.pathways.entries()),
      memories: Array.from(this.memories.entries()),
      thoughts: Array.from(this.thoughts.entries()),
      currentState: this.currentState,
      stateHistory: this.stateHistory,
      metrics: this.metrics,
    };
  }

  importState(state: object): void {
    // Implementation for importing saved state
    this.emit('state-imported');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GETTERS - دوال الاسترجاع
  // ═══════════════════════════════════════════════════════════════════════════════

  getMetrics() {
    return { ...this.metrics };
  }

  getNetworkStats() {
    return {
      neurons: this.neurons.size,
      synapses: this.synapses.size,
      pathways: this.pathways.size,
      memories: this.memories.size,
      thoughts: this.thoughts.size,
      activeNeurons: this.activeNeurons.size,
      currentState: this.currentState,
    };
  }
}

// Export singleton instance
export const neuralCore = new NeuralNetwork();
