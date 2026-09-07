import fs from 'fs';
import path from 'path';

const behaviour = fs.readFileSync(path.resolve(__dirname, '../core/quality/behaviour-audit.ts'), 'utf8');
const audit = fs.readFileSync(path.resolve(__dirname, '../core/quality/app-audit.ts'), 'utf8');

describe('theme toggle behaviour evidence', () => {
  it('recognizes theme and aria-pressed changes as a real control effect', () => {
    expect(behaviour).toContain("theme: document.documentElement.getAttribute('data-theme') || ''");
    expect(behaviour).toContain("document.querySelectorAll('[aria-pressed]')");
    expect(behaviour).toContain("b.theme !== a.theme || b.pressed !== a.pressed");
  });

  it('audits both legacy and accessible theme toggle selectors', () => {
    expect(audit).toContain('.theme-toggle,[aria-label="Toggle dark mode"],[aria-label="تبديل الوضع الليلي"]');
  });

  it('gives complete interactive QA a bounded but sufficient shared budget', () => {
    expect(audit).toContain('Math.min(240_000, base + routes * 6_000)');
  });
});
