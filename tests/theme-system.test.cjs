const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le sélecteur partagé clair/sombre est installé sur toutes les pages principales', () => {
  for (const page of ['index.html', 'sell.html', 'admin.html', 'team.html', 'team-action.html', 'games.html', 'confidentialite.html']) {
    const html = read(page);
    assert.match(html, /theme-system\.css/ , `${page}: stylesheet partagé absent`);
    assert.match(html, /theme-system\.js/ , `${page}: contrôleur partagé absent`);
  }
});

test('le contrôleur mémorise et synchronise les deux choix entre pages et onglets', () => {
  const js = read('theme-system.js');
  assert.match(js, /rentcar-theme-mode/);
  assert.match(js, /localStorage\.setItem\(MODE_KEY, selected\)/);
  assert.match(js, /storage/);
  assert.match(js, /data-theme-choice/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /premium-white/);
  assert.match(js, /royal-night/);
});

test('le choix mémorisé est actif dès le premier rendu et les clics persistent', () => {
  const storage = new Map([['rentcar-theme-mode', 'dark']]);
  const groups = [];
  const windowListeners = {};
  function createElement(tag) {
    return {
      tag, dataset: {}, attributes: {}, children: [], listeners: {}, className: '',
      classList: {
        values: new Set(),
        add(value) { this.values.add(value); },
        toggle(value, active) { active ? this.values.add(value) : this.values.delete(value); },
        contains(value) { return this.values.has(value); },
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      append(...children) {
        this.children.push(...children);
        if (this.className === 'rc-theme-switcher' && !groups.includes(this)) groups.push(this);
      },
      querySelectorAll(selector) {
        if (selector === '[data-theme-choice]') return this.children.filter(child => child.dataset.themeChoice);
        return [];
      },
      querySelector() { return null; },
    };
  }
  const document = {
    readyState: 'complete',
    documentElement: { dataset: {} },
    body: { dataset: {}, append(group) { if (!groups.includes(group)) groups.push(group); } },
    createElement,
    querySelectorAll(selector) { return selector === '.rc-theme-switcher' ? groups : []; },
    addEventListener() {},
  };
  const window = { addEventListener(name, callback) { windowListeners[name] = callback; } };
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
  };
  vm.runInNewContext(read('theme-system.js'), { document, window, localStorage });

  assert.equal(document.body.dataset.theme, 'royal-night');
  assert.equal(groups.length, 1);
  const [light, dark] = groups[0].children;
  assert.equal(dark.attributes['aria-pressed'], 'true');
  assert.equal(dark.classList.contains('is-active'), true);
  light.listeners.click();
  assert.equal(document.documentElement.dataset.theme, 'premium-white');
  assert.equal(light.attributes['aria-pressed'], 'true');
  assert.equal(storage.get('rentcar-theme-mode'), 'light');
  assert.equal(storage.get('rentcar-theme'), 'premium-white');
  storage.set('rentcar-theme-mode', 'dark');
  windowListeners.storage({ key: 'rentcar-theme-mode' });
  assert.equal(document.body.dataset.theme, 'royal-night');
});

test('les palettes distinguent fond, surfaces, texte et bordures', () => {
  const css = read('theme-system.css');
  for (const token of ['--ui-page', '--ui-surface', '--ui-surface-soft', '--ui-text', '--ui-muted', '--ui-border', '--ui-primary', '--ui-accent']) {
    assert.ok(css.includes(token), `jeton de palette manquant : ${token}`);
  }
  assert.match(css, /html\[data-theme="royal-night"\][\s\S]*?color-scheme: dark/);
  assert.match(css, /html\[data-theme="premium-white"\][\s\S]*?color-scheme: light/);
  assert.match(css, /\.game-card/);
  assert.match(css, /\.calendar-day/);
});

test('les boutons et les cartes reçoivent un relief, un état pressé et un focus visible', () => {
  const css = read('theme-system.css');
  assert.match(css, /box-shadow: 0 4px 0 var\(--ui-button-edge\)/);
  assert.match(css, /box-shadow: inset 0 1px 0/);
  assert.match(css, /:active/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('les anciennes bascules horaires ne remplacent plus le choix manuel', () => {
  const main = read('script.js');
  const enhancement = read('enhancements.js');
  const sale = read('sell.html');
  assert.match(main, /mode === "dark"[\s\S]*?mode === "light"/);
  assert.doesNotMatch(enhancement, /autoTheme\(\);\s*setInterval\(autoTheme/);
  assert.doesNotMatch(sale, /applyAutoTheme|rentcar-theme-mode', 'auto'/);
});
