const fs = require('fs');
const path = require('path');

const root = process.env.PROJECT_ASSETS_DIR || __dirname;
const stockDir = path.join(root, 'broll-assets');
const productDir = path.join(root, 'product-assets');
const referenceDir = path.join(root, 'reference-assets');
const special = {
  youtube: 'acharya-youtube-profile.png',
  facebook: 'acharya-facebook-profile.png',
  hospital: 'hiims-meerut-hospital.png',
};
// These local clips show no identifiable foreign people. Expand this list only
// after visually checking a clip for both its content and cultural fit.
const approvedStockIds = new Set([
  ...require('./approved-stock-ids.json'),
  ...safeJson(path.join(root, 'local-approved-stock-ids.json'), []),
]);

function safeJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
const stocks = {
  ...(safeJson(path.join(stockDir, 'asset-map.json'), { assets: {} }).assets || {}),
  ...(safeJson(path.join(stockDir, 'local-asset-map.json'), { assets: {} }).assets || {}),
};
const products = safeJson(path.join(productDir, 'catalog.json'), []);

function normalize(value) {
  return String(value || '').normalize('NFC').toLowerCase()
    .replace(/डॉक्टर|डाक्टर|डॉ\.?/g, 'dr').replace(/माँ|मां/g, 'maa').replace(/पापा|पिताजी|पा/g, 'paa')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}
function productMatch(query) {
  const normalized = normalize(query);
  const catalogId = /^p0*(\d+)$/i.exec(String(query || '').trim());
  if (catalogId) return products.find(item => item.id === Number(catalogId[1])) || null;
  if (/\bmaa\b/.test(normalized) && /\bpaa\b/.test(normalized)) return products.find(item => item.id === 79) || null;
  if (/\bmaa\b/.test(normalized)) return products.find(item => item.id === 111) || null;
  if (/\bpaa\b/.test(normalized)) return products.find(item => item.id === 112) || null;
  const words = normalize(query).split(/\s+/).filter(x => x.length >= 2 && !['product', 'combo', 'care', 'jeena', 'sikho'].includes(x));
  if (!words.length) return null;
  const ranked = products.map(item => {
    const title = normalize(item.name);
    const overlap = words.filter(word => title.split(/\s+/).includes(word)).length;
    return { item, score: overlap / words.length, overlap };
  }).filter(x => x.overlap >= Math.min(2, words.length) && x.score >= 0.8)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
  return ranked[0]?.item || null;
}
function resolve(item) {
  if (item.media_type === 'stock_video' && approvedStockIds.has(item.asset_id)) {
    const name = stocks[item.asset_id];
    const file = name && path.join(stockDir, name);
    if (file && fs.existsSync(file)) return { path: file, type: 'video', category: 'stock', asset_id: item.asset_id };
  }
  if (item.media_type === 'product' && item.product_query) {
    const product = productMatch(item.product_query);
    if (product) {
      const base = `product-${String(product.id).padStart(3, '0')}`;
      const hires = ['jpg', 'png', 'webp'].map(ext => path.join(productDir, 'hires', `${base}.${ext}`)).find(fs.existsSync);
      const file = hires || path.join(productDir, product.image_file);
      if (fs.existsSync(file)) return { path: file, type: 'image', category: 'product', product_id: product.id, product_name: product.name };
    }
  }
  if (item.media_type === 'social' && ['youtube', 'facebook'].includes(item.asset_id)) {
    const file = path.join(referenceDir, special[item.asset_id]);
    if (fs.existsSync(file)) return { path: file, type: 'image', category: 'social', asset_id: item.asset_id };
  }
  if (item.media_type === 'hospital') {
    const file = path.join(referenceDir, special.hospital);
    if (fs.existsSync(file)) return { path: file, type: 'image', category: 'hospital', asset_id: 'hiims-meerut' };
  }
  return null;
}
function promptCatalog(uses = {}, allowedIds = null) {
  const seen = new Set();
  return Object.entries(stocks).filter(([id, name]) => {
    if (!approvedStockIds.has(id) || (allowedIds && !allowedIds.has(id)) || !fs.existsSync(path.join(stockDir, name)) || seen.has(name.toLowerCase())) return false;
    seen.add(name.toLowerCase());
    return true;
  }).sort(([a], [b]) => (uses[a] || 0) - (uses[b] || 0) || a.localeCompare(b))
    .map(([id, name]) => `${id}: ${name.replace(/-20\d\d-.+$/, '').replace(/[-_]/g, ' ')}${uses[id] ? ` [used in ${uses[id]} prior reels]` : ''}`).join('\n');
}
function promptProductCatalog() {
  return products.filter(item => item?.id && item?.name && item?.image_file && fs.existsSync(path.join(productDir, item.image_file)))
    .map(item => `P${item.id}: ${String(item.name).split('|')[0].trim()}`)
    .filter(line => !/P\d+:\s*$/.test(line)).join('\n');
}
const KEYWORD_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'about', 'video', 'shot', 'person', 'people', 'indian', 'utc', 'close', 'view']);
function keywordTokens(value) {
  return new Set((String(value || '').toLowerCase().match(/[a-z]{3,}/g) || [])
    .filter(word => !KEYWORD_STOP.has(word))
    .map(word => word.replace(/(?:ing|ed|es|s)$/, '')).filter(word => word.length >= 3));
}
// Keyword fallback when the vector service is down: match English visual
// queries against approved clip names/folders so the planner never loses video.
function keywordShortlist(queries, uses = {}, topK = 5) {
  const clips = Object.entries(stocks).filter(([id, name]) => approvedStockIds.has(id) && fs.existsSync(path.join(stockDir, name)))
    .map(([id, name]) => ({ id, title: name.replace(/-20\d\d-.+$/, '').replace(/[-_]/g, ' '), tokens: keywordTokens(name.replace(/-20\d\d-.+$/, '')) }));
  return queries.map(query => {
    const wanted = keywordTokens(query.text);
    const needed = Math.min(2, wanted.size);
    const candidates = wanted.size ? clips.map(clip => {
      const overlap = [...wanted].filter(word => clip.tokens.has(word)).length;
      return { id: clip.id, title: clip.title, overlap, score: overlap / wanted.size };
    }).filter(c => c.overlap >= needed && c.overlap > 0)
      .sort((a, b) => b.score - a.score || (uses[a.id] || 0) - (uses[b.id] || 0) || a.id.localeCompare(b.id))
      .slice(0, topK) : [];
    return { at: query.at, end: query.end, candidates };
  });
}
module.exports = { resolve, promptCatalog, promptProductCatalog, productMatch, keywordShortlist };
