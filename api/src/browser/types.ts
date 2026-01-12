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

export type FinalReportEvent = {
  type: 'final_report';
  ts: number;
  ok: boolean;
  summary: string;
  steps: Array<{ stepId: string; name: string; ok: boolean; reason?: FailureReason; message?: string }>;
  evidence: Array<{ kind: 'screenshot'; jpegBase64: string; ts: number; stepId: string }>;
};

export type BrowserWsEvent =
  | StreamFrameEvent
  | CursorMoveEvent
  | HighlightBoxesEvent
  | SessionStatusEvent
  | ActionLogEvent
  | StepEvent
  | FinalReportEvent;
