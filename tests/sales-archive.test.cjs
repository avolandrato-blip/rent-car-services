const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
test('une page séparée de vente est publiée avec les vues et la checklist', () => {
  const page=read('sell.html');
  assert.match(page, /id="sale-form"/); assert.match(page, /data-sale-photo="front"/); assert.match(page, /data-sale-photo="interior_rear"/);
  assert.match(page, /sale-registration/); assert.match(page, /sale-pink-card/); assert.match(page, /sale-model-1/);
});
test('les demandes de vente sont stockées et archivées dans Supabase', () => {
  assert.match(read('sale.js'), /from\('vehicle_sales'\)/); assert.match(read('sale.js'), /from\('vehicle-sales'\)/);
  assert.match(read('admin.html'), /data-tab="archive"/); assert.match(read('archive-admin.js'), /status==='contract_ended'/);
});
test('un véhicule en fin de contrat est exclu de la liste publique', () => {
  assert.match(read('script.js'), /neq\('status', 'contract_ended'\)/); assert.match(read('script.js'), /localCars\.filter\(car => car\.status !== 'contract_ended'\)/);
});
