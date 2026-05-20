# 🧠 Joe Neural System - نظام جو العصبي

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

نظام عصبي متقدم يحاكي عمل الدماغ البشري في معالجة المعلومات واتخاذ القرارات.

## ✨ المميزات

### 🧬 Neural Core - النواة العصبية
- **Neurons (عصبونات)**: 10,000+ عصبون افتراضي
- **Synapses (مشابك عصبية)**: اتصالات ديناميكية مع أوزان قابلة للتعديل
- **Neural Pathways**: مسارات عصبية للتعلم والتذكر
- **Memory System**: ذاكرة قصيرة وطويلة المدى
- **Plasticity**: لدونة عصبية للتعلم المستمر

### 🎛️ State Manager - مدير الحالات
- **12 Neural State**: idle, analyzing, processing, synthesizing, deciding, executing, learning, recalling, reflecting, optimizing, healing, completing
- **Smart Transitions**: انتقالات ذكية بين الحالات
- **Emotional State**: حالة عاطفية (curiosity, confidence, urgency, satisfaction, frustration, excitement)
- **State History**: سجل كامل لجميع الانتقالات

### 📊 Visualization - التصور
- **3D Network View**: تصور ثلاثي الأبعاد للشبكة العصبية
- **2D Projection**: إسقاط ثنائي الأبعاد
- **Heatmap**: خريطة حرارية للنشاط
- **Thought Stream**: تدفق الأفكار في الوقت الفعلي
- **Activity Charts**: رسوم بيانية للنشاط
- **Event Stream**: تدفق الأحداث

### 🎮 Dashboard - لوحة التحكم
- **Real-time Metrics**: مقاييس في الوقت الفعلي
- **State Indicator**: مؤشر الحالة مع تأثيرات بصرية
- **Network Visualization**: تصور الشبكة العصبية
- **Thought Bubbles**: فقاعات الأفكار
- **Activity Charts**: رسوم بيانية للنشاط

### 🔗 Integration - التكامل
- **Neural Agent**: وكيل عصبي متكامل
- **Task Execution**: تنفيذ المهام مع خطط ديناميكية
- **Error Recovery**: استرداد من الأخطاء
- **Thought Broadcasting**: بث الأفكار
- **Memory Recall**: استدعاء الذاكرة

## 🚀 البدء السريع

```typescript
import { createNeuralSystem } from './joe-neural';

// إنشاء النظام
const system = createNeuralSystem({
  enableVisualization: true,
  enableThoughtBroadcasting: true,
  enableEmotionalResponses: true,
});

// تنفيذ مهمة
const result = await system.agent.executeTask(
  "Build a social network like Facebook",
  { complexity: 'extreme' },
  {
    onProgress: (progress, message) => {
      console.log(`${progress}%: ${message}`);
    }
  }
);

console.log('Result:', result);
```

## 📁 هيكل الملفات

```
joe-neural/
├── NeuralCore.ts           # النواة العصبية
├── NeuralStateManager.ts   # مدير الحالات
├── NeuralVisualization.ts  # التصور
├── NeuralDashboard.tsx     # لوحة التحكم
├── NeuralIntegration.ts    # التكامل
├── index.ts               # نقطة الدخول
└── README.md              # التوثيق
```

## 🧬 Neural Core

### إنشاء شبكة عصبية

```typescript
import { NeuralNetwork, neuralCore } from './joe-neural';

// استخدام النسخة الافتراضية
const network = neuralCore;

// أو إنشاء شبكة جديدة
const myNetwork = new NeuralNetwork();

// إنشاء عصبون
const neuron = network.createNeuron({
  type: 'pattern',
  layer: 2,
  position: { x: 50, y: 20, z: 10 },
  specialization: ['pattern-recognition']
});

// تفعيل العصبون
network.activateNeuron(neuron.id, 0.8);

// إنشاء اتصال
const synapse = network.createSynapse(neuron1.id, neuron2.id, 0.7);

// تخزين ذاكرة
const memory = network.storeMemory(
  { task: 'build app', result: 'success' },
  { type: 'long-term', importance: 0.8 }
);

// استدعاء ذاكرة
const memories = network.recallMemory('build app', { limit: 5 });
```

### أنواع العصبونات

| النوع | الوصف |
|-------|-------|
| `input` | استقبال المدخلات |
| `hidden` | معالجة مخفية |
| `output` | إنتاج المخرجات |
| `memory` | تخزين الذكريات |
| `decision` | اتخاذ القرارات |
| `pattern` | التعرف على الأنماط |
| `attention` | التركيز الانتباهي |
| `emotion` | المعالجة العاطفية |
| `creativity` | الإبداع |

## 🎛️ State Manager

### إدارة الحالات

```typescript
import { createStateManager } from './joe-neural';

const stateManager = createStateManager(neuralNetwork);

// الانتقال إلى حالة
await stateManager.transitionTo('analyzing', 'task-start');

// الحصول على الحالة العاطفية
const emotions = stateManager.getEmotionalState();
// { curiosity: 0.7, confidence: 0.6, urgency: 0.3, ... }

// تحديث الحالة العاطفية
stateManager.updateEmotionalState({ confidence: 0.9 });

// سجل الحالات
const history = stateManager.getStateHistory(10);
```

### الحالات العصبية

```
idle → analyzing → processing → synthesizing → deciding → executing → completing
         ↓              ↓              ↓              ↓            ↓
      recalling    learning      reflecting    optimizing   healing
```

## 📊 Visualization

### إنشاء مصور

```typescript
import { createVisualizer } from './joe-neural';

const visualizer = createVisualizer(neuralNetwork, {
  mode: '3d',
  colorScheme: 'heatmap',
  detailLevel: 'detailed',
});

// الحصول على بيانات 3D
const { neurons, synapses } = visualizer.get3DNetworkData();

// الحصول على بيانات 2D
const data2D = visualizer.get2DNetworkData();

// الحصول على خريطة حرارية
const heatmap = visualizer.getHeatmapData();

// الحصول على تدفق الأفكار
const thoughts = visualizer.getThoughtStreamData();

// الحصول على المقاييس
const metrics = visualizer.getCurrentMetrics();

// الاستماع للتحديثات
visualizer.on('visualization-updated', (data) => {
  console.log('Updated:', data);
});
```

## 🎮 Dashboard

### استخدام لوحة التحكم

```tsx
import { NeuralDashboard } from './joe-neural';

function App() {
  return (
    <NeuralDashboard
      neuralNetwork={system.neuralNetwork}
      stateManager={system.stateManager}
      visualizer={system.visualizer}
    />
  );
}
```

### مكونات لوحة التحكم

- **State Indicator**: مؤشر الحالة مع تأثيرات بصرية
- **Metrics Cards**: بطاقات المقاييس
- **Network Visualization**: تصور الشبكة العصبية (Canvas)
- **Thought Stream**: تدفق الأفكار
- **Activity Chart**: رسم النشاط
- **Event Stream**: تدفق الأحداث

## 🔗 Neural Agent

### الوكيل العصبي

```typescript
import { createNeuralAgent } from './joe-neural';

const agent = createNeuralAgent({
  enableVisualization: true,
  enableThoughtBroadcasting: true,
  enableEmotionalResponses: true,
  autoTransitionStates: true,
});

// الاستماع للأحداث
agent.on('thought-broadcast', (thought) => {
  console.log('Thought:', thought.content);
});

agent.on('neural-state-changed', (event) => {
  console.log(`State: ${event.from} → ${event.to}`);
});

agent.on('emotional-state-changed', (emotions) => {
  console.log('Emotions:', emotions);
});

// تنفيذ مهمة
const result = await agent.executeTask(
  "Build an e-commerce website",
  { products: ['electronics', 'clothing'] },
  {
    complexity: 'high',
    timeout: 60000,
    onProgress: (progress, message) => {
      console.log(`${progress}%: ${message}`);
    }
  }
);
```

### خطط التنفيذ

```typescript
interface TaskExecutionPlan {
  id: string;
  goal: string;
  steps: NeuralTaskStep[];
  estimatedDuration: number;
  complexity: 'low' | 'medium' | 'high' | 'extreme';
}

interface NeuralTaskStep {
  id: string;
  name: string;
  description: string;
  state: NeuralState;
  dependencies: string[];
  estimatedDuration: number;
  canParallelize: boolean;
  retryCount: number;
  maxRetries: number;
}
```

## 🔧 الثوابت العصبية

```typescript
const NEURAL_CONSTANTS = {
  ACTIVATION_THRESHOLD: 0.3,      // عتبة التفعيل
  ACTIVATION_DECAY: 0.95,         // معدل Decay
  MEMORY_DECAY: 0.99,             // Decay الذاكرة
  HEBBIAN_LEARNING_RATE: 0.1,     // معدل التعلم
  MAX_NEURONS: 10000,             // الحد الأقصى للعصبونات
  MAX_SYNAPSES_PER_NEURON: 100,   // الحد الأقصى للمشابك
  REFRACTORY_PERIOD: 50,          // فترة الاستعادة (ms)
};
```

## 📈 المقاييس

```typescript
interface NeuralMetrics {
  timestamp: number;
  totalNeurons: number;
  activeNeurons: number;
  totalSynapses: number;
  averageActivation: number;
  networkDensity: number;
  thoughtCount: number;
  currentState: NeuralState;
  processingSpeed: number;      // thoughts/sec
  memoryUtilization: number;
}
```

## 🎨 مخططات الألوان

### الحالات

| الحالة | اللون |
|--------|-------|
| idle | `#9E9E9E` |
| analyzing | `#4CAF50` |
| processing | `#2196F3` |
| synthesizing | `#00BCD4` |
| deciding | `#FF9800` |
| executing | `#F44336` |
| learning | `#9C27B0` |
| recalling | `#673AB7` |
| reflecting | `#795548` |
| optimizing | `#FF5722` |
| healing | `#E91E63` |
| completing | `#8BC34A` |

### أنواع العصبونات

| النوع | اللون |
|-------|-------|
| input | `#4CAF50` |
| hidden | `#2196F3` |
| output | `#FF9800` |
| memory | `#9C27B0` |
| decision | `#F44336` |
| pattern | `#00BCD4` |
| attention | `#FFEB3B` |
| emotion | `#E91E63` |
| creativity | `#795548` |

## 🔬 أمثلة

### مثال 1: بناء شبكة اجتماعية

```typescript
const system = createNeuralSystem({ enableVisualization: true });

const result = await system.agent.executeTask(
  "Build a social network like Facebook with messaging, posts, and friend system",
  {},
  {
    complexity: 'extreme',
    onProgress: (p, m) => console.log(`${p}%: ${m}`)
  }
);
```

### مثال 2: إصلاح خطأ

```typescript
await system.agent.executeTask(
  "Fix the login error in the authentication system",
  { error: 'Invalid credentials' },
  { complexity: 'medium' }
);
```

### مثال 3: تحسين الأداء

```typescript
await system.agent.executeTask(
  "Optimize the database queries for better performance",
  { slowQueries: ['query1', 'query2'] },
  { complexity: 'high' }
);
```

## 📚 API Reference

### NeuralNetwork

| Method | Description |
|--------|-------------|
| `createNeuron(options)` | إنشاء عصبون جديد |
| `activateNeuron(id, intensity)` | تفعيل عصبون |
| `createSynapse(from, to, weight)` | إنشاء اتصال |
| `reinforceSynapse(id, amount)` | تقوية اتصال |
| `storeMemory(content, options)` | تخزين ذاكرة |
| `recallMemory(query, options)` | استدعاء ذاكرة |
| `createPathway(name, neurons)` | إنشاء مسار |
| `getMetrics()` | الحصول على المقاييس |

### NeuralStateManager

| Method | Description |
|--------|-------------|
| `transitionTo(state, reason, context)` | الانتقال إلى حالة |
| `getEmotionalState()` | الحصول على الحالة العاطفية |
| `updateEmotionalState(updates)` | تحديث الحالة العاطفية |
| `getStateHistory(limit)` | سجل الحالات |

### NeuralAgent

| Method | Description |
|--------|-------------|
| `executeTask(goal, input, options)` | تنفيذ مهمة |
| `getNeuralNetwork()` | الحصول على الشبكة |
| `getStateManager()` | الحصول على مدير الحالات |
| `getVisualizer()` | الحصول على المصور |

## 🤝 المساهمة

نرحب بالمساهمات! يرجى اتباع الخطوات التالية:

1. Fork المستودع
2. إنشاء فرع جديد (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push إلى الفرع (`git push origin feature/amazing-feature`)
5. إنشاء Pull Request

## 📄 الترخيص

هذا المشروع مرخص بموجب [MIT License](LICENSE).

## 🙏 الشكر

- فريق Joe Enterprise
- مجتمع TypeScript
- كل المساهمين

---

<p align="center">
  <strong>🧠 Joe Neural System - Think Like a Brain</strong>
</p>
