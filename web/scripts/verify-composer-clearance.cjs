const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const postcss = require('postcss');

// Run the actual layout effect with controlled geometry and lifecycle edges.
// CSS assertions inspect real parsed declarations; browser hit-testing remains
// a separate acceptance check. This verifier never writes or opens a browser.
const sourcePath = path.resolve(__dirname, '../src/components/JoeIDELayout.tsx');
const source = readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
let layoutElement;
(function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useLayoutEffect'
    && node.arguments[1]?.getText(ast) === '[isMobile, isChatCollapsed, sessionId]') {
    assert.equal(effect, undefined, 'Exactly one composer-clearance layout effect must exist');
    effect = node.arguments[0];
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'div'
    && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(ast) === 'ref' && attribute.initializer?.getText(ast) === '{layoutRef}')) {
    layoutElement = node;
  }
  ts.forEachChild(node, visit);
})(ast);
assert(effect && ts.isArrowFunction(effect), 'Actual composer-clearance layout effect must exist');
assert(layoutElement, 'Layout root must own its ref');
const code = ts.transpileModule(`this.invoke = ${effect.getText(ast)};`, { compilerOptions: {
  module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022,
} }).outputText;
const cssPath = path.resolve(__dirname, '../src/styles/joe-premium.css');
const css = postcss.parse(readFileSync(cssPath, 'utf8'), { from: cssPath });

function eventTarget() {
  const callbacks = new Map();
  return {
    addEventListener(type, callback) {
      const bucket = callbacks.get(type) || new Set(); bucket.add(callback); callbacks.set(type, bucket);
    },
    removeEventListener(type, callback) { callbacks.get(type)?.delete(callback); },
    fire(type) { for (const callback of [...(callbacks.get(type) || [])]) callback(); },
    count(type = 'resize') { return callbacks.get(type)?.size || 0; },
  };
}
function fixture({ mobile = true, collapsed = false, height = 524, top = 364.67,
  composerHeight = 117.33, observerAvailable = true, viewportAvailable = true,
  layoutAvailable = true, composerAvailable = true } = {}) {
  const observations = [];
  const viewport = eventTarget();
  const window = Object.assign(eventTarget(), { innerHeight: height,
    visualViewport: viewportAvailable ? viewport : undefined });
  let currentTop = top; let currentHeight = composerHeight;
  const createComposer = () => ({ getBoundingClientRect: () => ({ top: currentTop, height: currentHeight }) });
  let composer = composerAvailable ? createComposer() : null;
  const queries = [];
  const layout = { querySelector(selector) {
    queries.push(selector); assert.equal(selector, '.joe-chat-input-area'); return composer;
  } };
  const state = { clearance: 0, changes: 0 };
  const context = { isMobile: mobile, isChatCollapsed: collapsed, sessionId: 'session-a',
    layoutRef: { current: layoutAvailable ? layout : null }, window,
    setCommandClearance(value) {
      const next = typeof value === 'function' ? value(state.clearance) : value;
      assert(Number.isFinite(next)); assert(next >= 0);
      if (next !== state.clearance) state.changes += 1;
      state.clearance = next;
    },
  };
  if (observerAvailable) context.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; observations.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  };
  vm.runInNewContext(code, context, { timeout: 1000 });
  let cleanup;
  return { state, context, window, viewport, observations, layout, queries,
    get composer() { return composer; },
    mount() { cleanup = context.invoke(); },
    unmount() { cleanup?.(); cleanup = undefined; },
    geometry(nextTop, nextHeight = currentHeight) { currentTop = nextTop; currentHeight = nextHeight; },
    resize(target = composer) {
      for (const observer of observations) if (observer.targets.has(target)) observer.callback();
    },
    replaceComposer() { composer = createComposer(); return composer; },
    assertBoundary() {
      assert(window.innerHeight - state.clearance <= currentTop, 'Canvas bottom must not extend into composer');
    },
  };
}

test('initial measurement reserves the whole composer and sessions strip without overlap', () => {
  const f = fixture(); f.mount();
  assert.equal(f.state.clearance, 160); f.assertBoundary();
  assert.deepEqual(f.queries, ['.joe-chat-input-area']);
  assert(f.observations[0].targets.has(f.composer)); assert(f.observations[0].targets.has(f.layout));
  assert.equal(f.window.count(), 1); assert.equal(f.viewport.count(), 1);
});
test('multiline input and attachment growth move the canvas boundary above the expanded composer', () => {
  const f = fixture(); f.mount();
  f.geometry(300.2, 181.8); f.resize(); assert.equal(f.state.clearance, 224); f.assertBoundary();
  f.geometry(250.4, 231.6); f.resize(); assert.equal(f.state.clearance, 274); f.assertBoundary();
  f.geometry(414, 68); f.resize(); assert.equal(f.state.clearance, 110); f.assertBoundary();
});
test('a layout size change remeasures composer position even when its own height is unchanged', () => {
  const f = fixture(); f.mount(); f.geometry(340);
  f.resize(f.layout); assert.equal(f.state.clearance, 184); f.assertBoundary();
});
test('viewport shrink and expansion recompute clearance from current geometry', () => {
  const f = fixture(); f.mount(); f.window.innerHeight = 420; f.geometry(270, 108);
  f.window.fire('resize'); assert.equal(f.state.clearance, 150); f.assertBoundary();
  f.window.innerHeight = 700; f.geometry(540, 118);
  f.window.fire('resize'); assert.equal(f.state.clearance, 160); f.assertBoundary();
});
test('visual viewport resize triggers measurement when the layout geometry moves', () => {
  const f = fixture(); f.mount(); f.geometry(280);
  f.viewport.fire('resize'); assert.equal(f.state.clearance, 244); f.assertBoundary();
});
test('desktop transition releases observation and resets the mobile-only inset', () => {
  const f = fixture(); f.mount(); f.unmount(); f.context.isMobile = false; f.mount();
  assert.equal(f.state.clearance, 0); assert.equal(f.window.count(), 0); assert.equal(f.viewport.count(), 0);
  assert(f.observations[0].disconnected);
  f.geometry(100); f.resize(); f.window.fire('resize'); assert.equal(f.state.clearance, 0);
  f.context.isMobile = true; f.mount(); assert.equal(f.state.clearance, 424); f.assertBoundary();
});
test('intentional chat collapse clears reservation; restoring chat observes its current geometry', () => {
  const f = fixture(); f.mount(); f.unmount(); f.context.isChatCollapsed = true; f.mount();
  assert.equal(f.state.clearance, 0); assert.equal(f.window.count(), 0);
  f.unmount(); f.geometry(320); f.context.isChatCollapsed = false; f.mount();
  assert.equal(f.state.clearance, 204); f.assertBoundary();
});
test('session remount observes the replacement composer and releases all old callbacks', () => {
  const f = fixture(); f.mount(); const oldComposer = f.composer; f.unmount();
  f.replaceComposer(); f.geometry(300); f.context.sessionId = 'session-b'; f.mount();
  assert.equal(f.state.clearance, 224); assert(f.observations[0].disconnected);
  assert(f.observations[1].targets.has(f.composer)); assert(!f.observations[1].targets.has(oldComposer));
  f.geometry(200); f.resize(oldComposer); assert.equal(f.state.clearance, 224);
  f.resize(); assert.equal(f.state.clearance, 324); f.assertBoundary();
  assert.equal(f.window.count(), 1); assert.equal(f.viewport.count(), 1);
});
test('cleanup disconnects the observer and removes both resize subscriptions', () => {
  const f = fixture(); f.mount(); f.unmount(); const previous = f.state.clearance;
  f.geometry(50); f.resize(); f.window.fire('resize'); f.viewport.fire('resize');
  assert.equal(f.state.clearance, previous); assert.equal(f.window.count(), 0); assert.equal(f.viewport.count(), 0);
  assert.equal(f.observations[0].targets.size, 0);
});
test('unchanged geometry does not change state repeatedly', () => {
  const f = fixture(); f.mount(); const changes = f.state.changes;
  f.resize(); f.resize(f.layout); f.window.fire('resize'); f.viewport.fire('resize');
  assert.equal(f.state.changes, changes);
});
for (const missing of ['layoutAvailable', 'composerAvailable']) {
  test(`missing ${missing} resets a stale clearance without installing listeners`, () => {
    const f = fixture({ [missing]: false }); f.state.clearance = 160; f.mount();
    assert.equal(f.state.clearance, 0); assert.equal(f.observations.length, 0); assert.equal(f.window.count(), 0);
  });
}
test('hidden or offscreen composer cannot produce a negative clearance', () => {
  const f = fixture(); f.mount(); f.geometry(364, 0); f.resize(); assert.equal(f.state.clearance, 0);
  f.geometry(600, 80); f.resize(); assert.equal(f.state.clearance, 0);
});
test('missing optional observer and visual viewport preserve initial and window-resize measurement', () => {
  const f = fixture({ observerAvailable: false, viewportAvailable: false }); f.mount();
  assert.equal(f.state.clearance, 160); f.geometry(300); f.window.fire('resize');
  assert.equal(f.state.clearance, 224); f.unmount(); assert.equal(f.window.count(), 0);
});
test('the measured custom property is bound to this layout root', () => {
  const style = layoutElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute)
    && attribute.name.getText(ast) === 'style');
  assert(style && ts.isJsxExpression(style.initializer));
  let expression = style.initializer.expression;
  if (ts.isAsExpression(expression)) expression = expression.expression;
  assert(ts.isObjectLiteralExpression(expression));
  const property = expression.properties.find(node => ts.isPropertyAssignment(node)
    && node.name.text === '--joe-command-clearance');
  assert(property && ts.isTemplateExpression(property.initializer));
  assert.equal(property.initializer.head.text, '');
  assert.equal(property.initializer.templateSpans.length, 1);
  assert.equal(property.initializer.templateSpans[0].expression.getText(ast), 'commandClearance');
  assert.equal(property.initializer.templateSpans[0].literal.text, 'px');
});

function declarations(selector, width) {
  const values = new Map();
  css.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type !== 'atrule' || parent.name !== 'media') continue;
      const max = /max-width:\s*([\d.]+)px/.exec(parent.params);
      const min = /min-width:\s*([\d.]+)px/.exec(parent.params);
      if ((max && width > Number(max[1])) || (min && width < Number(min[1]))) return;
    }
    rule.walkDecls(declaration => {
      const old = values.get(declaration.prop);
      if (!old?.important || declaration.important) values.set(declaration.prop,
        { value: declaration.value, important: Boolean(declaration.important) });
    });
  });
  return values;
}
for (const width of [390, 615, 900]) {
  test(`actual CSS at ${width}px keeps canvas fixed with auto height above the visible composer`, () => {
    const base = declarations('.joe-workspace-container', width);
    assert.deepEqual(base.get('position'), { value: 'fixed', important: true });
    assert.deepEqual(base.get('height'), { value: 'auto', important: true });
    assert.equal(base.get('bottom').value, '0');
    const inset = declarations('.joe-main:not(.chat-collapsed) .joe-workspace-container', width);
    assert.equal(inset.get('bottom').value, 'var(--joe-command-clearance, 0px)');
  });
}
test('actual CSS at 901px leaves desktop canvas outside the mobile inset rules', () => {
  const base = declarations('.joe-workspace-container', 901);
  assert.equal(base.get('position').value, 'relative'); assert.equal(base.has('height'), false);
  assert.equal(declarations('.joe-main:not(.chat-collapsed) .joe-workspace-container', 901).has('bottom'), false);
});
test('clearance CSS is restricted to mobile and excludes intentionally collapsed chat', () => {
  const rules = [];
  css.walkDecls('bottom', declaration => {
    if (declaration.value.includes('--joe-command-clearance')) rules.push(declaration.parent);
  });
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].selectors, ['.joe-main:not(.chat-collapsed) .joe-workspace-container']);
  assert.equal(rules[0].parent.type, 'atrule'); assert.equal(rules[0].parent.name, 'media');
  assert.match(rules[0].parent.params, /^\(max-width:\s*900px\)$/);
});
