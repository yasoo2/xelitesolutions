import fs from 'fs';
import path from 'path';

/**
 * Architecture guard for package.json scripts.
 *
 * This prevents a previous failure mode where package.json contained duplicate
 * or misleading self-fix scripts, causing builders to report success while
 * running unrelated commands.
 */
function extractScriptsBlock(raw: string): string {
  const marker = '"scripts"';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) throw new Error('package.json is missing scripts block');

  const firstBrace = raw.indexOf('{', markerIndex);
  if (firstBrace < 0) throw new Error('scripts block is malformed');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < raw.length; i += 1) {
    const ch = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(firstBrace, i + 1);
    }
  }

  throw new Error('scripts block is not closed');
}

function findDuplicateScriptKeys(scriptsBlock: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const keyRegex = /"([^"]+)"\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = keyRegex.exec(scriptsBlock))) {
    const key = match[1];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  return [...duplicates].sort();
}

function main() {
  const packagePath = path.resolve(process.cwd(), 'package.json');
  const raw = fs.readFileSync(packagePath, 'utf8');
  const parsed = JSON.parse(raw);
  const scripts = parsed.scripts || {};
  const scriptsBlock = extractScriptsBlock(raw);
  const duplicates = findDuplicateScriptKeys(scriptsBlock);

  const requiredScripts: Record<string, string> = {
    'guard:architecture': 'ts-node src/tests/architecture/guard_architecture.ts',
    'test:self-fix:build-context': 'ts-node src/tests/manual/verify_self_fix_build_context.ts',
    'test:self-fix:execution-safety': 'ts-node src/tests/manual/verify_self_fix_execution_safety.ts',
    'test:self-fix:typescript-repair': 'ts-node src/tests/manual/verify_self_fix_typescript_repair.ts',
    'test:self-fix:typescript-missing-name': 'ts-node src/tests/manual/verify_self_fix_typescript_missing_name.ts',
    'test:self-healing:failure': 'ts-node src/tests/manual/verify_self_healing_loop.ts',
    'test:self-healing:success': 'ts-node src/tests/manual/verify_self_healing_success_loop.ts',
  };

  let ok = true;

  if (duplicates.length) {
    ok = false;
    console.error('❌ Duplicate package scripts found:', duplicates.join(', '));
  } else {
    console.log('✅ No duplicate package script keys found');
  }

  for (const [name, expected] of Object.entries(requiredScripts)) {
    if (scripts[name] !== expected) {
      ok = false;
      console.error(`❌ Script ${name} is wrong. Expected: ${expected}. Actual: ${scripts[name]}`);
    } else {
      console.log(`✅ ${name}`);
    }
  }

  const forbiddenMappings = [
    ['check:self-fix-patch', 'eslint .'],
    ['patch:self-fix', 'eslint . --fix'],
    ['guard:architecture', 'knip'],
  ];

  for (const [name, forbidden] of forbiddenMappings) {
    if (scripts[name] === forbidden) {
      ok = false;
      console.error(`❌ Misleading script mapping detected: ${name} -> ${forbidden}`);
    }
  }

  if (!ok) process.exit(1);
  console.log('✅ package.json self-fix scripts guard passed');
}

main();
