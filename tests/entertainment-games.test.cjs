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
  assert.match(script, /href="games\.html\?v=20261101-snake-swipe" target="_blank" rel="noopener noreferrer"/);
  assert.match(script, /Morpion, Snake, Memory/);
  assert.match(games, /<html lang="fr">/);
  assert.match(games, /href="index\.html\?v=20261101-snake-swipe#fun"/);
  assert.doesNotMatch(games, /<script[^>]+src=/i);
  const gameEntries = games.match(/\['[^']+','[^']+','[^']+','[^']+'\]/g) || [];
  assert.equal(gameEntries.length, 10);
  assert.ok(gameEntries.some(entry => entry.includes("'Memory'")));
  assert.ok(!gameEntries.some(entry => /Ludo|ludo/.test(entry)));
});

test('Snake accepte les glissements tactiles, les boutons et le clavier', () => {
  const games = read('games.html');
  assert.match(games, /addEventListener\('pointerdown'/);
  assert.match(games, /addEventListener\('pointerup'/);
  assert.match(games, /Glisse sur le plateau/);
  assert.match(games, /id="dirs"/);
  assert.match(games, /ArrowUp/);
});

test('Memory a une grille de cartes et des paires emoji', () => {
  const games = read('games.html');
  assert.match(games, /function memory\(\)/);
  assert.match(games, /memory-board/);
  assert.match(games, /Classique · 6 paires/);
  assert.match(games, /Défi · 8 paires/);
  assert.match(games, /aria-pressed/);
});

test('habillage arcade coloré et animations avec respect du mouvement réduit', () => {
  const games = read('games.html');
  assert.match(games, /--game-accent:#/);
  assert.match(games, /@keyframes emoji-bob/);
  assert.match(games, /\.status\.celebrate::after/);
  assert.match(games, /classList\.toggle\('celebrate'/);
  assert.match(games, /@media\(prefers-reduced-motion:reduce\)/);
});
