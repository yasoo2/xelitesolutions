export type BrowserRunMode = 'execute';

export type BrowserRunRequest = {
  sessionId: string;
  instructionText: string;
  mode: BrowserRunMode;
};

export type FailureReason =
  | 'element_not_found'
  | 'overlay_blocking_click'
  | 'needs_scroll'
  | 'iframe_or_shadow_dom'
  | 'timeout'
  | 'same_site_blocked'
  | 'dns_failed'
  | 'navigation_failed'
  | 'unknown';

export type StepEvent =
  | { type: 'step_start'; stepId: string; name: string; ts: number }
  | { type: 'step_done'; stepId: string; name: string; ts: number; data?: any }
  | { type: 'step_error'; stepId: string; name: string; ts: number; reason: FailureReason; message: string; data?: any }
  | { type: 'goto_blocked'; stepId: string; ts: number; url: string; reason: FailureReason; message: string };

export type StreamFrameEvent = {
  type: 'stream_frame';
  ts: number;
  jpegBase64: string;
  w: number;
  h: number;
};

export type CursorMoveEvent = { type: 'cursor_move'; ts: number; x: number; y: number };

export type HighlightBoxesEvent = {
  type: 'highlight_boxes';
  ts: number;
  boxes: Array<{ x: number; y: number; width: number; height: number; label?: string }>;
};

export type SessionStatusEvent = {
  type: 'session_status';
  ts: number;
  sessionId: string;
  url: string;
  workerStatus: 'idle' | 'running' | 'error' | (string & {});
  fallbackMode?: 'screenshots' | (string & {});
  blockingReason?: FailureReason | (string & {});
};

export type ActionLogEvent = {
  type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error';
  ts: number;
  actionId: string;
  actionType: string;
  summary?: string;
  error?: string;
  reason?: FailureReason | (string & {});
};

/** Sanitised page metadata emitted after navigation and meaningful page changes. */
export type PageSnapshotEvent = {
  type: 'page_snapshot';
  ts: number;
  sessionId: string;
  url: string;
  title: string;
  state: 'loading' | 'ready' | 'blocked' | 'error' | 'unknown' | (string & {});
  workerStatus?: 'idle' | 'running' | 'error' | (string & {});
  elementCount?: number;
  textLength?: number;
  hasPasswordField?: boolean;
  blockingReason?: FailureReason | (string & {});
};

/** Runtime diagnostics from the current Playwright page, with credential-safe samples only. */
export type PageDiagnosticsEvent = {
  type: 'page_diagnostics';
  ts: number;
  sessionId: string;
  jsErrors: number;
  consoleErrors: number;
  networkErrors: number;
  recent?: Array<{ kind: 'pageerror' | 'console' | 'requestfailed'; message: string; ts: number }>;
};

/** A measured quality sample, never a claim of success without the underlying signals. */
export type BrowserQualityEvent = {
  type: 'browser_quality';
  ts: number;
  sessionId: string;
  status: 'good' | 'degraded' | 'blocked' | 'unknown';
  fps: number;
  frameAgeMs: number | null;
  jitterMs: number | null;
  queueLength: number;
  actionsInFlight: number;
  actionErrors: number;
  jsErrors: number;
  networkErrors: number;
  lastActionLatencyMs: number | null;
  windowMs: number;
  reason?: string;
};

/** Normalised action timeline event that complements the legacy lifecycle events. */
export type BrowserActionEvent = {
  type: 'browser_action';
  ts: number;
  sessionId: string;
  actionId: string;
  actionType: string;
  phase: 'sent' | 'ack' | 'done' | 'error' | 'feedback';
  ok?: boolean;
  durationMs?: number;
  summary?: string;
  reason?: string;
};

export type ActionFeedbackEvent = {
  type: 'action_feedback';
  ts: number;
  event: 'click' | 'scroll' | 'hover' | 'type';
  x?: number;
  y?: number;
  direction?: 'up' | 'down';
};

export type FinalReportEvent = {
  type: 'final_report';
  ts: number;
  ok: boolean;
  summary: string;
  steps: Array<{ stepId: string; name: string; ok: boolean; reason?: FailureReason; message?: string }>;
  evidence: Array<{ kind: 'screenshot'; jpegBase64: string; ts: number; stepId: string }>;
};

export type FinalStatusEvent =
  | { type: 'final_success'; ts: number; summary: string }
  | { type: 'final_failed'; ts: number; summary: string; reason: string };

export type DebugSnapshotEvent = {
  type: 'debug_snapshot';
  ts: number;
  compiledPlanJson: any;
  actionsJson: any;
  actionCount: number;
  stopReason: string;
};

/** Live narration of the ReAct browser agent's observe→decide→act loop, streamed
 *  to Joe's panel so the user watches the agent think and act step by step. */
export type AgentStepEvent = {
  type: 'agent_step';
  ts: number;
  phase: 'observe' | 'decide' | 'act' | 'result' | 'done' | 'needs_user';
  step: number;
  url?: string;
  title?: string;
  elementCount?: number;
  action?: string;   // human-readable, credential-safe (never the real secret)
  reason?: string;
  ok?: boolean;
  note?: string;
  message?: string;
  secretKey?: string; // on needs_user: which secret the panel should collect (e.g. JOE_2FA_CODE)
};

/** Live token stream of the agent's "thinking" while it decides the next step —
 *  the model's words arrive delta-by-delta so the panel shows it working in real
 *  time (like a chat that types), instead of a frozen "deciding…" state. The delta
 *  is credential-safe: the model emits {{SECRET:...}} placeholders, never real
 *  secret values. */
export type AgentThinkingEvent = {
  type: 'agent_thinking';
  ts: number;
  step: number;
  delta: string;   // incremental text chunk (append to what was shown before)
  done?: boolean;  // true on the final chunk of this step's thinking
};

export type BrowserWsEvent =
  | StreamFrameEvent
  | CursorMoveEvent
  | HighlightBoxesEvent
  | SessionStatusEvent
  | ActionLogEvent
  | PageSnapshotEvent
  | PageDiagnosticsEvent
  | BrowserQualityEvent
  | BrowserActionEvent
  | ActionFeedbackEvent
  | StepEvent
  | FinalReportEvent
  | FinalStatusEvent
  | DebugSnapshotEvent
  | AgentStepEvent
  | AgentThinkingEvent;

export type ElementType =
  | 'input'
  | 'textarea'
  | 'button'
  | 'link'
  | 'select'
  | 'image'
  | 'text'
  | 'form'
  | 'table'
  | 'unknown';

export type DetectedElement = {
  id: string;
  type: ElementType;
  selector: string;
  text: string;
  value?: string;
  placeholder?: string;
  visible: boolean;
  position: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
};

export type PageData = {
  title: string;
  url: string;
  elements: DetectedElement[];
  forms: Array<{ id: string; fields: DetectedElement[]; submitButton?: DetectedElement }>;
  tables: Array<{ id: string; headers: string[]; rows: string[][] }>;
  links: Array<{ text: string; href: string; selector: string }>;
  images: Array<{ src: string; alt: string; selector: string }>;
  text: string;
};
