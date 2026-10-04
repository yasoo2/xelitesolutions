import { tools } from 'D:/Joe/xelitesolutions/api/src/modules/tools/registry';
const names = (tools as any[]).map((t: any) => t.name);
console.log('NVIDIA_DIRTY_REGISTRY_COUNT=' + names.length);
for (const n of ['visual_qa', 'generate_image', 'bulk_file_generator',
  'VisualQATool', 'ImageGenerationTool', 'BulkFileGeneratorTool', 'specification_verification']) {
  console.log(n + '=' + names.includes(n));
}
const noExec = (tools as any[]).filter((t: any) => typeof t.execute !== 'function').map((t: any) => t.name);
console.log('WITHOUT_EXECUTE=' + JSON.stringify(noExec));
