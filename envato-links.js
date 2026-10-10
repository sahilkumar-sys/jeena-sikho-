// One-click Envato Elements searches for a Quality-mode stop.
// Envato Elements has no public download API and its Fair Use Policy forbids
// scripted downloads, so the user downloads while logged in; we only open the
// searches and collect the downloaded files (Collect-Envato-Downloads.ps1).
const fs = require('fs');
const path = require('path');
const { atomicWrite, writeJson } = require('./factory-state');

const ELEMENTS = 'https://elements.envato.com/stock-video/';
// Only these URLs are ever written into the double-click .cmd file (no %, &, quotes).
const SAFE_URL = /^https:\/\/elements\.envato\.com\/stock-video\/[a-z0-9-]{1,80}(?:\/orientation-vertical)?$/;
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'with', 'his', 'her', 'its', 'is', 'are', 'from', 'for', 'by']);

function envatoSlug(term) {
  const slug = String(term || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return slug || null;
}

// Keyword search first (Envato matches short searches best), then the longer description.
function envatoSearch(searchTerms = []) {
  const term = searchTerms[1] || searchTerms[0] || '';
  const slug = envatoSlug(term);
  if (!slug) return null;
  return { term, slug, vertical: `${ELEMENTS}${slug}/orientation-vertical`, any: `${ELEMENTS}${slug}` };
}

function tokens(text) {
  return [...new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))];
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function linksHtml(list) {
  const rows = list.beats.filter(b => b.envato_search).map(b => `
    <tr><td class="n">${b.n}</td><td>${escapeHtml(b.time)}</td><td lang="hi">${escapeHtml(b.spoken)}</td><td>${escapeHtml(b.english)}</td>
    <td><a href="${escapeHtml(b.envato_search.vertical)}" target="_blank" rel="noopener">Vertical clips</a><br><a href="${escapeHtml(b.envato_search.any)}" target="_blank" rel="noopener">All clips</a></td>
    <td>&ge; ${b.min_clip_seconds} s</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Envato clips needed</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;color:#1d1d1f;background:#fafafa;line-height:1.45}
h1{font-size:22px;margin:0 0 6px}p{max-width:900px}table{border-collapse:collapse;width:100%;max-width:1100px;background:#fff}
th,td{border:1px solid #ddd;padding:8px 10px;text-align:left;vertical-align:top}th{background:#f0f0f0}td.n{font-weight:700;text-align:center}
a{color:#0b57d0;font-weight:600}.note{background:#fff8e1;border:1px solid #f0d78c;padding:10px 12px;max-width:900px}
</style></head><body>
<h1>Envato clips needed — ${escapeHtml(list.video)}</h1>
<p>${list.required ? '<strong>Quality mode: this video was not rendered.</strong> These moments need a real video clip.' : 'Quantity mode: the video was rendered. These clips are optional upgrades.'}</p>
<p class="note">Fastest way: double-click <strong>Open-Envato-Links.cmd</strong> in the job's inbox folder. It opens every search below and a small window that moves your downloads into the inbox and labels them. Download while logged in to Envato Elements; clips at least as long as shown; vertical is best. Putting a clip in the inbox means you approve it (licence and people in it).</p>
<table><thead><tr><th>#</th><th>Time</th><th>Spoken words</th><th>What to show</th><th>Envato search</th><th>Length</th></tr></thead><tbody>${rows}
</tbody></table></body></html>
`;
}

// Windows batch file: opens each search in the browser, then starts the download collector.
function openerCmd(list, collectorRelative) {
  const urls = list.beats.map(b => b.envato_search?.vertical).filter(Boolean);
  for (const url of urls) if (!SAFE_URL.test(url)) throw new Error(`Unsafe Envato URL refused: ${url}`);
  const lines = [
    '@echo off',
    `rem Opens ${urls.length} Envato Elements searches and starts the download collector for this video.`,
    'rem To use a specific browser, put its name or full path after BROWSER= (empty = your default browser), e.g. set "BROWSER=chrome"',
    'set "BROWSER="',
    ...urls.map(url => `call :open "${url}"`),
  ];
  if (collectorRelative) {
    lines.push(`start "Envato download collector" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${collectorRelative}" -Inbox "%~dp0."`);
  } else {
    lines.push('echo Download the clips, then move them into this folder.', 'pause');
  }
  lines.push('exit /b', ':open', 'if defined BROWSER (start "" "%BROWSER%" "%~1") else (start "" "%~1")', 'exit /b', '');
  return lines.join('\r\n');
}

// What the collector needs to label downloads: moment number, slug and match words.
function momentsForCollector(list) {
  return list.beats.filter(b => b.envato_search).map(b => ({
    n: b.n, slug: b.envato_search.slug, english: b.english,
    words: tokens(`${b.english} ${(b.search_terms || []).join(' ')}`),
  }));
}

// Path from the inbox to the project's collector script, or null when the inbox is outside the project.
function collectorRelativePath(inboxDir, projectRoot) {
  const relative = path.relative(path.resolve(inboxDir), path.resolve(projectRoot));
  if (path.isAbsolute(relative) || !path.resolve(inboxDir).startsWith(path.resolve(projectRoot))) return null;
  return `${relative ? `${relative.split(path.sep).join('\\')}\\` : ''}Collect-Envato-Downloads.ps1`;
}

function writeLinksPage(dir, list) {
  const file = path.join(dir, 'envato-links.html');
  atomicWrite(file, linksHtml(list));
  return file;
}

function writeInboxHelpers(inboxDir, list, projectRoot) {
  fs.mkdirSync(inboxDir, { recursive: true });
  const opener = path.join(inboxDir, 'Open-Envato-Links.cmd');
  atomicWrite(opener, openerCmd(list, collectorRelativePath(inboxDir, projectRoot)));
  writeJson(path.join(inboxDir, 'envato-moments.json'), momentsForCollector(list));
  return { opener, page: writeLinksPage(inboxDir, list) };
}

module.exports = { envatoSlug, envatoSearch, linksHtml, openerCmd, momentsForCollector, collectorRelativePath, writeLinksPage, writeInboxHelpers, SAFE_URL };
