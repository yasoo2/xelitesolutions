import { tools } from '../../api/src/modules/tools/registry';
const names = tools.map((t: any) => t.name);
console.log('MUSE_SOURCE_REGISTRY_COUNT=' + names.length);
for (const n of ['visual_qa', 'generate_image', 'bulk_file_generator', 'image_studio',
  'VisualQATool', 'ImageGenerationTool', 'BulkFileGeneratorTool', 'codebase_navigator',
  'specification_verification']) {
  console.log(n + '=' + names.includes(n));
}
const pascal = names.filter((n: string) => /^[A-Z]/.test(n));
console.log('PASCALCASE_ENTRIES=' + JSON.stringify(pascal));
const noExec = tools.filter((t: any) => typeof t.execute !== 'function').map((t: any) => t.name);
console.log('WITHOUT_EXECUTE=' + JSON.stringify(noExec));
