import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const viewport = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

test('the personal area stays inside the phone screen', () => {
  const css = fs.readFileSync('public/crm.css', 'utf8');
  const layout = fs.readFileSync('src/crm/layout.js', 'utf8');
  assert.match(layout, new RegExp(viewport));
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /max-width:\s*100vw/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.tabbar/);
  assert.match(css, /min-height:\s*44px/);
  assert.equal(css.includes('minmax(260px, 1fr)'), false);
});
