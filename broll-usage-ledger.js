// Idempotent, per-output-root history for a soft cross-reel stock-video bias.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ledgerPath(outputRoot) { return path.join(outputRoot, 'broll-usage-ledger.json'); }
function load(outputRoot) {
  const file = ledgerPath(outputRoot);
  if (!fs.existsSync(file)) return { version: 1, renders: {} };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.version !== 1 || !value.renders || typeof value.renders !== 'object') throw Error(`Invalid B-roll usage ledger: ${file}`);
  return value;
}
function counts(ledger) {
  const uses = {};
  for (const render of Object.values(ledger.renders)) for (const id of new Set(render.stock_ids || [])) uses[id] = (uses[id] || 0) + 1;
  return uses;
}
function record(outputRoot, outputVideo, placements) {
  const ledger = load(outputRoot);
  const key = path.resolve(outputVideo);
  ledger.renders[key] = {
    completed_at: new Date().toISOString(),
    stock_ids: [...new Set(placements.filter(p => p.type === 'video' && p.asset_id).map(p => p.asset_id))],
  };
  const file = ledgerPath(outputRoot), temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2));
  fs.renameSync(temp, file);
  return ledger.renders[key];
}
module.exports = { ledgerPath, load, counts, record };
