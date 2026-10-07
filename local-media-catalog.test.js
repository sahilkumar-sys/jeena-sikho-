'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('locally approved supplied clips appear in the planner catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heygen-media-catalog-'));
  const previous = process.env.PROJECT_ASSETS_DIR;
  try {
    const stockDir = path.join(root, 'broll-assets');
    fs.mkdirSync(stockDir);
    fs.writeFileSync(path.join(stockDir, 'asset-map.json'), JSON.stringify({ assets: {} }));
    fs.writeFileSync(path.join(stockDir, 'local-asset-map.json'), JSON.stringify({ assets: {
      U0001: 'owned-herbal-preparation.mp4',
      U0002: 'unapproved-inhaler.mp4',
    } }));
    fs.writeFileSync(path.join(root, 'local-approved-stock-ids.json'), JSON.stringify(['U0001']));
    fs.writeFileSync(path.join(stockDir, 'owned-herbal-preparation.mp4'), 'fixture');
    fs.writeFileSync(path.join(stockDir, 'unapproved-inhaler.mp4'), 'fixture');
    process.env.PROJECT_ASSETS_DIR = root;
    delete require.cache[require.resolve('./local-media-catalog')];
    const catalog = require('./local-media-catalog');
    assert.match(catalog.promptCatalog(), /U0001: owned herbal preparation/);
    assert.doesNotMatch(catalog.promptCatalog(), /U0002/);
    assert.equal(catalog.resolve({ media_type: 'stock_video', asset_id: 'U0001' }).asset_id, 'U0001');
    assert.equal(catalog.resolve({ media_type: 'stock_video', asset_id: 'U0002' }), null);
  } finally {
    if (previous === undefined) delete process.env.PROJECT_ASSETS_DIR;
    else process.env.PROJECT_ASSETS_DIR = previous;
    delete require.cache[require.resolve('./local-media-catalog')];
    fs.rmSync(root, { recursive: true, force: true });
  }
});
