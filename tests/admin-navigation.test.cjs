const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('le menu admin regroupe les rubriques approuvées et garde tableau de bord et calendrier directs', () => {
  const html = read('admin.html');
  const match = html.match(/<nav class="nav">([\s\S]*?)<\/nav>/);
  assert.ok(match, 'le menu admin doit être présent');
  const nav = match[1];
  assert.match(nav, /<button class="active" data-tab="overview">Tableau de bord<\/button>/);
  assert.match(nav, /<button data-tab="calendar">Calendrier<\/button>/);
  const groups = new Map([...nav.matchAll(/<details class="nav-group" data-nav-group="([^"]+)">([\s\S]*?)<\/details>/g)].map(m => [m[1], m[2]]));
  assert.deepEqual([...groups.keys()], ['reservations', 'fleet', 'partners', 'team', 'finance', 'site']);
  const expected = {
    reservations: ['reservations', 'quotes', 'customers'],
    fleet: ['vehicles', 'maintenance', 'damage-prices'],
    partners: ['partner-requests', 'owners'],
    team: ['chauffeurs'],
    finance: ['sales', 'archive', 'signature'],
    site: ['settings', 'ads', 'reviews', 'promos', 'entertainment'],
  };
  for (const [group, ids] of Object.entries(expected)) {
    assert.match(groups.get(group), /<summary>/, `${group} doit avoir un libellé accessible`);
    for (const id of ids) assert.match(groups.get(group), new RegExp(`data-tab="${id}"`), `${id} doit être dans ${group}`);
  }
  const team = read('team-admin.js');
  assert.match(team, /nav-group\[data-nav-group="team"\] \.nav-submenu/);
  assert.match(team, /data-tab="team-missions"/);
  const partnerAccounts = read('partner-accounts-admin.js');
  assert.match(partnerAccounts, /nav-group\[data-nav-group="partners"\] \.nav-submenu/);
  assert.match(partnerAccounts, /data-tab="partner-accounts"/);
  assert.match(html, /group=>\{group\.open=group\.contains\(b\)\}/);
});

test('les sous-menus restent utilisables au toucher sur petit écran', () => {
  const css = read('admin-responsive.css');
  assert.match(css, /\.nav-group>summary:focus-visible/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /flex-wrap:wrap/);
  assert.match(css, /\.nav-submenu button\{min-height:40px/);
});
