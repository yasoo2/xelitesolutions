import type { EngineeringTaskType, PromptAnalysis } from './types';

function hasArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function includesAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function detectTaskType(prompt: string): EngineeringTaskType {
  const lower = prompt.toLowerCase();
  if (includesAny(lower, ['bug', 'fix', 'error', 'crash', 'broken', 'لا يعمل', 'مشكلة', 'خطأ', 'اصلح', 'إصلاح'])) return 'bugfix';
  if (includesAny(lower, ['ui', 'frontend', 'button', 'screen', 'layout', 'css', 'react', 'واجهة', 'تصميم', 'زر'])) return 'ui';
  if (includesAny(lower, ['api', 'backend', 'route', 'express', 'server', 'database', 'mongo', 'خادم', 'سيرفر'])) return 'backend';
  if (includesAny(lower, ['deploy', 'docker', 'nginx', 'render', 'cloudflare', 'production', 'نشر', 'دبلوي'])) return 'deploy';
  if (includesAny(lower, ['security', 'auth', 'jwt', 'token', 'cors', 'password', 'أمان', 'حماية'])) return 'security';
  if (includesAny(lower, ['browser', 'playwright', 'websocket', 'ws', 'متصفح', 'بث'])) return 'browser';
  if (includesAny(lower, ['build', 'create', 'add', 'implement', 'feature', 'طور', 'ابني', 'أنشئ', 'اضف'])) return 'feature';
  if (includesAny(lower, ['explain', 'what is', 'why', 'اشرح', 'ما هو', 'لماذا'])) return 'explain';
  return 'unknown';
}

function inferLikelyFiles(prompt: string, taskType: EngineeringTaskType): string[] {
  const files = new Set<string>();
  const lower = prompt.toLowerCase();

  if (taskType === 'ui' || lower.includes('react')) {
    files.add('web/src');
    files.add('web/src/config.ts');
  }
  if (taskType === 'backend' || taskType === 'security') {
    files.add('api/src/api');
    files.add('api/src/shared/config.ts');
  }
  if (lower.includes('cors')) files.add('api/src/api/app.ts');
  if (lower.includes('jwt') || lower.includes('auth') || lower.includes('login')) files.add('api/src/api/routes/auth.ts');
  if (lower.includes('websocket') || lower.includes('ws')) files.add('api/src/api/ws.ts');
  if (lower.includes('browser') || lower.includes('playwright')) files.add('api/src/modules/browser');
  if (lower.includes('docker')) files.add('api/Dockerfile');
  if (lower.includes('nginx')) files.add('web/nginx.conf');

  return Array.from(files);
}

export class PromptAnalyzer {
  analyze(prompt: string): PromptAnalysis {
    const text = String(prompt || '').trim();
    const taskType = detectTaskType(text);
    const likelyFiles = inferLikelyFiles(text, taskType);
    const arabic = hasArabic(text);

    const risks: string[] = [];
    if (taskType === 'deploy') risks.push('Deployment changes may affect production availability.');
    if (taskType === 'security') risks.push('Security changes must preserve authentication and authorization behavior.');
    if (includesAny(text, ['delete', 'remove', 'drop', 'rm -rf', 'حذف'])) risks.push('Prompt may request destructive changes.');

    const missingInfo: string[] = [];
    if (!text) missingInfo.push('Prompt is empty.');

    return {
      goal: text || 'No prompt provided',
      taskType,
      projectType: likelyFiles.some((f) => f.startsWith('web/')) ? 'web-app' : likelyFiles.some((f) => f.startsWith('api/')) ? 'api-service' : undefined,
      requiredOutput: taskType === 'explain' ? ['clear explanation'] : ['implemented change', 'validation result', 'final report'],
      likelyFiles,
      risks,
      missingInfo,
      shouldAskUser: false,
      assumptions: [
        arabic ? 'سأفترض المطلوب من السياق وأتجنب سؤال المستخدم إلا إذا كان التنفيذ مستحيلًا.' : 'Proceed with best-effort assumptions and avoid asking unless blocked.',
        'Keep changes minimal, reversible, and testable.',
      ],
    };
  }
}

export const promptAnalyzer = new PromptAnalyzer();
