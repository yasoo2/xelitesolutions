import { executeTool } from '../tools/registry';

async function main() {
  const name = String(process.env.WEB_NAME || 'mega-site').trim();
  const type = String(process.env.WEB_TYPE || 'ecommerce').trim();
  const featuresEnv = String(process.env.WEB_FEATURES || '').trim();
  const baseDir = String(process.env.WEB_BASE_DIR || '').trim();
  const features = featuresEnv ? featuresEnv.split(',').map(s => s.trim()).filter(Boolean) : ['auth', 'products', 'cart', 'orders'];
  const skipDev = String(process.env.WEB_SKIP_DEV || '').trim() === '1' || String(process.env.WEB_SKIP_DEV || '').trim().toLowerCase() === 'true';
  const res = await executeTool('website_full_pipeline', { name, type, features, baseDir, skipDev });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
