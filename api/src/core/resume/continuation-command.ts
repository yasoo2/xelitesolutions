import type { RunEvidenceRecord } from '../../shared/run-evidence-store';

export type SessionMessage = {
  role?: unknown;
  content?: unknown;
  createdAt?: unknown;
};

const CONTINUATION_COMMANDS = new Set([
  'continue', 'resume', 'complete', 'proceed', 'carry on', 'keep going', 'finish it',
  'اكمل', 'كمل', 'تابع', 'استمر', 'واصل', 'اتمم', 'استكمل',
  'continuer', 'continuez', 'reprendre', 'reprenez',
  'continuar', 'continua', 'reanudar', 'reanuda',
  'weiter', 'fortsetzen', 'weitermachen',
  'continua', 'riprendi', 'prosegui',
  'continue', 'continuar', 'retomar',
  'devam', 'devam et', 'surdur',
  'продолжай', 'продолжить', 'возобновить',
  'doorgaan', 'ga door', 'kontynuuj', 'lanjutkan',
  'ادامه', 'ادامه بده', 'جاری رکھو', 'চালিয়ে যান',
  '继续', '繼續', '続けて', '続行', '계속', '계속해',
  'जारी रखो', 'जारी रखें', 'המשך',
]);

function normalizeCommand(value: unknown): string {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[’'"`´.,،!?؟:;؛…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function isContinuationCommand(value: unknown): boolean {
  return CONTINUATION_COMMANDS.has(normalizeCommand(value));
}

function runCanContinue(run: RunEvidenceRecord): boolean {
  if (run.status === 'interrupted') return true;
  if (run.status !== 'failed') return false;
  return (run.events || []).some(event => event.type === 'run_cancelled');
}

function safeProjectName(candidate: unknown): string {
  const value = String(candidate || '').trim().replace(/^['"`]|['"`]$/g, '');
  const name = value.split(/[\\/]/u).filter(Boolean).pop() || '';
  return /^[\p{L}\p{N}._-]{1,160}$/u.test(name) ? name : '';
}

function absoluteProjectRoot(candidate: unknown): string {
  const value = String(candidate || '').trim().replace(/^['"`]|['"`]$/g, '');
  return /^(?:[a-z]:[\\/]|\/)/iu.test(value) ? value : '';
}

export function recoverInterruptedProjectRoot(run: RunEvidenceRecord): string {
  const receiptRoot = absoluteProjectRoot(run.receipt?.projectRoot);
  if (receiptRoot) return receiptRoot;

  for (const event of (run.events || []).slice().reverse()) {
    if (event?.type === 'continuation_started' && event.data && typeof event.data === 'object') {
      const lineageRoot = absoluteProjectRoot((event.data as any).projectRoot);
      if (lineageRoot) return lineageRoot;
    }
    const text = typeof event?.data === 'string' ? event.data : '';
    if (!text) continue;
    const candidate = text.match(/scaffolded\s+\d+\s+files\s+in\s+(.+?)(?:\s+[—-]\s+|[\r\n]|$)/iu)?.[1]
      || text.match(/^\s*[│|]\s+(.+?)\s*$/mu)?.[1]
      || text.match(/^(.+?)\s+\$\s+(?:npm|node|pnpm|yarn)\b/mu)?.[1];
    const root = absoluteProjectRoot(candidate);
    if (root) return root;
  }
  return '';
}

export function recoverInterruptedProjectName(run: RunEvidenceRecord): string {
  return safeProjectName(recoverInterruptedProjectRoot(run));
}

export function findInterruptedContinuation(
  command: unknown,
  runs: RunEvidenceRecord[],
  messages: SessionMessage[],
): { goal: string; runId: string; projectName?: string; projectRoot?: string } | null {
  if (!isContinuationCommand(command)) return null;
  const continuable = runs
    .filter(runCanContinue)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  // Older records predate explicit continuation lineage. A process-restart
  // interruption is the original durable run; later run_cancelled records may
  // be failed resume attempts and must not replace its project identity.
  const interrupted = continuable.find(run => run.status === 'interrupted') || continuable[0];
  if (!interrupted) return null;

  const previousRequest = messages.slice().reverse().find(message => {
    const content = String(message?.content || '').trim();
    return message?.role === 'user' && content.length > 0 && !isContinuationCommand(content);
  });
  const goal = String(previousRequest?.content || '').trim();
  const requestTime = Date.parse(String(previousRequest?.createdAt || ''));
  const interruptedTime = Date.parse(interrupted.updatedAt);
  if (Number.isFinite(requestTime) && Number.isFinite(interruptedTime) && requestTime > interruptedTime) {
    return null;
  }
  if (!goal) return null;
  const projectRoot = recoverInterruptedProjectRoot(interrupted);
  const projectName = safeProjectName(projectRoot);
  return {
    goal,
    runId: interrupted.runId,
    ...(projectName ? { projectName } : {}),
    ...(projectRoot ? { projectRoot } : {}),
  };
}

export function continuationExecutionGoal(originalGoal: string, projectName = ''): string {
  const target = safeProjectName(projectName);
  return [
    target
      ? `Continue the latest project "${target}" in its existing workspace from the interrupted state. Do not create a new project or repeat completed work.`
      : 'Continue the latest project in its existing workspace from the interrupted state. Do not create a new project or repeat completed work.',
    'Complete and verify the original request below:',
    originalGoal.trim(),
  ].join('\n\n');
}
