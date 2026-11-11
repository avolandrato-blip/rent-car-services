const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('l’attribution exige un compte chauffeur et prépare un lien wa.me avec acceptation/refus', () => {
  const admin = read('team-admin.js');
  assert.match(admin, /\.rpc\('assign_chauffeur_mission'/);
  assert.match(admin, /driver\.auth_user_id/);
  assert.match(admin, /readyDrivers=activeDrivers\.filter/);
  assert.match(admin, /missionForm\.noValidate=true/);
  assert.match(admin, /form\.checkValidity\(\)/);
  assert.match(admin, /Impossible de préparer le récapitulatif/);
  assert.match(admin, /chauffeur\(s\) prêt\(s\)/);
  assert.match(admin, /Aucune réservation confirmée — confirmez-la d’abord/);
  assert.match(admin, /acceptance_token_hash/);
  assert.match(admin, /team-action\.html/);
  assert.match(admin, /response','accept/);
  assert.match(admin, /response','refuse/);
  assert.match(admin, /https:\/\/wa\.me\//);
  assert.match(admin, /window\.open\('about:blank','_blank'\)/, 'WhatsApp tab is opened synchronously from the confirmation click');
  assert.match(admin, /whatsappWindow\.location\.href=messageData\.url/, 'the prepared wa.me link is opened automatically after assignment');
  assert.match(admin, /Reste à percevoir/);
  assert.match(admin, /Appuyez sur Envoyer dans WhatsApp/);
  assert.match(admin, /Le mot de passe initial vous sera remis séparément/);
});

test('le lien public attend un clic de confirmation et appelle le RPC à jeton à usage unique', () => {
  const action = read('team-action.js');
  assert.match(action, /history\.replaceState/);
  assert.equal((action.match(/\.rpc\('respond_to_chauffeur_mission'/g)||[]).length, 1);
  assert.match(action, /addEventListener\('click', submitResponse\)/);
});

test('le dashboard chauffeur gère la réponse directe, les deux états des lieux et leurs photos', () => {
  const team = read('team.js');
  const html = read('team.html');
  assert.match(team, /respond_to_chauffeur_mission_as_driver/);
  assert.match(team, /openChecklist\(mission,'departure'\)/);
  assert.match(team, /openChecklist\(mission,'return'\)/);
  for (const photo of ['front','rear','side','wheel','dashboard','cin','license']) assert.ok(team.includes(`'${photo}'`), `missing photo slot ${photo}`);
  assert.match(html, /checklist-cash/);
  assert.match(html, /checklist-fuel/);
  assert.match(html, /checklist-cin-seen" type="checkbox" required/);
  assert.match(html, /checklist-license-seen" type="checkbox" required/);
  assert.match(html, /driver-behavior/);
});

test('la migration protège les liens, les échéances et les photos privées, et ferme le droit chauffeur trop large', () => {
  const sql = read('supabase/migrations/20261110100000_chauffeur_mission_workflow.sql');
  assert.match(sql, /status in \('assigned','accepted','refused'/);
  assert.match(sql, /acceptance_token_hash/);
  assert.match(sql, /respond_to_chauffeur_mission\(/);
  assert.match(sql, /public\.reservation_daily_dues/);
  assert.match(sql, /validate_reservation_daily_due_payment/);
  assert.match(sql, /public = false/);
  assert.match(sql, /chauffeur_mission_checklists_driver_write/);
  assert.match(sql, /drop policy if exists chauffeurs_authenticated_manage/);
  assert.match(sql, /chauffeurs_admin_manage/);
  assert.doesNotMatch(sql, /using \(true\)/i);
  const hardening = read('supabase/migrations/20261110104000_restrict_due_trigger_execution.sql');
  assert.match(hardening, /revoke all on function public\.validate_reservation_daily_due_payment\(\) from public, anon, authenticated/);
  assert.match(hardening, /chauffeur_mission_checklists_submitted_by_idx/);
  assert.match(hardening, /chauffeur_missions_responded_by_idx/);
});

test('l’administration enregistre un règlement quotidien avec sa date d’échéance', () => {
  const admin = read('team-admin.js');
  assert.match(admin, /window\.recordPayment = async function/);
  assert.match(admin, /due_date:dueDate/);
  assert.match(admin, /reservation_daily_dues/);
});
