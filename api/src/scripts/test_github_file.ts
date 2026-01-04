import { tools, executeTool } from '../tools/registry';

async function main() {
  const t = tools.find(x => x.name === 'github_create_or_update_file');
  if (!t) {
    console.log('Available tools:', tools.map(x => x.name));
    console.error('❌ Tool not found');
    process.exit(1);
  }
  const owner = String(process.env.GITHUB_OWNER || '').trim();
  const repo = String(process.env.GITHUB_REPO || '').trim();
  const path = String(process.env.GITHUB_PATH || 'JOE_TEST.txt').trim();
  const branch = String(process.env.GITHUB_BRANCH || '').trim();
  const content = `Hello from JOE at ${new Date().toISOString()}\n`;
  const message = `Add or update ${path}`;
  const res = await executeTool('github_create_or_update_file', { owner, repo, path, content, message, branch });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
