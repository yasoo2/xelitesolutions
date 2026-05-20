# بنية زر المزودين - رسم تخطيطي

```
┌─────────────────────────────────────────────────────────────────┐
│                    CommandComposer Component                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  State Management:                                               │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ const [showProviders, setShowProviders] = useState()   │    │
│  │ const [activeProvider, setActiveProvider] = useState() │    │
│  │ const [providers, setProviders] = useState({...})      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Providers Button                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  <button className="provider-btn"                  │  │  │
│  │  │    onClick={() => setShowProviders(true)}>         │  │  │
│  │  │    <Cpu color={isConnected ? green : red} />       │  │  │
│  │  │    <span>{activeProvider}</span>                   │  │  │
│  │  │  </button>                                          │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓ onClick                          │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Providers Modal (Portal)                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │                  Modal Overlay                      │  │  │
│  │  │  ┌──────────────────────────────────────────────┐  │  │  │
│  │  │  │          Providers Modal Content             │  │  │  │
│  │  │  │  ┌──────────────┬────────────────────────┐  │  │  │  │
│  │  │  │  │ Left Sidebar │    Right Content       │  │  │  │  │
│  │  │  │  ├──────────────┼────────────────────────┤  │  │  │  │
│  │  │  │  │              │                        │  │  │  │  │
│  │  │  │  │ ┌──────────┐ │  ┌──────────────────┐ │  │  │  │  │
│  │  │  │  │ │ 🟢 Auto  │ │  │  Provider Name   │ │  │  │  │  │
│  │  │  │  │ └──────────┘ │  │  ┌─────────────┐ │ │  │  │  │  │
│  │  │  │  │              │  │  │ Status      │ │ │  │  │  │  │
│  │  │  │  │ ┌──────────┐ │  │  └─────────────┘ │ │  │  │  │  │
│  │  │  │  │ │ 🔴 OpenAI│ │  │                  │ │  │  │  │  │
│  │  │  │  │ └──────────┘ │  │  ┌─────────────┐ │ │  │  │  │  │
│  │  │  │  │              │  │  │ API Key     │ │ │  │  │  │  │
│  │  │  │  │ ┌──────────┐ │  │  │ [input]     │ │ │  │  │  │  │
│  │  │  │  │ │ 🟢 Gemini│ │  │  └─────────────┘ │ │  │  │  │  │
│  │  │  │  │ └──────────┘ │  │                  │ │  │  │  │  │
│  │  │  │  │              │  │  ┌─────────────┐ │ │  │  │  │  │
│  │  │  │  │ ┌──────────┐ │  │  │ Base URL    │ │ │  │  │  │  │
│  │  │  │  │ │ 🟢 Groq  │ │  │  │ [input]     │ │ │  │  │  │  │
│  │  │  │  │ └──────────┘ │  │  └─────────────┘ │ │  │  │  │  │
│  │  │  │  │              │  │                  │ │  │  │  │  │
│  │  │  │  │ ┌──────────┐ │  │  ┌─────────────┐ │ │  │  │  │  │
│  │  │  │  │ │   More   │ │  │  │  [Connect]  │ │ │  │  │  │  │
│  │  │  │  │ │   ...    │ │  │  │ [Disconnect]│ │ │  │  │  │  │
│  │  │  │  │ └──────────┘ │  │  └─────────────┘ │ │  │  │  │  │
│  │  │  │  │              │  │                  │ │  │  │  │  │
│  │  │  │  └──────────────┴────────────────────────┘  │  │  │  │
│  │  │  └──────────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════

State Flow:
──────────

1. Initial State
   ┌────────────────────────┐
   │ showProviders: false   │
   │ activeProvider: 'auto' │
   │ providers: {...}       │
   └────────────────────────┘
           │
           ↓ Click Button
           │
2. Open Modal
   ┌────────────────────────┐
   │ showProviders: true    │
   │ Modal renders          │
   └────────────────────────┘
           │
           ↓ Select Provider
           │
3. Update Provider
   ┌──────────────────────────┐
   │ activeProvider: 'openai' │
   │ Show provider settings   │
   └──────────────────────────┘
           │
           ↓ Enter API Key
           │
4. Connect
   ┌──────────────────────────┐
   │ isVerifying: true        │
   │ → API call               │
   │ → Verify                 │
   └──────────────────────────┘
           │
           ↓ Success/Fail
           │
5. Update Status
   ┌──────────────────────────┐
   │ isConnected: true/false  │
   │ lastError: "" / error    │
   │ isVerifying: false       │
   └──────────────────────────┘
           │
           ↓ Close Modal
           │
6. Back to Initial
   ┌────────────────────────┐
   │ showProviders: false   │
   │ Provider configured    │
   └────────────────────────┘

════════════════════════════════════════════════════════════════════

Providers Configuration:
────────────────────────

┌─────────────────────────────────────────────────────────────────┐
│  providers = {                                                   │
│    auto: {                                                       │
│      name: "Auto (Smart Routing)",                              │
│      isConnected: true,                                          │
│      isFree: true,                                               │
│      description: "Automatic provider selection"                │
│    },                                                            │
│    openai: {                                                     │
│      name: "OpenAI",                                             │
│      isConnected: false,                                         │
│      isFree: false,                                              │
│      apiKey: "",                                                 │
│      models: ['gpt-4', 'gpt-3.5-turbo']                         │
│    },                                                            │
│    gemini: {                                                     │
│      name: "Google Gemini",                                      │
│      isConnected: true,                                          │
│      isFree: true,                                               │
│      apiKey: "",                                                 │
│      models: ['gemini-pro', 'gemini-pro-vision']                │
│    },                                                            │
│    // ... more providers                                         │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════

Event Handlers:
───────────────

┌─────────────────────────────────────────────────────────────────┐
│  handleConnect(providerKey)                                      │
│    ├─ setProviders({ isVerifying: true })                       │
│    ├─ fetch('/api/providers/verify', { provider, apiKey })      │
│    ├─ if success: setProviders({ isConnected: true })           │
│    └─ if error: setProviders({ lastError: error })              │
│                                                                  │
│  handleDisconnect(providerKey)                                   │
│    └─ setProviders({ isConnected: false, apiKey: '' })          │
│                                                                  │
│  handleProviderSelect(key)                                       │
│    └─ setActiveProvider(key)                                    │
│                                                                  │
│  handleModalClose()                                              │
│    └─ setShowProviders(false)                                   │
└─────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════

CSS Classes:
────────────

.provider-btn              → Main button styling
.provider-btn.is-connected → Green theme (connected)
.provider-btn.is-disconnected → Red theme (disconnected)

.providers-modal-overlay   → Dark backdrop with blur
.providers-modal           → Main modal container
.providers-left            → Left sidebar (180px)
.providers-right           → Right content area (flex: 1)

════════════════════════════════════════════════════════════════════
```

## رسم تدفق البيانات

```
User Click
    ↓
Provider Button
    ↓
setShowProviders(true)
    ↓
Modal Opens (Portal)
    ↓
User Selects Provider
    ↓
setActiveProvider(key)
    ↓
User Enters API Key
    ↓
User Clicks Connect
    ↓
handleConnect(key)
    ↓
setProviders({ isVerifying: true })
    ↓
API Call: /api/providers/verify
    ↓
Response: Success/Error
    ↓
Update Provider State
    ├─ Success: { isConnected: true }
    └─ Error: { lastError: message }
    ↓
Modal Closes
    ↓
Button Shows New State
```

## مخطط العلاقات

```
┌──────────────────┐
│  User Interface  │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Provider Button  │←──────────┐
└────────┬─────────┘           │
         │                     │
         ↓                     │
┌──────────────────┐           │
│  Modal Portal    │           │
└────────┬─────────┘           │
         │                     │
    ┌────┴─────┐               │
    ↓          ↓               │
┌─────────┐ ┌──────────┐       │
│  Left   │ │  Right   │       │
│Sidebar  │ │ Content  │       │
└────┬────┘ └────┬─────┘       │
     │           │             │
     ↓           ↓             │
┌────────────────────────┐     │
│   State Management     │─────┘
│  - providers           │
│  - activeProvider      │
│  - showProviders       │
└────────────────────────┘
```
