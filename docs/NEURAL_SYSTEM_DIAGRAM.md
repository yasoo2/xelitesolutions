# مخطط النظام العصبي - Neural Thinking System Diagram

## 🧠 البنية الكاملة للنظام العصبي

```
┌─────────────────────────────────────────────────────────────────┐
│                    Joe Neural System                             │
│                    نظام Joe العصبي                              │
└─────────────────────────────────────────────────────────────────┘


                        ┌─────────────┐
                        │   User      │
                        │  المستخدم   │
                        └──────┬──────┘
                               │
                               ↓ Message/رسالة
                               │
        ┌──────────────────────┴────────────────────────┐
        │                                                │
        ↓                                                ↓
┌───────────────┐                              ┌────────────────┐
│ Frontend UI   │                              │  Backend API   │
│   واجهة       │                              │   الخادم       │
└───────┬───────┘                              └────────┬───────┘
        │                                                │
        │                                                ↓
        │                          ┌────────────────────────────────┐
        │                          │   Intelligent Router           │
        │                          │   الموجه الذكي                 │
        │                          │                                │
        │                          │  1. analyzeTask()              │
        │                          │     - تحديد النوع              │
        │                          │     - تقييم التعقيد            │
        │                          │     - اكتشاف الأدوات           │
        │                          │                                │
        │                          │  2. advancedAnalyzeTask()      │
        │                          │     - تحليل LLM عميق          │
        │                          │     - تصنيف دقيق               │
        │                          │                                │
        │                          │  3. routeToModel()             │
        │                          │     - اختيار النموذج الأمثل    │
        │                          │     - Llama / Mixtral / Gemma  │
        │                          └────────┬───────────────────────┘
        │                                   │
        │                                   ↓
        │                          ┌────────────────────────────────┐
        │                          │   Neural Thinking Phases       │
        │                          │   مراحل التفكير العصبي         │
        │                          │                                │
        │                          │   Phase 1: 🧠 Analyzing        │
        │                          │            تحليل عميق          │
        │                          │            ↓                   │
        │                          │   Phase 2: ⚙️  Synthesizing    │
        │                          │            تخطيط               │
        │                          │            ↓                   │
        │                          │   Phase 3: 🚀 Executing        │
        │                          │            تنفيذ               │
        │                          └────────┬───────────────────────┘
        │                                   │
        │                                   │ WebSocket Updates
        │                                   │ تحديثات فورية
        │                                   │
        ↓←──────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│            NeuralThinkingIndicator (Visual)                     │
│            المؤشر البصري للتفكير العصبي                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🧠 تحليل عميق...                                       │  │
│  │  ─────────────────────────────────                       │  │
│  │  > Analyzing user intent...                              │  │
│  │  > Detecting task complexity...                          │  │
│  │  > Selecting optimal model...                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ⚙️  تخطيط...                                            │  │
│  │  ─────────────────────────────────                       │  │
│  │  > Breaking down into steps...                           │  │
│  │  > Planning tool execution...                            │  │
│  │  > Preparing response structure...                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🚀 تنفيذ...                                             │  │
│  │  ─────────────────────────────────                       │  │
│  │  > Executing tools...                                    │  │
│  │  > Generating response...                                │  │
│  │  > Finalizing output...                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔄 دورة التفكير الكاملة

```
START
  │
  ↓
┌─────────────────────────┐
│  1. Message Received    │
│     استلام الرسالة      │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  2. Quick Analysis      │
│     تحليل سريع          │
│                         │
│  • Language detection   │
│  • Pattern matching     │
│  • Type classification  │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  3. Deep Analysis       │
│     تحليل عميق          │
│  (advancedAnalyzeTask)  │
│                         │
│  • LLM-based analysis   │
│  • Complexity scoring   │
│  • Tool detection       │
│  • Model suggestion     │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  4. Model Selection     │
│     اختيار النموذج      │
│                         │
│  IF extreme complexity  │
│    → Llama 3.1 70B      │
│  IF code generation     │
│    → Gemma 2 9B         │
│  IF simple chat         │
│    → Llama 3.1 8B       │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  5. Phase: ANALYZING    │
│     🧠 تحليل عميق       │
│                         │
│  • Update UI indicator  │
│  • Send WebSocket event │
│  • Log thinking details │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  6. Phase: SYNTHESIZING │
│     ⚙️  تخطيط           │
│                         │
│  • Plan execution       │
│  • Prepare tools        │
│  • Structure response   │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  7. Phase: EXECUTING    │
│     🚀 تنفيذ            │
│                         │
│  • Run LLM              │
│  • Execute tools        │
│  • Generate output      │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  8. Response Complete   │
│     الاستجابة كاملة     │
│                         │
│  • Return to IDLE       │
│  • Clear indicators     │
│  • Log statistics       │
└─────────────────────────┘
  │
  ↓
END
```

---

## 🎨 مكونات النظام العصبي

```
┌─────────────────────────────────────────────────────────┐
│              Neural System Components                    │
│              مكونات النظام العصبي                       │
└─────────────────────────────────────────────────────────┘

1. NeuralThinkingIndicator (Frontend)
   ┌─────────────────────────────────────┐
   │  File: NeuralThinkingIndicator.tsx  │
   │  ├─ Phase visualization             │
   │  ├─ Matrix-style logs               │
   │  ├─ Real-time updates               │
   │  └─ Arabic/English support          │
   └─────────────────────────────────────┘

2. Intelligent Router (Backend)
   ┌─────────────────────────────────────┐
   │  File: intelligent-router.ts        │
   │  ├─ analyzeTask()                   │
   │  ├─ advancedAnalyzeTask()           │
   │  ├─ routeToModel()                  │
   │  └─ selectBestModel()               │
   └─────────────────────────────────────┘

3. WebSocket State Manager
   ┌─────────────────────────────────────┐
   │  File: socket.ts                    │
   │  ├─ thinkingPhase state             │
   │  ├─ thinkingDetails array           │
   │  ├─ Phase listeners                 │
   │  └─ Details listeners               │
   └─────────────────────────────────────┘

4. Model Registry
   ┌─────────────────────────────────────┐
   │  File: intelligent-router.ts        │
   │  ├─ Llama 3.1 70B (reasoning)       │
   │  ├─ Llama 3.1 8B (speed)            │
   │  ├─ Mixtral 8x7B (long context)     │
   │  ├─ Gemma 2 9B (code)               │
   │  └─ More models...                  │
   └─────────────────────────────────────┘

5. Task Analysis Engine
   ┌─────────────────────────────────────┐
   │  Interface: TaskAnalysis            │
   │  ├─ type: 6 task types              │
   │  ├─ complexity: 4 levels            │
   │  ├─ requiresTools: boolean          │
   │  ├─ estimatedTokens: number         │
   │  └─ language: ar/en/mixed           │
   └─────────────────────────────────────┘

6. Free Intelligence Optimizer
   ┌─────────────────────────────────────┐
   │  File: free-intelligence-optimizer  │
   │  ├─ Request optimization            │
   │  ├─ Response caching                │
   │  ├─ Smart retrieval                 │
   │  └─ Performance stats               │
   └─────────────────────────────────────┘
```

---

## 📊 تدفق البيانات (Data Flow)

```
User Message
    │
    ↓
┌───────────────────┐
│  Quick Analysis   │
│  ───────────────  │
│  • Type           │
│  • Complexity     │
│  • Language       │
└────────┬──────────┘
         │
         ↓
┌───────────────────┐
│  Deep Analysis    │
│  ───────────────  │
│  • LLM analysis   │
│  • Tool detection │
│  • Model suggest  │
└────────┬──────────┘
         │
         ↓
┌───────────────────┐
│  Model Selection  │
│  ───────────────  │
│  • Check keys     │
│  • Match task     │
│  • Select best    │
└────────┬──────────┘
         │
         ↓
┌───────────────────┐
│  Phase Updates    │◄──────── WebSocket
│  ───────────────  │
│  🧠 Analyzing     │──────────► UI Update
│  ⚙️  Synthesizing │──────────► UI Update
│  🚀 Executing     │──────────► UI Update
└────────┬──────────┘
         │
         ↓
┌───────────────────┐
│  LLM Execution    │
│  ───────────────  │
│  • Run model      │
│  • Stream output  │
│  • Execute tools  │
└────────┬──────────┘
         │
         ↓
┌───────────────────┐
│  Response         │
│  ───────────────  │
│  • Clean output   │
│  • Format result  │
│  • Update UI      │
└───────────────────┘
```

---

## 🎯 أنواع المهام المدعومة

```
┌─────────────────────────────────────────────────────────┐
│                  Task Types                              │
│                  أنواع المهام                           │
└─────────────────────────────────────────────────────────┘

1. simple_chat          │  محادثة بسيطة
   ├─ Greetings         │  تحيات
   ├─ Small talk        │  حديث عام
   └─ Quick questions   │  أسئلة سريعة

2. complex_reasoning    │  تفكير معقد
   ├─ How it works      │  كيف يعمل
   ├─ Explanations      │  شروحات
   ├─ Planning          │  تخطيط
   └─ Architecture      │  معمارية

3. code_generation      │  كتابة كود
   ├─ Build app         │  بناء تطبيق
   ├─ Fix bugs          │  إصلاح أخطاء
   ├─ Write function    │  كتابة دالة
   └─ Refactor          │  إعادة هيكلة

4. creative             │  إبداعي
   ├─ Stories           │  قصص
   ├─ Poems             │  قصائد
   ├─ Articles          │  مقالات
   └─ Essays            │  مواضيع

5. data_analysis        │  تحليل بيانات
   ├─ Statistics        │  إحصائيات
   ├─ Charts            │  رسوم
   ├─ Reports           │  تقارير
   └─ Insights          │  استنتاجات

6. browser_task         │  مهام المتصفح
   ├─ Search            │  بحث
   ├─ Extract           │  استخراج
   ├─ Navigate          │  تصفح
   └─ Automate          │  أتمتة
```

---

## 🔢 مستويات التعقيد

```
┌─────────────────────────────────────────────────────────┐
│              Complexity Levels                           │
│              مستويات التعقيد                            │
└─────────────────────────────────────────────────────────┘

Level 1: LOW            │  منخفض
  ├─ Model: Llama 8B    │  نموذج سريع
  ├─ Tokens: < 500      │  رموز قليلة
  ├─ Time: < 2s         │  وقت قصير
  └─ Example: "Hello"   │  مثال: "مرحباً"

Level 2: MEDIUM         │  متوسط
  ├─ Model: Llama 70B   │  نموذج متوازن
  ├─ Tokens: 500-2000   │  رموز متوسطة
  ├─ Time: 2-5s         │  وقت متوسط
  └─ Example: "Explain" │  مثال: "اشرح"

Level 3: HIGH           │  عالي
  ├─ Model: Mixtral     │  نموذج قوي
  ├─ Tokens: 2000-5000  │  رموز كثيرة
  ├─ Time: 5-10s        │  وقت طويل
  └─ Example: "Design"  │  مثال: "صمم"

Level 4: EXTREME        │  فائق
  ├─ Model: Llama 70B   │  أقوى نموذج
  ├─ Tokens: > 5000     │  رموز كثيرة جداً
  ├─ Time: > 10s        │  وقت طويل جداً
  └─ Example: "Build"   │  مثال: "ابني نظاماً"
```

---

## 🎭 حالات المؤشر البصري

```
┌─────────────────────────────────────────────────────────┐
│          Visual Indicator States                         │
│          حالات المؤشر البصري                            │
└─────────────────────────────────────────────────────────┘

State 1: IDLE           │  خامل
  ├─ Display: Hidden    │  مخفي
  ├─ Color: Gray        │  رمادي
  └─ Details: None      │  لا تفاصيل

State 2: ANALYZING      │  تحليل
  ├─ Display: Visible   │  ظاهر
  ├─ Color: Cyan        │  سماوي
  ├─ Emoji: 🧠          │
  ├─ Text: "تحليل عميق" │
  └─ Details: Logs      │  سجلات

State 3: SYNTHESIZING   │  تخطيط
  ├─ Display: Visible   │  ظاهر
  ├─ Color: Green       │  أخضر
  ├─ Emoji: ⚙️           │
  ├─ Text: "تخطيط"     │
  └─ Details: Logs      │  سجلات

State 4: EXECUTING      │  تنفيذ
  ├─ Display: Visible   │  ظاهر
  ├─ Color: Gold        │  ذهبي
  ├─ Emoji: 🚀          │
  ├─ Text: "تنفيذ"     │
  └─ Details: Logs      │  سجلات
```

---

## 🔗 تكامل المكونات

```
┌────────────────────────────────────────────────────┐
│                                                     │
│   Frontend                    Backend              │
│   ────────                    ───────              │
│                                                     │
│   CommandComposer             Index.ts             │
│        │                         │                 │
│        ├─ renders ──────────────►│                 │
│        │                         │                 │
│   NeuralThinkingIndicator        │                 │
│        │                         │                 │
│        ├─ subscribes ────────────┤                 │
│        │                         │                 │
│   SocketService                  │                 │
│        │                         │                 │
│        ├─ connects ──────────────►                 │
│        │                     WebSocket             │
│        │                         │                 │
│        ◄─ receives ──────────────┤                 │
│                                  │                 │
│                          IntelligentRouter         │
│                                  │                 │
│                          ┌───────┴───────┐         │
│                          │               │         │
│                     analyzeTask    routeToModel    │
│                          │               │         │
│                          └───────┬───────┘         │
│                                  │                 │
│                            LLM Providers           │
│                          (Groq, OpenRouter)        │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

**التاريخ:** 2026-02-13  
**الإصدار:** Wakil 6.0+  
**الحالة:** نشط ويعمل ✅
