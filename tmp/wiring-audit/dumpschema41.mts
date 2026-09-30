import { pathToFileURL } from 'node:url';
const mod = process.argv[2];
const reg = await import(pathToFileURL(mod).href);
for (const n of ['secrets_scan_repo', 'performance_profile', 'payments_create_checkout_session', 'video_action', 'npm_manager', 'inspect_symbol', 'code_reviewer', 'browser_translate', 'dead_code_detector', 'rss_fetch']) {
    const t = (reg.tools || []).find((x: any) => x?.name === n);
    console.log(n, '=> required:', JSON.stringify(t?.inputSchema?.required || []), 'requiredAny:', JSON.stringify(t?.inputSchema?.requiredAny || []), 'props:', JSON.stringify(Object.keys(t?.inputSchema?.properties || {})));
}
