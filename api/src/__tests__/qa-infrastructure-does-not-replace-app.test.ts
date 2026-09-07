import fs from 'fs';
import path from 'path';

const AUDIT = fs.readFileSync(
  path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'),
  'utf-8',
);

const PROJECT = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
  'utf-8',
);

describe('QA failures do not overwrite a request-specific application', () => {
  it('separates inspector failures from broken routes and empty pages', () => {
    expect(AUDIT).toContain('const auditErrors: string[] = []');
    expect(AUDIT).toContain('isAuditInfrastructureError');
    expect(AUDIT).toContain("id: 'qa_infrastructure'");
    expect(AUDIT).toContain('!allControls.length && !allForms.length && !auditErrors.length');
  });

  it('keeps QA infrastructure defects outside the authored-render rollback set', () => {
    const from = PROJECT.indexOf('const AUTHORED_RENDER_FAULTS');
    const to = PROJECT.indexOf('const canRestoreDeterministic', from);
    const rollbackSet = PROJECT.slice(from, to);

    expect(rollbackSet).toContain("'empty_page'");
    expect(rollbackSet).not.toContain('qa_infrastructure');
  });
});
