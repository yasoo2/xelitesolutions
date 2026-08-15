import fs from 'fs';
import path from 'path';
import { resolveToolPath } from './utils';

/**
 * Inspect the selected workspace before repairing a bad npm launcher.
 * A plan may know that a project must be started while still guessing a
 * script name. Recovery learns the repository contract from package.json and
 * only handles a missing server-like script when a real launcher exists.
 */
export function recoverMissingNpmLauncher(
  command: unknown,
  taskDescription: unknown,
  cwd: unknown,
  workspaceId?: string,
  background?: unknown,
): { command: string; cwd?: string; background?: boolean; script: string; manifest: string } | null {
  const rawCommand = String(command || '').trim();
  const match = rawCommand.match(/^npm\s+run\s+([A-Za-z0-9:_-]+)(?:\s|$)/i);
  if (!match) return null;

  const requestedScript = match[1];
  const taskText = `${String(taskDescription || '')} ${requestedScript}`;
  if (!/(?:server|start|launch|serve|boot)/i.test(taskText)) return null;

  let resolvedCwd: string;
  try {
    resolvedCwd = resolveToolPath(String(cwd || '.'), { workspaceId });
  } catch {
    return null;
  }

  const candidates = [
    path.join(resolvedCwd, 'package.json'),
    path.join(path.dirname(resolvedCwd), 'package.json'),
  ];
  for (const manifestPath of candidates) {
    try {
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const scripts = manifest?.scripts && typeof manifest.scripts === 'object' ? manifest.scripts : {};
      if (typeof scripts[requestedScript] === 'string') return null;
      const fallback = ['start', 'dev', 'serve', 'preview']
        .find(name => typeof scripts[name] === 'string' && scripts[name].trim());
      if (!fallback) continue;

      const isExplicitBackground = typeof background === 'boolean';
      const launcherBackground = isExplicitBackground ? Boolean(background) : true;
      return {
        command: `npm run ${fallback}`,
        cwd: path.dirname(manifestPath),
        ...(launcherBackground ? { background: true } : { background: false }),
        script: fallback,
        manifest: manifestPath,
      };
    } catch {
      // Invalid or unreadable manifests are evidence of no safe fallback.
    }
  }
  return null;
}
