const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { JSDOM } = require('jsdom');

async function main(input) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  window.confirm = () => true;
  window.scrollTo = () => {};
  const webRequire = createRequire(path.resolve(__dirname, '../../../../web/package.json'));
  const React = webRequire('react');
  const { createRoot } = webRequire('react-dom/client');
  const { act } = React;
  const load = (source, resolver) => {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', source)(module, module.exports, resolver);
    return module.exports;
  };
  const store = { ...load(input.store, require) };
  let finish;
  const calls = [];
  for (const action of ['apiCreate', 'apiUpdate', 'apiDelete']) {
    store[action] = (...args) => {
      calls.push({ action, args });
      return new Promise(resolve => { finish = resolve; });
    };
  }
  store.apiList = async () => null;
  const controller = load(input.controller, name => name === 'react' ? React : store);
  const defaultView = load(input.view, name => name === 'react' ? React
    : name.endsWith('records-controller.js') ? controller : store).default;
  const h = React.createElement;
  function AlternativeView({ controller: state }) {
    const rowTag = input.presentation === 'table' ? 'tr' : 'li';
    const cellTag = input.presentation === 'table' ? 'td' : 'span';
    const items = state.visible.map(row => h(rowTag, { key: row.id, className: 'row' },
      h(cellTag, null, row.title),
      h(cellTag, null, ['Yes', 'Edit', 'Delete'].map(label => h('button', {
        key: label, type: 'button', disabled: state.mutationBusy,
        onClick: () => ({ Yes: state.toggleDone, Edit: state.edit, Delete: state.remove })[label](row),
      }, label)))));
    return h('main', null,
      h('form', { className: 'form', onSubmit: state.submit },
        h('fieldset', { disabled: state.mutationBusy },
          h('input', { name: 'title', value: state.draft.title || '',
            onChange: event => state.setDraft({ ...state.draft, title: event.target.value }) }),
          h('button', { type: 'submit' }, 'Add'))),
      state.error ? h('p', { role: 'alert' }, state.error) : null,
      input.presentation === 'table' ? h('table', null, h('tbody', null, items)) : h('ul', null, items));
  }
  const App = load(input.component, name => name === 'react' ? React
    : name.endsWith('records-controller.js') ? controller
    : { __esModule: true, default: input.presentation === 'default' ? defaultView : AlternativeView }).default;
  const root = createRoot(document.getElementById('root'));
  const content = { storeKey: 'first', api: '/first', entityOne: 'record', entityMany: 'records',
    fields: [{ key: 'title', label: 'Title', type: 'text', required: true, primary: true },
      { key: 'status', label: 'Status', type: 'select', options: ['No', 'Yes'] }],
    statusField: 'status', doneValue: 'Yes', metrics: [] };
  const render = async value => act(async () => root.render(React.createElement(App, { content: value })));
  const title = () => document.querySelector('input[name="title"]');
  const fill = async value => act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(title(), value);
    title().dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const submit = async () => act(async () => document.querySelector('form.form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  const click = async label => act(async () => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
    assert.ok(button, label);
    button.click();
  });
  const settle = async value => act(async () => finish(value));
  const rows = () => store.createStore('first:rows').read();
  try {
    await render(content);
    await fill('Pending record');
    await submit();
    assert.equal(calls.length, 1);
    assert.ok(title().matches(':disabled'));
    assert.equal(document.querySelectorAll('.row').length, 0);
    await click('Add');
    await submit(); // Also exercise the handler, bypassing native disabled controls.
    assert.equal(calls.length, 1);
    await render({ ...content });
    assert.equal(title().value, 'Pending record');
    await settle({ ok: false, status: 401 });
    assert.match(document.querySelector('[role="alert"]').textContent, /sign in/);
    assert.equal(title().value, 'Pending record');
    assert.equal(rows().length, 0);
    await submit();
    await settle({ ok: true, item: { id: 42, title: 'Pending record', status: 'No' } });
    assert.equal(title().value, '');
    assert.equal(rows()[0].id, '42');
    await click('Yes');
    const count = calls.length;
    await click('Delete');
    await click('Edit');
    assert.equal(calls.length, count);
    assert.equal(rows()[0].status, 'No');
    await settle({ ok: true });
    assert.equal(rows()[0].status, 'Yes');
    await click('Delete');
    await settle({ ok: false, status: 403, error: 'not_your_row' });
    assert.equal(rows().length, 1);
    assert.match(document.querySelector('[role="alert"]').textContent, /not yours/);
    await fill('Old context');
    await submit();
    const oldFinish = finish;
    const second = { ...content, storeKey: 'second', api: '/second' };
    await render(second);
    assert.equal(document.querySelectorAll('.row').length, 0);
    await fill('New context draft');
    await act(async () => oldFinish({ ok: true, item: { id: 99, title: 'Old context' } }));
    assert.equal(title().value, 'New context draft');
    assert.equal(store.createStore('second:rows').read().length, 0);
    assert.equal(rows().length, 1);
    // Even an endpoint change under the same storage key is a new context.
    await submit();
    const secondFinish = finish;
    await render({ ...second, api: '/third' });
    await fill('Third context draft');
    await act(async () => secondFinish({ ok: false, status: 403 }));
    assert.equal(title().value, 'Third context draft');
    assert.equal(document.querySelector('[role="alert"]'), null);
    if (input.presentation === 'default') {
      await render({ ...content, storeKey: 'numeric-filter', api: '', filterFields: ['amount'],
        fields: [...content.fields, { key: 'amount', label: 'Amount', type: 'number' }] });
      const numericFilter = document.querySelector('.filter-input');
      assert.equal(numericFilter.type, 'number');
      numericFilter.value = '12.5';
      assert.equal(numericFilter.validity.stepMismatch, false);
      assert.equal(numericFilter.checkValidity(), true);
      numericFilter.value = 'letters';
      assert.equal(numericFilter.value, '', 'native numeric input must not retain letters');
      numericFilter.value = '1e309';
      assert.equal(numericFilter.value, '', 'native numeric input must not retain infinite values');
    }
    console.log('DOM mutation checks passed');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => main(JSON.parse(input)).catch(error => { console.error(error); process.exitCode = 1; }));
