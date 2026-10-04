import { tools, contractDefaults } from '../../api/src/modules/tools/registry.ts';
const withExec = tools.filter((t: any) => typeof t?.execute === 'function');
const names = tools.map((t: any) => t?.name).filter(Boolean);
console.log(JSON.stringify({
  registered: tools.length,
  withExecute: withExec.length,
  uniqueNames: new Set(names).size,
  defaultedPermissions: contractDefaults.permissions.length,
  defaultedRateLimit: contractDefaults.rateLimit.length,
  unknownPermissions: contractDefaults.unknown.length,
}, null, 1));
