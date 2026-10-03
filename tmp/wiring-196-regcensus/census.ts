import { tools } from '../../api/src/modules/tools/registry';
import { PLANNER_TOOL_CATALOGUE } from '../../api/src/core/orchestrator/plan-tools';
import * as fs from 'fs';
import * as path from 'path';

const regNames = tools.map((t: any) => String(t.name)).sort();
console.log('REGISTERED_COUNT=' + regNames.length);
fs.writeFileSync(path.join(__dirname, 'registered-names.txt'), regNames.join('\n') + '\n');

const catTools = PLANNER_TOOL_CATALOGUE.map((e) => String(e.tool)).sort();
console.log('CATALOGUE_ENTRIES=' + PLANNER_TOOL_CATALOGUE.length);
console.log('CATALOGUE_UNIQUE=' + new Set(catTools).size);
fs.writeFileSync(path.join(__dirname, 'catalogue-tools.txt'), catTools.join('\n') + '\n');

const regSet = new Set(regNames);
const catSet = new Set(catTools);
const catNotReg = [...catSet].filter((n) => !regSet.has(n)).sort();
const regNotCat = regNames.filter((n) => !catSet.has(n)).sort();
console.log('CATALOGUE_NOT_REGISTERED_COUNT=' + catNotReg.length + ' :: ' + catNotReg.join(','));
console.log('REGISTERED_NOT_IN_CATALOGUE_COUNT=' + regNotCat.length);
fs.writeFileSync(path.join(__dirname, 'catalogue-not-registered.txt'), catNotReg.join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, 'registered-not-in-catalogue.txt'), regNotCat.join('\n') + '\n');

// Static: definition files vs registry.ts imports
const defDir = path.resolve(__dirname, '../../api/src/modules/tools/definitions');
const defFiles = fs.readdirSync(defDir).filter((f) => f.endsWith('.ts')).sort();
console.log('DEFINITION_FILES=' + defFiles.length);
const regSrc = fs.readFileSync(path.resolve(__dirname, '../../api/src/modules/tools/registry.ts'), 'utf8');
const notImported = defFiles.filter((f) => !regSrc.includes('./definitions/' + f.replace(/\.ts$/, '')));
console.log('DEF_FILES_NOT_IMPORTED_BY_REGISTRY_COUNT=' + notImported.length + ' :: ' + notImported.join(','));
fs.writeFileSync(path.join(__dirname, 'def-files-not-imported.txt'), notImported.join('\n') + '\n');
