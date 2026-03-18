/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEURAL DASHBOARD - لوحة التحكم العصبية
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * واجهة مستخدم تفاعلية لمراقبة النظام العصبي في الوقت الفعلي
 * تتضمن: 3D Network View, Thought Stream, State Timeline, Metrics Charts
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types from neural system
interface NeuralMetrics {
  timestamp: number;
  totalNeurons: number;
  activeNeurons: number;
  totalSynapses: number;
  averageActivation: number;
  networkDensity: number;
  thoughtCount: number;
  currentState: string;
  processingSpeed: number;
  memoryUtilization: number;
}

interface ThoughtBubble {
  id: string;
  content: string;
  depth: number;
  branch: number;
  confidence: number;
  timestamp: number;
}

interface StreamEvent {
  timestamp: number;
  type: 'thought' | 'activation' | 'state-change' | 'memory' | 'emotion';
  content: string;
  intensity: number;
}

interface NeuronVisual {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  activationLevel: number;
  type: string;
}

interface SynapseVisual {
  id: string;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  strength: number;
  color: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE INDICATOR - مؤشر الحالة
// ═══════════════════════════════════════════════════════════════════════════════

const StateIndicator: React.FC<{ state: string; duration: number }> = ({ state, duration }) => {
  const stateColors: Record<string, string> = {
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

  const color = stateColors[state] || '#9E9E9E';

  return (
    <motion.div
      className="state-indicator"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 20px',
        background: `linear-gradient(135deg, ${color}22, ${color}11)`,
        border: `2px solid ${color}`,
        borderRadius: '12px',
        boxShadow: `0 0 20px ${color}44`,
      }}
    >
      <motion.div
        animate={{
          boxShadow: [
            `0 0 10px ${color}`,
            `0 0 30px ${color}`,
            `0 0 10px ${color}`,
          ],
        }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: color,
        }}
      />
      <div>
        <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>
          Current State
        </div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color }}>
          {state.toUpperCase()}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>
          {Math.floor(duration / 1000)}s
        </div>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS CARD - بطاقة المقاييس
// ═══════════════════════════════════════════════════════════════════════════════

const MetricsCard: React.FC<{ title: string; value: string | number; subtitle?: string; color?: string }> = ({
  title,
  value,
  subtitle,
  color = '#2196F3',
}) => (
  <motion.div
    className="metrics-card"
    whileHover={{ scale: 1.02 }}
    style={{
      padding: '16px 20px',
      background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
      borderRadius: '12px',
      border: `1px solid ${color}44`,
      minWidth: '140px',
    }}
  >
    <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
      {title}
    </div>
    <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>
      {value}
    </div>
    {subtitle && (
      <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
        {subtitle}
      </div>
    )}
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// THOUGHT STREAM - تدفق الأفكار
// ═══════════════════════════════════════════════════════════════════════════════

const ThoughtStream: React.FC<{ thoughts: ThoughtBubble[] }> = ({ thoughts }) => {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [thoughts]);

  return (
    <div
      ref={streamRef}
      style={{
        height: '300px',
        overflowY: 'auto',
        padding: '16px',
        background: 'linear-gradient(180deg, #0a0a0f, #1a1a2e)',
        borderRadius: '12px',
        border: '1px solid #333',
      }}
    >
      <AnimatePresence>
        {thoughts.map((thought, index) => (
          <motion.div
            key={thought.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            style={{
              marginBottom: '12px',
              padding: '12px 16px',
              background: `linear-gradient(135deg, rgba(33, 150, 243, ${0.1 + thought.confidence * 0.2}), rgba(33, 150, 243, 0.05))`,
              borderRadius: '8px',
              borderLeft: `3px solid ${thought.confidence > 0.7 ? '#4CAF50' : thought.confidence > 0.4 ? '#FF9800' : '#F44336'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#666' }}>
                Depth: {thought.depth} | Branch: {thought.branch}
              </span>
              <span style={{ fontSize: '10px', color: '#888' }}>
                {new Date(thought.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#ddd', lineHeight: 1.5 }}>
              {thought.content}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  flex: 1,
                  height: '4px',
                  background: '#333',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${thought.confidence * 100}%` }}
                  transition={{ duration: 0.5 }}
                  style={{
                    height: '100%',
                    background: thought.confidence > 0.7 ? '#4CAF50' : thought.confidence > 0.4 ? '#FF9800' : '#F44336',
                  }}
                />
              </div>
              <span style={{ fontSize: '10px', color: '#888' }}>
                {Math.round(thought.confidence * 100)}%
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NETWORK VISUALIZATION - تصور الشبكة
// ═══════════════════════════════════════════════════════════════════════════════

const NetworkVisualization: React.FC<{ neurons: NeuronVisual[]; synapses: SynapseVisual[] }> = ({
  neurons,
  synapses,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    let rotation = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      const centerX = canvas.offsetWidth / 2;
      const centerY = canvas.offsetHeight / 2;
      const scale = 0.8;

      rotation += 0.002;

      // Draw synapses
      synapses.forEach((synapse) => {
        const fromX = centerX + synapse.from.x * scale;
        const fromY = centerY + synapse.from.y * scale;
        const toX = centerX + synapse.to.x * scale;
        const toY = centerY + synapse.to.y * scale;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.strokeStyle = synapse.color;
        ctx.lineWidth = Math.abs(synapse.strength) * 2;
        ctx.globalAlpha = Math.abs(synapse.strength) * 0.6;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;

      // Draw neurons
      neurons.forEach((neuron) => {
        const x = centerX + neuron.x * scale;
        const y = centerY + neuron.y * scale;

        // Glow effect for active neurons
        if (neuron.activationLevel > 0.3) {
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, neuron.radius * 3);
          gradient.addColorStop(0, neuron.color + '88');
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, neuron.radius * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Neuron body
        ctx.beginPath();
        ctx.arc(x, y, neuron.radius, 0, Math.PI * 2);
        ctx.fillStyle = neuron.color;
        ctx.fill();

        // Border
        ctx.strokeStyle = neuron.activationLevel > 0.5 ? '#fff' : '#444';
        ctx.lineWidth = neuron.activationLevel > 0.5 ? 2 : 1;
        ctx.stroke();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [neurons, synapses]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)',
        borderRadius: '12px',
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY CHART - رسم النشاط
// ═══════════════════════════════════════════════════════════════════════════════

const ActivityChart: React.FC<{ data: NeuralMetrics[] }> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw activation line
    const maxVal = 1;
    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - (d.averageActivation / maxVal) * height,
    }));

    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i].x + points[i - 1].x) / 2;
        const yc = (points[i].y + points[i - 1].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
      }
      
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      
      // Gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(33, 150, 243, 0.5)');
      gradient.addColorStop(1, 'rgba(33, 150, 243, 0)');
      
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw active neurons line
    const maxNeurons = Math.max(...data.map(d => d.activeNeurons), 1);
    const neuronPoints = data.map((d, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - (d.activeNeurons / maxNeurons) * height * 0.5,
    }));

    if (neuronPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(neuronPoints[0].x, neuronPoints[0].y);
      
      for (let i = 1; i < neuronPoints.length; i++) {
        ctx.lineTo(neuronPoints[i].x, neuronPoints[i].y);
      }
      
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '120px',
        background: '#0a0a0f',
        borderRadius: '8px',
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT STREAM - تدفق الأحداث
// ═══════════════════════════════════════════════════════════════════════════════

const EventStream: React.FC<{ events: StreamEvent[] }> = ({ events }) => (
  <div
    style={{
      height: '200px',
      overflowY: 'auto',
      padding: '12px',
      background: '#0a0a0f',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '11px',
    }}
  >
    <AnimatePresence>
      {events.map((event, index) => {
        const typeColors: Record<string, string> = {
          thought: '#2196F3',
          activation: '#4CAF50',
          'state-change': '#FF9800',
          memory: '#9C27B0',
          emotion: '#E91E63',
        };

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            style={{
              padding: '4px 0',
              borderBottom: '1px solid #1a1a2e',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: '#666' }}>
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                background: typeColors[event.type] + '22',
                color: typeColors[event.type],
                fontSize: '9px',
                textTransform: 'uppercase',
              }}
            >
              {event.type}
            </span>
            <span style={{ color: '#aaa' }}>{event.content}</span>
            <span style={{ color: '#666', marginLeft: 'auto' }}>
              {Math.round(event.intensity * 100)}%
            </span>
          </motion.div>
        );
      })}
    </AnimatePresence>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD - لوحة التحكم الرئيسية
// ═══════════════════════════════════════════════════════════════════════════════

interface NeuralDashboardProps {
  neuralNetwork: any;
  stateManager: any;
  visualizer: any;
}

export const NeuralDashboard: React.FC<NeuralDashboardProps> = ({
  neuralNetwork,
  stateManager,
  visualizer,
}) => {
  const [metrics, setMetrics] = useState<NeuralMetrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<NeuralMetrics[]>([]);
  const [thoughts, setThoughts] = useState<ThoughtBubble[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [neurons, setNeurons] = useState<NeuronVisual[]>([]);
  const [synapses, setSynapses] = useState<SynapseVisual[]>([]);
  const [currentState, setCurrentState] = useState<string>('idle');
  const [stateDuration, setStateDuration] = useState<number>(0);

  useEffect(() => {
    // Subscribe to visualizer updates
    const handleUpdate = (data: any) => {
      setNeurons(data.neurons || []);
      setSynapses(data.synapses || []);
    };

    const handleMetrics = (m: NeuralMetrics) => {
      setMetrics(m);
      setMetricsHistory((prev) => [...prev.slice(-100), m]);
    };

    const handleThought = (t: ThoughtBubble) => {
      setThoughts((prev) => [...prev.slice(-50), t]);
    };

    const handleStreamEvent = (e: StreamEvent) => {
      setEvents((prev) => [...prev.slice(-100), e]);
    };

    const handleStateChange = (e: any) => {
      setCurrentState(e.to);
      setStateDuration(0);
    };

    visualizer?.on('visualization-updated', handleUpdate);
    visualizer?.on('metrics-updated', handleMetrics);
    visualizer?.on('thought-bubble-created', handleThought);
    visualizer?.on('stream-event', handleStreamEvent);
    stateManager?.on('state-changed', handleStateChange);

    // Update state duration
    const durationInterval = setInterval(() => {
      setStateDuration((d) => d + 100);
    }, 100);

    return () => {
      visualizer?.off('visualization-updated', handleUpdate);
      visualizer?.off('metrics-updated', handleMetrics);
      visualizer?.off('thought-bubble-created', handleThought);
      visualizer?.off('stream-event', handleStreamEvent);
      stateManager?.off('state-changed', handleStateChange);
      clearInterval(durationInterval);
    };
  }, [visualizer, stateManager]);

  return (
    <div
      style={{
        padding: '20px',
        background: '#050508',
        minHeight: '100vh',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', background: 'linear-gradient(90deg, #2196F3, #9C27B0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          🧠 Neural Dashboard
        </h1>
        <p style={{ margin: '8px 0 0', color: '#666', fontSize: '14px' }}>
          Real-time neural network monitoring and visualization
        </p>
      </div>

      {/* State Indicator */}
      <div style={{ marginBottom: '20px' }}>
        <StateIndicator state={currentState} duration={stateDuration} />
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <MetricsCard
          title="Active Neurons"
          value={metrics?.activeNeurons || 0}
          subtitle={`of ${metrics?.totalNeurons || 0} total`}
          color="#4CAF50"
        />
        <MetricsCard
          title="Network Density"
          value={`${((metrics?.networkDensity || 0) * 100).toFixed(1)}%`}
          color="#2196F3"
        />
        <MetricsCard
          title="Avg Activation"
          value={`${((metrics?.averageActivation || 0) * 100).toFixed(1)}%`}
          color="#FF9800"
        />
        <MetricsCard
          title="Thoughts"
          value={metrics?.thoughtCount || 0}
          subtitle={`${(metrics?.processingSpeed || 0).toFixed(1)}/sec`}
          color="#9C27B0"
        />
        <MetricsCard
          title="Memory"
          value={`${((metrics?.memoryUtilization || 0) * 100).toFixed(0)}%`}
          color="#E91E63"
        />
      </div>

      {/* Main Content Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '20px',
        }}
      >
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Network Visualization */}
          <div
            style={{
              height: '400px',
              background: '#0a0a0f',
              borderRadius: '12px',
              border: '1px solid #1a1a2e',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #1a1a2e',
                fontSize: '14px',
                fontWeight: 600,
                color: '#888',
              }}
            >
              Neural Network
            </div>
            <div style={{ height: 'calc(100% - 45px)' }}>
              <NetworkVisualization neurons={neurons} synapses={synapses} />
            </div>
          </div>

          {/* Activity Chart */}
          <div
            style={{
              background: '#0a0a0f',
              borderRadius: '12px',
              border: '1px solid #1a1a2e',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#888', marginBottom: '12px' }}>
              Activity History
            </div>
            <ActivityChart data={metricsHistory} />
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Thought Stream */}
          <div
            style={{
              background: '#0a0a0f',
              borderRadius: '12px',
              border: '1px solid #1a1a2e',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #1a1a2e',
                fontSize: '14px',
                fontWeight: 600,
                color: '#888',
              }}
            >
              Thought Stream
            </div>
            <ThoughtStream thoughts={thoughts} />
          </div>

          {/* Event Stream */}
          <div
            style={{
              background: '#0a0a0f',
              borderRadius: '12px',
              border: '1px solid #1a1a2e',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #1a1a2e',
                fontSize: '14px',
                fontWeight: 600,
                color: '#888',
              }}
            >
              Event Stream
            </div>
            <div style={{ padding: '8px' }}>
              <EventStream events={events} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NeuralDashboard;
