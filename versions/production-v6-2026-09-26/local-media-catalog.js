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
  'B003', 'B006', 'B015', 'B019', 'B026', 'B030', 'B036', 'B037',
  'B039', 'B040', 'B045', 'B048', 'B050', 'B051', 'B054', 'B055',
  'B056', 'B070', 'B071', 'B077',
]);

function safeJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
const stocks = safeJson(path.join(stockDir, 'asset-map.json'), { assets: {} }).assets || {};
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
function promptCatalog() {
  return Object.entries(stocks).filter(([id, name]) => approvedStockIds.has(id) && fs.existsSync(path.join(stockDir, name)))
    .map(([id, name]) => `${id}: ${name.replace(/-20\d\d-.+$/, '').replace(/[-_]/g, ' ')}`).join('\n');
}
function promptProductCatalog() {
  return products.filter(item => item?.id && item?.name && item?.image_file && fs.existsSync(path.join(productDir, item.image_file)))
    .map(item => `P${item.id}: ${String(item.name).split('|')[0].trim()}`)
    .filter(line => !/P\d+:\s*$/.test(line)).join('\n');
}
module.exports = { resolve, promptCatalog, promptProductCatalog, productMatch };
