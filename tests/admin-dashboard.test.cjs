const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('le nouveau dashboard admin remplace le menu visible sans supprimer les sections existantes', () => {
  const html = read('admin.html');
  const css = read('admin-dashboard.css');
  const script = read('admin-dashboard.js');
  const tabs = new Set([...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]));
  const dashboardTargets = [...html.matchAll(/data-dashboard-tab="([^"]+)"/g)].map(match => match[1]);
  assert.ok(dashboardTargets.length >= 20, 'chaque rubrique doit rester atteignable par les raccourcis');
  for (const target of dashboardTargets) assert.ok(tabs.has(target), `destination inconnue: ${target}`);
  for (const id of ['revenue', 'historical-revenue', 'pending', 'confirmed', 'balance']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(css, /\.sidebar\{display:none\}/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(script, /navButton\(id\)/);
  assert.match(script, /dashboard-today/);
  assert.match(html, /id="logout"/);
  assert.match(html, /href="team\.html"/);
  assert.match(html, /href="index\.html"/);
  assert.equal((html.match(/admin-dashboard\.css\?v=/g) || []).length, 1);
  assert.equal((html.match(/admin-dashboard\.js\?v=/g) || []).length, 1);
});
