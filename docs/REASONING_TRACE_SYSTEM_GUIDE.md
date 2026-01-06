# دليل نظام Reasoning Trace System

**الإصدار:** 1.0.0  
**التاريخ:** 6 يناير 2026  
**الحالة:** ✅ جاهز للاستخدام

---

## 📋 نظرة عامة

**Reasoning Trace System** هو نظام متقدم يعرض عملية التفكير والحوار الداخلي لنظام JOE بشكل **فوري وسلس** وبتصميم احترافي مثل نظام Manus.

### الميزات الرئيسية:

✅ **عرض فوري للأفكار** - شاهد تفكير JOE وهو يحدث  
✅ **تتبع شامل** - كل خطوة، كل قرار، كل أداة  
✅ **واجهة احترافية** - تصميم جميل وسلس مع انيميشنات  
✅ **بث حي** - WebSocket للتحديثات الفورية  
✅ **إحصائيات مفصلة** - قياس الأداء والموثوقية  
✅ **تصدير البيانات** - JSON و Markdown  

---

## 🏗️ البنية المعمارية

```
Reasoning Trace System
├── Backend (API)
│   ├── ReasoningTracer (trace.ts)
│   │   ├── startTrace() - بدء التتبع
│   │   ├── addThinkingEvent() - إضافة حدث
│   │   ├── analyzeTask() - تحليل المهمة
│   │   ├── evaluateTools() - تقييم الأدوات
│   │   ├── selectTool() - اختيار الأداة
│   │   ├── completeExecution() - إكمال التنفيذ
│   │   ├── detectError() - اكتشاف الأخطاء
│   │   └── conclude() - الخلاصة
│   │
│   └── API Routes (reasoning.ts)
│       ├── POST /api/reasoning/start
│       ├── POST /api/reasoning/event
│       ├── POST /api/reasoning/analyze-task
│       ├── POST /api/reasoning/evaluate-tools
│       ├── POST /api/reasoning/select-tool
│       ├── POST /api/reasoning/execute
│       ├── POST /api/reasoning/error
│       ├── POST /api/reasoning/decision
│       ├── POST /api/reasoning/conclude
│       ├── GET /api/reasoning/current
│       ├── GET /api/reasoning/:traceId
│       ├── GET /api/reasoning/stats
│       └── WS /api/reasoning/ws
│
└── Frontend (UI)
    ├── ReasoningDisplay.tsx
    │   ├── EventCard - عرض الحدث الواحد
    │   ├── ProgressBar - شريط التقدم
    │   └── CompactReasoningDisplay - عرض مختصر
    │
    └── ReasoningTracePage.tsx
        ├── البحث والتصفية
        ├── الإحصائيات
        ├── التحميل والمشاركة
        └── عرض فوري للأحداث
```

---

## 🚀 الاستخدام

### 1. بدء التتبع من الباكاند

```typescript
import { reasoningTracer } from '@/reasoning/trace';

// بدء تتبع جديد
const traceId = reasoningTracer.startTrace('بناء موقع ويب احترافي');

// تحليل المهمة
reasoningTracer.analyzeTask({
  goal: 'بناء موقع ويب احترافي',
  constraints: ['responsive design', 'SEO optimized'],
  requiredTools: ['scaffold_project', 'npm_install'],
  estimatedSteps: 5
});

// تقييم الأدوات
reasoningTracer.evaluateTools([
  {
    name: 'scaffold_project',
    score: 0.95,
    reasoning: 'الأفضل للمشاريع الجديدة',
    pros: ['سريع', 'موثوق'],
    cons: []
  },
  {
    name: 'manual_setup',
    score: 0.6,
    reasoning: 'يتطلب وقت أكثر',
    pros: ['مرن'],
    cons: ['بطيء']
  }
]);

// اختيار الأداة
reasoningTracer.selectTool(
  'scaffold_project',
  'أسرع وأكثر موثوقية',
  0.98
);

// تنفيذ الأداة
reasoningTracer.startExecution('scaffold_project', { name: 'my-site' });
reasoningTracer.updateExecutionProgress(50, 'جاري إنشاء الملفات...');
reasoningTracer.completeExecution(
  'scaffold_project',
  { name: 'my-site' },
  { success: true },
  1600
);

// الخلاصة
reasoningTracer.conclude('تم بناء الموقع بنجاح', true);
```

### 2. عرض الأحداث على الواجهة

```typescript
import ReasoningDisplay from '@/components/ReasoningDisplay';

function MyComponent() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // الاتصال بـ WebSocket
    const ws = new WebSocket('ws://localhost:3000/api/reasoning/ws');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'thinking_event') {
        setEvents(prev => [...prev, data.data]);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <ReasoningDisplay
      events={events}
      isActive={true}
      taskDescription="بناء موقع ويب"
      autoScroll={true}
    />
  );
}
```

### 3. استخدام API REST

```bash
# بدء التتبع
curl -X POST http://localhost:3000/api/reasoning/start \
  -H "Content-Type: application/json" \
  -d '{"taskDescription": "بناء موقع ويب"}'

# إضافة حدث
curl -X POST http://localhost:3000/api/reasoning/event \
  -H "Content-Type: application/json" \
  -d '{
    "type": "tool_chosen",
    "content": "اختيار الأداة: scaffold_project",
    "metadata": {
      "toolName": "scaffold_project",
      "confidence": 0.98
    }
  }'

# الحصول على السلسلة الحالية
curl http://localhost:3000/api/reasoning/current

# الحصول على الإحصائيات
curl http://localhost:3000/api/reasoning/stats

# تصدير السلسلة
curl http://localhost:3000/api/reasoning/trace-123/export?format=markdown
```

---

## 📊 أنواع الأحداث

| النوع | الوصف | المثال |
|--------|--------|--------|
| `thinking_start` | بدء التفكير | بدء معالجة المهمة |
| `task_analysis` | تحليل المهمة | تحليل المتطلبات |
| `goal_breakdown` | تقسيم الهدف | تقسيم إلى 5 خطوات |
| `tool_evaluation` | تقييم الأدوات | مقارنة الخيارات |
| `tool_chosen` | اختيار الأداة | اختيار scaffold_project |
| `execution_start` | بدء التنفيذ | بدء تشغيل الأداة |
| `execution_progress` | تقدم التنفيذ | 50% مكتمل |
| `execution_complete` | إكمال التنفيذ | اكتمل في 1600ms |
| `error_detected` | اكتشاف خطأ | خطأ في الملف |
| `recovery_attempt` | محاولة الاسترجاع | محاولة إعادة المحاولة |
| `recovery_success` | نجاح الاسترجاع | تم الاسترجاع بنجاح |
| `decision_made` | قرار | استخدام React |
| `strategy_change` | تغيير الاستراتيجية | تغيير النهج |
| `result_analysis` | تحليل النتيجة | تحليل المخرجات |
| `conclusion` | الخلاصة | تم الإكمال بنجاح |

---

## 🎨 مكونات الواجهة

### ReasoningDisplay

مكون رئيسي يعرض سلسلة التفكير الكاملة:

```typescript
<ReasoningDisplay
  events={events}              // قائمة الأحداث
  isActive={true}              // هل التتبع نشط
  taskDescription="..."        // وصف المهمة
  autoScroll={true}            // تمرير تلقائي
/>
```

**الميزات:**
- عرض فوري للأحداث
- انيميشنات سلسة
- أيقونات وألوان مميزة
- عرض البيانات الإضافية
- شريط تقدم

### CompactReasoningDisplay

عرض مختصر للأحداث:

```typescript
<CompactReasoningDisplay
  events={events}
  isActive={true}
/>
```

---

## 📈 الإحصائيات

```typescript
interface ReasoningStats {
  totalEvents: number;        // إجمالي الأحداث
  totalDuration: number;      // المدة الكلية (ms)
  toolsUsed: number;          // عدد الأدوات
  successRate: number;        // معدل النجاح (%)
  averageEventDuration: number; // متوسط مدة الحدث
}
```

---

## 🔌 WebSocket

### الاتصال

```typescript
const ws = new WebSocket('ws://localhost:3000/api/reasoning/ws');

ws.onopen = () => {
  console.log('متصل');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'thinking_event':
      // حدث تفكير جديد
      console.log(data.data);
      break;
    case 'current_trace':
      // السلسلة الحالية
      console.log(data.data);
      break;
    case 'performance_stats':
      // الإحصائيات
      console.log(data.data);
      break;
  }
};
```

### الرسائل المدعومة

```typescript
// طلب السلسلة الحالية
ws.send(JSON.stringify({
  type: 'get_current_trace'
}));

// طلب الإحصائيات
ws.send(JSON.stringify({
  type: 'get_stats'
}));

// بدء تتبع جديد
ws.send(JSON.stringify({
  type: 'start_trace',
  taskDescription: 'بناء موقع ويب'
}));
```

---

## 💾 التصدير

### JSON

```typescript
const json = reasoningTracer.exportTrace(traceId);
// أو عبر API:
// GET /api/reasoning/:traceId/export?format=json
```

### Markdown

```typescript
const markdown = reasoningTracer.exportAsMarkdown(traceId);
// أو عبر API:
// GET /api/reasoning/:traceId/export?format=markdown
```

---

## 🔧 التكامل مع JOE

### في AutonomousAgent

```typescript
class AutonomousAgent {
  async executeTask(taskDescription: string) {
    // بدء التتبع
    const traceId = reasoningTracer.startTrace(taskDescription);
    
    // تحليل المهمة
    reasoningTracer.analyzeTask(analysis);
    
    // تقسيم الهدف
    reasoningTracer.breakdownGoal(steps);
    
    // تقييم الأدوات
    reasoningTracer.evaluateTools(tools);
    
    // اختيار الأداة
    reasoningTracer.selectTool(toolName, reasoning, confidence);
    
    // تنفيذ
    try {
      const result = await this.executeTool(toolName, input);
      reasoningTracer.completeExecution(toolName, input, result, duration);
    } catch (error) {
      reasoningTracer.detectError(error.message);
      reasoningTracer.attemptRecovery(strategy, reasoning);
      // ...
    }
    
    // الخلاصة
    reasoningTracer.conclude(summary, success);
  }
}
```

---

## 📱 الواجهة الأمامية

### صفحة ReasoningTracePage

صفحة كاملة لعرض سلسلة التفكير مع:

- 🔍 **البحث والتصفية** - ابحث عن أحداث محددة
- 📊 **الإحصائيات** - معلومات الأداء والموثوقية
- 📥 **التحميل** - تحميل البيانات كـ JSON
- 📋 **النسخ** - نسخ البيانات للحافظة
- ⏸️ **التحكم** - إيقاف وتشغيل التتبع
- 🔄 **إعادة تعيين** - مسح جميع الأحداث

---

## ⚡ الأداء

| المقياس | الهدف |
|--------|--------|
| **زمن الاستجابة** | < 100ms |
| **معدل البث** | 60 FPS |
| **استهلاك الذاكرة** | < 50MB |
| **حجم الحدث** | < 5KB |

---

## 🛠️ الخطوات التالية

1. **التكامل الكامل** - دمج النظام مع JOE
2. **اختبار شامل** - اختبار جميع السيناريوهات
3. **تحسينات الأداء** - تحسين السرعة والكفاءة
4. **ميزات إضافية** - تصفية متقدمة، بحث ذكي
5. **التوثيق الكامل** - توثيق شامل للمطورين

---

## 📚 الملفات المُنتجة

| الملف | الوصف |
|--------|--------|
| `api/src/reasoning/trace.ts` | نظام التتبع الأساسي |
| `api/src/routes/reasoning.ts` | API endpoints |
| `web/src/components/ReasoningDisplay.tsx` | مكونات الواجهة |
| `web/src/pages/ReasoningTracePage.tsx` | صفحة العرض الكاملة |

---

## 🎯 الخلاصة

**Reasoning Trace System** يوفر:

✅ **شفافية كاملة** - شاهد كل ما يفكر به JOE  
✅ **تصميم احترافي** - واجهة جميلة وسلسة  
✅ **أداء عالي** - بث فوري بدون تأخير  
✅ **سهولة الاستخدام** - API بسيط وواضح  
✅ **قابلية التوسع** - يدعم إضافة ميزات جديدة  

---

**تم إعداد هذا الدليل بواسطة:** Manus AI  
**التاريخ:** 6 يناير 2026  
**الحالة:** ✅ جاهز للإنتاج
