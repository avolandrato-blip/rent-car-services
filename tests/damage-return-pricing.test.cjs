const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la fiche dégradation charge les tarifs de la voiture sélectionnée et calcule les montants', () => {
  const script = read('damage-return-pricing.js');
  const admin = read('admin.html');
  assert.match(admin, /damage-return-pricing\.js\?v=20261031-1/);
  assert.match(script, /from\('vehicle_damage_prices'\)/);
  assert.match(script, /\.eq\('vehicle_id', vehicleId\)/);
  assert.match(script, /quantity \* unitPrice/);
  assert.match(script, /rf-total/);
  assert.match(script, /rf-other-repair/);
});

test('les éléments sélectionnés et leurs prix sont enregistrés puis affichés dans le PDF', () => {
  const form = read('reference-models.js');
  const pricing = read('damage-return-pricing.js');
  assert.match(form, /damage_items:kind==='degradation'/);
  assert.match(form, /damage_items_total:Number\(val\('rf-repair'\)\)/);
  assert.match(form, /renderDamageItemsForPdf\(p\)/);
  assert.match(pricing, /Éléments de casse retenus/);
  assert.match(pricing, /unit_price/);
});
