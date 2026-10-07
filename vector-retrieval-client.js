// Optional local vector shortlist. The factory still works from the small
// approved local catalog when the host-side encoder is unavailable.
function queriesFromWords(words, duration) {
  const clean = (words || []).filter(w => Number.isFinite(Number(w.start)) && String(w.text || '').trim());
  const out = [];
  for (let center = 3; center < duration - 1; center += 7) {
    const near = clean.filter(w => Number(w.start) >= center - 2.5 && Number(w.start) < center + 3.5);
    if (near.length) out.push({ at: Number(center.toFixed(1)), text: near.slice(0, 18).map(w => String(w.text).trim()).join(' ') });
  }
  return out;
}
async function available(url = process.env.BROLL_RETRIEVAL_URL || 'http://host.docker.internal:8766/search') {
  try {
    const health = new URL(url); health.pathname = '/health';
    const response = await fetch(health, { signal: AbortSignal.timeout(1000) });
    return response.ok && Boolean((await response.json()).ready);
  } catch { return false; }
}
async function shortlistQueries(queries, url = process.env.BROLL_RETRIEVAL_URL || 'http://host.docker.internal:8766/search') {
  if (!queries.length) return null;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries, top_k: 5 }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length !== queries.length) throw Error('invalid response');
    const ids = new Set(), lines = [];
    for (const row of data.results) {
      const valid = (row.candidates || []).filter(c => /^B\d+$/.test(c.id) && typeof c.title === 'string').slice(0, 5);
      for (const c of valid) ids.add(c.id);
      lines.push(`${row.at}s: ${valid.map(c => `${c.id} ${c.title} [suggested in-point ${Number(c.in_point_seconds || 0).toFixed(1)}s]`).join(' | ') || 'no approved match'}`);
    }
    return { ids, hints: lines.join('\n'), query_count: queries.length };
  } catch (error) {
    process.stdout.write(`BROLL_VECTOR_FALLBACK=${String(error.message || error).slice(0, 120)}\n`);
    return null;
  }
}
async function shortlist(words, duration, url) { return shortlistQueries(queriesFromWords(words, duration), url); }
module.exports = { queriesFromWords, available, shortlistQueries, shortlist };
