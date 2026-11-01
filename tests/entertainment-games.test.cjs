const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('mini-jeux autonomes accessibles depuis Médias et divertissement', () => {
  const script = read('script.js');
  const games = read('games.html');
  assert.match(script, /class="entertainment-panel games-panel"/);
  assert.match(script, /href="games\.html\?v=20261101-mobile-62" target="_blank" rel="noopener noreferrer"/);
  assert.match(games, /<html lang="fr">/);
  assert.match(games, /href="index\.html#fun"/);
  assert.doesNotMatch(games, /<script[^>]+src=/i);
  const gameEntries = games.match(/\['[^']+','[^']+','[^']+','[^']+'\]/g) || [];
  assert.equal(gameEntries.length, 10);
});

test('habillage arcade coloré et animations avec respect du mouvement réduit', () => {
  const games = read('games.html');
  assert.match(games, /--game-accent:#/);
  assert.match(games, /@keyframes emoji-bob/);
  assert.match(games, /\.status\.celebrate::after/);
  assert.match(games, /classList\.toggle\('celebrate'/);
  assert.match(games, /@media\(prefers-reduced-motion:reduce\)/);
});
