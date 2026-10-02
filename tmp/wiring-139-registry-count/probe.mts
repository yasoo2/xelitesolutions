import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const defDir = join(here, '..', '..', 'api', 'src', 'modules', 'tools', 'definitions');
const defFiles = readdirSync(defDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

// Importing the registry executes registration (throws on duplicate names).
const { tools, contractDefaults } = await import('../../api/src/modules/tools/registry.ts');

const names = tools.map((t: any) => t?.name).filter(Boolean);
console.log(JSON.stringify({
    definitionFiles: defFiles.length,
    registeredTools: tools.length,
    uniqueNames: new Set(names).size,
    namelessSkipped: tools.length - names.length,
    defaultedPermissions: contractDefaults.permissions.length,
    defaultedPermissionNames: contractDefaults.permissions,
    defaultedRateLimit: contractDefaults.rateLimit.length,
    droppedUnknown: contractDefaults.unknown,
}, null, 2));
