/* Checkpoint 44 follow-up: shell_exec declaration/alias/emitter census, both trees. */
const fs = require('node:fs');
const path = require('node:path');
for (const [tree, srcDir] of [['MUSE', 'D:/Joe/muse-worktree/api/src'], ['MAIN', 'D:/Joe/xelitesolutions/api/src']]) {
  const defDir = path.join(srcDir, 'modules/tools/definitions');
  const declFiles = [];
  const emitters = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (!src.includes('shell_exec')) continue;
      if (/\bname\s*[:=]\s*'shell_exec'/.test(src)) declFiles.push(path.relative(srcDir, p));
      for (const m of src.matchAll(/tool:\s*'shell_exec'|executeTool\(\s*'shell_exec'|'(shell_exec)'\s*[,}\]]/g))
        emitters.push(path.relative(srcDir, p));
    }
  };
  walk(srcDir);
  const svc = fs.readFileSync(path.join(srcDir, 'modules/services/ToolService.ts'), 'utf8');
  const aliasM = /^\s*shell_exec\s*:\s*'([a-z0-9_]+)'/m.exec(svc);
  console.log(tree + ' declared=' + JSON.stringify(declFiles) + ' aliasTarget=' + (aliasM ? aliasM[1] : 'NONE'));
  console.log(tree + ' emitterRefs=' + JSON.stringify([...new Set(emitters)]));
}
